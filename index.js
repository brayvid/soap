// Copyright 2024-2025 soap.fyi <https://soap.fyi>

// Imports rate limit utilities and logging middleware
const { isUnderLimit, logAction } = require('./middleware/ipRateLimit');

require('dotenv').config();
const express = require('express');
const vader = require('vader-sentiment'); // Still needed for fallback or if a word is new
const path = require('path');
const db = require('./db'); // Our knex instance

// Simple in-memory mutex to prevent concurrent rate limit bypass
const locks = new Map();

async function rateLimitedAction(ip, action, politicianId, callback) {
  const key = `${ip}-${politicianId}`;

  while (locks.get(key)) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  locks.set(key, true);
  try {
    const allowed = await isUnderLimit(ip, action, politicianId);
    if (!allowed) return { allowed: false };

    await callback(); // vote logic
    await logAction(ip, action, politicianId);
    return { allowed: true };
  } finally {
    locks.delete(key);
  }
}

// Looks up a user by IP address or creates a new user if not found
async function getOrCreateUserIdFromIP(ip) {
  const existingUser = await db('users').where({ ip }).first();
  if (existingUser) return existingUser.id;

  const username = `user_${ip.replace(/\./g, '_')}`;
  const email = `${ip.replace(/\./g, '-') + '@autogen.local'}`;
  const password_hash = 'ip-only-no-password';

  const [newUser] = await db('users')
    .insert({ ip, username, email, password_hash })
    .returning('*');
  return newUser.id;
}

const app = express();
app.set('trust proxy', true);
app.use(express.json());

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress).trim();
}

app.use(express.static(path.join(__dirname, 'public')));

// --- MODIFIED /politicians Endpoint ---
app.get('/politicians', async (req, res) => {
  try {
    const politicians = await db('politicians').select('*');

    const enrichedPoliticians = await Promise.all(
      politicians.map(async p => {
        const [{ count: voteCount }] = await db('votes')
          .where('politician_id', p.politician_id)
          .count('vote_id as count');

        // Get top 3 words with their stored sentiment scores
        const topWordRows = await db('votes')
          .join('words', 'votes.word_id', '=', 'words.word_id')
          .where('votes.politician_id', p.politician_id)
          .select('words.word', 'words.sentiment_score')
          .groupBy('words.word', 'words.sentiment_score')
          .count('* as appearances')
          .orderBy('appearances', 'desc')
          .limit(3);

        // Get top 50 words for searching
        const searchWordRows = await db('votes')
          // ... (same as before) ...
          .join('words', 'votes.word_id', '=', 'words.word_id')
          .where('votes.politician_id', p.politician_id)
          .select('words.word')
          .groupBy('words.word')
          .count('* as appearances')
          .orderBy('appearances', 'desc')
          .limit(50);

        // --- NEW: Calculate Average Sentiment Score ---
        let averageSentimentScore = 0.0;
        const allVotesForPoliticianWithScores = await db('votes')
          .join('words', 'votes.word_id', '=', 'words.word_id')
          .where('votes.politician_id', p.politician_id)
          .select('words.sentiment_score');

        if (allVotesForPoliticianWithScores.length > 0) {
          const sumOfScores = allVotesForPoliticianWithScores.reduce((sum, vote) => {
            // Ensure score is a number, default to 0 if null/undefined
            const score = (typeof vote.sentiment_score === 'number' && vote.sentiment_score !== null) ? vote.sentiment_score : 0;
            return sum + score;
          }, 0);
          averageSentimentScore = sumOfScores / allVotesForPoliticianWithScores.length;
        }
        // --- END NEW ---

        return {
          ...p,
          vote_count: parseInt(voteCount) || 0,
          top_words: topWordRows.map(w => { // <--- FOCUS HERE
            let sentimentCategory = 'gray';
            const scoreToUse = (w.sentiment_score === null || typeof w.sentiment_score === 'undefined')
                               ? vader.SentimentIntensityAnalyzer.polarity_scores(w.word).compound
                               : w.sentiment_score;

            if (scoreToUse >= 0.1) sentimentCategory = 'green';
            else if (scoreToUse <= -0.1) sentimentCategory = 'red';
            
            return { 
                word: w.word, 
                sentiment: sentimentCategory, // 'green', 'red', 'gray'
                score: parseFloat(scoreToUse.toFixed(4)) // ADD THE NUMERIC SCORE
            };
          }),
          search_words: searchWordRows.map(w => w.word),
        };

      })
    );

    res.json(enrichedPoliticians.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0)));
  } catch (err) {
    console.error('Error fetching politicians:', err);
    res.status(500).send('Error fetching politicians');
  }
});

