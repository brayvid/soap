// Copyright 2025 Blake Rayvid <https://github.com/brayvid>

require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db'); // Our knex instance

const app = express();
app.use(express.json());

// ✅ Serve static files FIRST
app.use(express.static(path.join(__dirname, 'public')));

// --------------------------------
// Get all politicians
// --------------------------------
app.get('/politicians', async (req, res) => {
  try {
    const politicians = await db('politicians').select('*');
    res.json(politicians);
  } catch (err) {
    console.error('Error fetching politicians:', err);
    res.status(500).send('Error fetching politicians');
  }
});

// --------------------------------
// Add a new politician (w/ duplicate check)
// --------------------------------
app.post('/politicians', async (req, res) => {
  const { name, position } = req.body;

  if (!name || !position) {
    return res.status(400).send('Missing name or position');
  }

  try {
    const existing = await db('politicians').where({ name }).first();
    if (existing) {
      return res.status(409).json({ error: 'Politician already exists' });
    }

    const [newPolitician] = await db('politicians')
      .insert({ name, position })
      .returning('*');

    res.status(201).json(newPolitician);
  } catch (err) {
    console.error('❌ Error adding politician:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------
// Get data for a specific politician
// ✅ MUST come before the /politician/:id route
// --------------------------------
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

// --------------------------------
// Submit a word and cast a vote
// --------------------------------
app.post('/words', async (req, res) => {
  const { word, politician_id } = req.body;

  if (!word || !politician_id) {
    return res.status(400).send('Missing word or politician ID');
  }

  try {
    let wordEntry = await db('words')
      .whereRaw('LOWER(word) = ?', word.toLowerCase())
      .first();

    if (!wordEntry) {
      const [row] = await db('words')
        .insert({ word: word.toLowerCase() })
        .returning('word_id');

      wordEntry = row;
    }

    await db('votes').insert({
      politician_id,
      word_id: wordEntry.word_id,
      user_id: '1', // Placeholder user
    });

    res.status(201).send('Word submitted and vote added');
  } catch (err) {
    console.error('Error submitting word/vote:', err.message, err.stack);
    res.status(500).json({ error: 'Error submitting word/vote' });
  }
});

// --------------------------------
// Homepage
// --------------------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --------------------------------
// Serve the dynamic politician page
// ✅ This must come AFTER /politician/:id/data
// --------------------------------
app.get('/politician/:id', async (req, res) => {
  const { id } = req.params;
  // console.log("🚨 HIT /politician/:id with", id);

  // ✅ Validate that id is numeric before querying
  if (!/^\d+$/.test(id)) {
    // console.warn("❌ Invalid ID, not a number:", id);
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }

  try {
    // ✅ Cast to number before querying
    const politician = await db('politicians')
      .where({ politician_id: Number(id) })
      .first();

    if (!politician) {
      // console.warn("❌ No politician found for ID:", id);
      return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    }

    res.sendFile(path.join(__dirname, 'public', 'politician.html'));
  } catch (err) {
    console.error('Error checking politician:', err);
    res.status(500).send('Error loading politician');
  }
});



// --------------------------------
// Catch-all 404 page
// --------------------------------
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// --------------------------------
// Start the server
// --------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
