// Copyright 2024-2025 soap.fyi <https://soap.fyi>

// Imports rate limit utilities and logging middleware
const { isUnderLimit, logAction } = require('./middleware/ipRateLimit');

require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db'); // Our knex instance

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
          top_words: wordRows.slice(0, 3).map(w => w.word),
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

  const underLimit = await isUnderLimit(ip, 'add_politician', 1); // max 1/hour
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
    

    await logAction(ip, 'add_politician');
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

  const underLimit = await isUnderLimit(ip, 'submit_vote', 5); // max 5/hour
  if (!underLimit) {
    return res.status(429).send('Rate limit exceeded for this IP');
  }

  try {
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
    

    await logAction(ip, 'submit_vote');
    res.status(201).send('Word submitted and vote added');
  } catch (err) {
    console.error('Error submitting word/vote:', err.message, err.stack);
    res.status(500).json({ error: 'Error submitting word/vote' });
  }
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

// Catch-all route: serves the 404 page for unknown URLs
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Starts the server on the specified port
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
