require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db'); // Our knex instance

const app = express();
app.use(express.json());
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
// Add a new politician
// --------------------------------
app.post('/politicians', async (req, res) => {
  const { name, position } = req.body;

  if (!name || !position) {
    return res.status(400).send('Missing name or position');
  }

  try {
    console.log('🆕 Adding politician:', name, position);
    await db('politicians').insert({ name, position });
    res.status(201).json({ message: 'Politician added successfully' });
  } catch (err) {
    console.error('❌ Error adding politician:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// --------------------------------
// Get data for a specific politician
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

    // Count the votes for each word
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
    // Check if word exists
    let wordEntry = await db('words').whereRaw('LOWER(word) = ?', word.toLowerCase()).first();

    if (!wordEntry) {
      const [newWordId] = await db('words').insert({ word: word.toLowerCase() }).returning('word_id');
      wordEntry = { word_id: newWordId };
    }

    // Add vote
    await db('votes').insert({
      politician_id,
      word_id: wordEntry.word_id,
      user_id: '1', // Placeholder until user accounts added
    });

    res.status(201).send('Word submitted and vote added');
  } catch (err) {
    console.error('Error submitting word/vote:', err.message, err.stack);
    res.status(500).json({ error: 'Error submitting word/vote' });
  }
});

// --------------------------------
// Serve HTML pages
// --------------------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/politician/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'politician.html'));
});

// --------------------------------
// Start the server (dev only)
// --------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
