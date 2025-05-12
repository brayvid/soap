// Copyright 2024-2025 soap.fyi <https://soap.fyi>

// Imports rate limit utilities and logging middleware
const { isUnderLimit, logAction } = require('./middleware/ipRateLimit');

require('dotenv').config();
const express = require('express');
const vader = require('vader-sentiment');
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
  // Check if a user already exists for this IP
  const existingUser = await db('users').where({ ip }).first();
  if (existingUser) return existingUser.id;

  // Generate fallback values
  const username = `user_${ip.replace(/\./g, '_')}`;
  const email = `${ip.replace(/\./g, '-') + '@autogen.local'}`;
  const password_hash = 'ip-only-no-password';

  // Insert a new user for this IP
  const [newUser] = await db('users')
    .insert({
      ip,
      username,
      email,
      password_hash
    })
    .returning('*');

  return newUser.id;
}

const app = express();
app.set('trust proxy', true); // Support reverse proxies
app.use(express.json());  // Parse JSON request bodies

// Extracts the client's IP address, respecting proxies
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress).trim();
}

// Serves all files from the public directory (e.g., index.html, JS, CSS)
app.use(express.static(path.join(__dirname, 'public')));

// GET /politicians
// Returns all politicians, including vote count, top 3 words, and top 50 words for searching
app.get('/politicians', async (req, res) => {
  try {
    const politicians = await db('politicians').select('*');

    const enriched = await Promise.all(
      politicians.map(async p => {
        // Get vote count
        const [{ count }] = await db('votes')
          .where('politician_id', p.politician_id)
          .count('vote_id as count');

        // Get top 50 words by frequency
        const wordRows = await db('votes')
          .join('words', 'votes.word_id', '=', 'words.word_id')
          .where('votes.politician_id', p.politician_id)
          .select('words.word')
          .groupBy('words.word')
          .count('* as count')
          .orderBy('count', 'desc')
          .limit(50);

        return {
          ...p,
          vote_count: parseInt(count),
          top_words: wordRows.slice(0, 3).map(w => {
            const score = vader.SentimentIntensityAnalyzer.polarity_scores(w.word).compound;
            let sentiment = 'gray';
            if (score >= 0.1) sentiment = 'green';
            else if (score <= -0.1) sentiment = 'red';
            return { word: w.word, sentiment };
          }),          
          search_words: wordRows.map(w => w.word), // for frontend filtering
        };
      })
    );

    res.json(enriched.sort((a, b) => b.vote_count - a.vote_count));
  } catch (err) {
    console.error('Error fetching politicians:', err);
    res.status(500).send('Error fetching politicians');
  }
});

// POST /politicians
// Adds a new politician if not a duplicate, with IP rate limiting
app.post('/politicians', async (req, res) => {
  const { name, position } = req.body;
  const ip = getClientIP(req);

  if (!name || !position) {
    return res.status(400).send('Missing name or position');
  }

  // Correct usage of rate limit: 1 new politician per IP per hour
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

    // Log with null politicianId
    await logAction(ip, 'add_politician', null);
    res.status(201).json(newPolitician);
  } catch (err) {
    console.error('Error adding politician:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// GET /politician/:id/data
// Returns detailed word voting data for a specific politician
// MUST come before the /politician/:id route
app.get('/politician/:id/data', async (req, res) => {
  const { id } = req.params;

  try {
    const politician = await db('politicians').where({ politician_id: id }).first();

    if (!politician) {
      return res.status(404).send('Politician not found');
    }

    const words = await db('words').select('word_id', 'word');
    const votes = await db('votes').where({ politician_id: id });

    // Count votes
    const wordCounts = {};
    words.forEach(w => (wordCounts[w.word] = 0));
    votes.forEach(vote => {
      const wordObj = words.find(w => w.word_id === vote.word_id);
      if (wordObj) wordCounts[wordObj.word]++;
    });

    res.json({
      politician,
      votesForPolitician: wordCounts,
    });
  } catch (err) {
    console.error('Error loading politician data:', err);
    res.status(500).send('Error loading politician data');
  }
});

// POST /words
// Submits a new word (or reuses existing) and casts a vote for a politician, with IP-based rate limiting
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

    if (!wordEntry) {
      const userId = await getOrCreateUserIdFromIP(ip);
      const [row] = await db('words')
        .insert({
          word: word.toLowerCase(),
          user_id: userId
        })
        .returning('*');
      wordEntry = row;
    }

    const userId = await getOrCreateUserIdFromIP(ip);

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


// GET /
// Serves the homepage (index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GET /politician/:id
// Validates politician ID and serves their profile page (politician.html)
// This must come AFTER /politician/:id/data
// --------------------------------
app.get('/politician/:id', async (req, res) => {
  const { id } = req.params;
  // console.log("HIT /politician/:id with", id);

  // Validate that id is numeric before querying
  if (!/^\d+$/.test(id)) {
    // console.warn("Invalid ID, not a number:", id);
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }

  try {
    // Cast to number before querying
    const politician = await db('politicians')
      .where({ politician_id: Number(id) })
      .first();

    if (!politician) {
      // console.warn("No politician found for ID:", id);
      return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    }

    res.sendFile(path.join(__dirname, 'public', 'politician.html'));
  } catch (err) {
    console.error('Error checking politician:', err);
    res.status(500).send('Error loading politician');
  }
});

// POST /sentiment
// Accepts a word and returns its sentiment analysis
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

// Catch-all route: serves the 404 page for unknown URLs
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Starts the server on the specified port
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