// POST /politicians (remains the same as your original)
app.post('/politicians', async (req, res) => {
  const { name, position } = req.body;
  const ip = getClientIP(req);

  if (!name || !position) {
    return res.status(400).send('Missing name or position');
  }

  const underLimit = await isUnderLimit(ip, 'add_politician', null, 1);
  if (!underLimit) {
    return res.status(429).send('Rate limit exceeded for this IP');
  }

  try {
    const existing = await db('politicians').where({ name }).first();
    if (existing) {
      return res.status(409).json({ error: 'Politician already exists' });
    }
    const userId = await getOrCreateUserIdFromIP(ip);
    const [newPolitician] = await db('politicians')
      .insert({ name, position, user_id: userId })
      .returning('*');
    await logAction(ip, 'add_politician', null);
    res.status(201).json(newPolitician);
  } catch (err) {
    console.error('Error adding politician:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// --- MODIFIED /politician/:id/data Endpoint ---
app.get('/politician/:id/data', async (req, res) => {
  const { id } = req.params;

  try {
    const politician = await db('politicians').where({ politician_id: id }).first();

    if (!politician) {
      return res.status(404).send('Politician not found');
    }

    // Fetch all words from the 'words' table, including their stored sentiment_score
    const allWordsFromDb = await db('words').select('word_id', 'word', 'sentiment_score');
    const votesForThisPolitician = await db('votes').where({ politician_id: id });

    // Create a map for quick lookup of word details (including sentiment_score) by word_id
    const wordDetailsMap = new Map();
    allWordsFromDb.forEach(w => wordDetailsMap.set(w.word_id, {
        word: w.word,
        sentiment_score: w.sentiment_score
    }));

    // Count votes for each word for this politician
    const wordVoteCounts = {}; // Key: word_text, Value: count
    votesForThisPolitician.forEach(vote => {
      const wordDetail = wordDetailsMap.get(vote.word_id);
      if (wordDetail) {
        wordVoteCounts[wordDetail.word] = (wordVoteCounts[wordDetail.word] || 0) + 1;
      }
    });
    
    // Create the detailed words array for the response
    const detailedWordsResponse = [];
    for (const wordText in wordVoteCounts) {
        if (Object.prototype.hasOwnProperty.call(wordVoteCounts, wordText)) { // Safer hasOwnProperty check
            const count = wordVoteCounts[wordText];
            // Find the original word object from our comprehensive list to get its sentiment_score
            // This assumes word texts are unique (case-insensitively, though DB stores lowercase)
            const wordObjFromDbList = allWordsFromDb.find(w => w.word.toLowerCase() === wordText.toLowerCase());
            
            let finalSentimentScore = 0.0; // Default
            let sentimentCategory = 'gray';

            if (wordObjFromDbList && typeof wordObjFromDbList.sentiment_score === 'number' && wordObjFromDbList.sentiment_score !== null) {
                finalSentimentScore = wordObjFromDbList.sentiment_score;
            } else {
                // Fallback to VADER if sentiment_score is not in DB (e.g., word added before column, or NULL from backfill failure)
                // console.warn(`Word "${wordText}" for politician ${id} missing DB sentiment_score or it's null. Using VADER fallback.`);
                finalSentimentScore = vader.SentimentIntensityAnalyzer.polarity_scores(wordText).compound;
            }

            if (finalSentimentScore >= 0.1) sentimentCategory = 'green';
            else if (finalSentimentScore <= -0.1) sentimentCategory = 'red';

            detailedWordsResponse.push({
                word: wordText,
                count: count,
                sentiment: sentimentCategory,
                sentiment_score: parseFloat(finalSentimentScore.toFixed(4)), // Send the score used
            });
        }
    }

    res.json({
      politician,
      votesForPolitician: detailedWordsResponse,
    });
  } catch (err) {
    console.error(`Error loading politician data for ID ${id}:`, err);
    res.status(500).send('Error loading politician data');
  }
});


// POST /words (remains mostly the same, ensures sentiment_score is stored on new word creation)
app.post('/words', async (req, res) => {
  const { word, politician_id } = req.body;
  const ip = getClientIP(req);

  if (!word || !politician_id) {
    return res.status(400).send('Missing word or politician ID');
  }

  const result = await rateLimitedAction(ip, 'submit_vote', politician_id, async () => {
    let wordEntry = await db('words')
      .whereRaw('LOWER(word) = ?', word.toLowerCase())
      .first();

    const userId = await getOrCreateUserIdFromIP(ip);

    if (!wordEntry) {
      // Perform sentiment analysis for NEW words
      const vaderResult = vader.SentimentIntensityAnalyzer.polarity_scores(word);
      const sentimentScore = parseFloat(vaderResult.compound.toFixed(4)); // Store with precision

      const [row] = await db('words')
        .insert({
          word: word.toLowerCase(), // Store lowercase
          user_id: userId,
          sentiment_score: sentimentScore, // Store initial VADER score
        })
        .returning('*');
      wordEntry = row;
    }
    // If wordEntry exists, its sentiment_score is ALREADY in the DB (and possibly updated by backfill)
    // We don't re-calculate or overwrite it here.

    await db('votes').insert({
      politician_id,
      word_id: wordEntry.word_id,
      user_id: userId,
    });
  });

  if (!result.allowed) {
    return res.status(429).send('Rate limit exceeded for this politician');
  }

  res.status(201).send('Word submitted and vote added');
});

// GET / (remains the same)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GET /politician/:id (remains the same as your original)
app.get('/politician/:id', async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
  try {
    const politician = await db('politicians')
      .where({ politician_id: Number(id) })
      .first();
    if (!politician) {
      return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    }
    res.sendFile(path.join(__dirname, 'public', 'politician.html'));
  } catch (err) {
    console.error('Error checking politician:', err);
    res.status(500).send('Error loading politician');
  }
});

// POST /sentiment (remains the same as your original)
app.post('/sentiment', (req, res) => {
  const { word } = req.body;
  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid word' });
  }
  try {
    const result = vader.SentimentIntensityAnalyzer.polarity_scores(word);
    res.json(result);
  } catch (err) {
    console.error('Sentiment analysis failed:', err);
    res.status(500).json({ error: 'Sentiment analysis failed' });
  }
});

// Catch-all route (remains the same)
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Server start (remains the same)
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});