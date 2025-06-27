// Copyright 2024-2025 soap.fyi

// --- CHANGE 1: Add http and socket.io ---
const http = require('http');
const { Server } = require("socket.io");

// +++ ADD THIS LINE: Import the File System module +++
const fs = require('fs');

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
// --- CHANGE 2: Create the server and io instances ---
const server = http.createServer(app); // Create an HTTP server from the Express app
const io = new Server(server);         // Initialize socket.io with the HTTP server

app.set('trust proxy', true);
app.use(express.json());

function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    return (forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress).trim();
}

app.use(express.static(path.join(__dirname, 'public')));

// This route securely serves individual portraits and handles fallbacks.
app.get('/portraits/:filename', (req, res) => {
    const { filename } = req.params;

    // --- Security Validation ---
    // Ensure the filename matches the expected format to prevent path traversal attacks.
    // It should be 'portrait-ID.jpg' or 'blank.jpg'.
    if (!/^portrait-\d+\.jpg$/.test(filename) && filename !== 'blank.jpg') {
        return res.status(400).send('Invalid filename format');
    }

    // Construct the absolute path to the requested portrait on the server.
    // The 'portraits' directory is now a private, server-side asset folder.
    const requestedPortraitPath = path.join(__dirname, 'portraits', filename);

    // Check if the specific portrait file exists.
    fs.access(requestedPortraitPath, fs.constants.F_OK, (err) => {
        if (err) {
            // The portrait does NOT exist. Instead of a 404, send the blank fallback image.
            // console.warn(`Portrait for '${filename}' not found, serving blank.jpg.`);
            const fallbackPortraitPath = path.join(__dirname, 'portraits', 'blank.jpg');
            res.sendFile(fallbackPortraitPath, (fallbackErr) => {
                if(fallbackErr) {
                    // This is a serious issue: the fallback image itself is missing.
                    console.error("CRITICAL: Fallback image 'blank.jpg' is missing.", fallbackErr);
                    res.status(404).send('Image not found');
                }
            });
        } else {
            // The portrait exists, send it.
            res.sendFile(requestedPortraitPath);
        }
    });
});

// This route securely serves individual layout files.
app.get('/data/layout-:id.json', (req, res) => {
    const politicianId = req.params.id;

    // --- Security Validation ---
    if (!/^\d+$/.test(politicianId)) {
        return res.status(400).send('Invalid ID format');
    }

    // Construct the absolute path to the requested layout file
    const requestedLayoutPath = path.join(__dirname, 'data', `layout-${politicianId}.json`);

    // Check if the file exists
    fs.access(requestedLayoutPath, fs.constants.F_OK, (err) => {
        if (err) {
            // If the layout file doesn't exist, it's a valid state.
            // Send a 404, which the client-side fetch will catch.
            return res.status(404).send('Layout data not found');
        }
        // The file exists, send it. Express handles the Content-Type.
        res.sendFile(requestedLayoutPath);
    });
});

app.get('/politicians', async (req, res) => {
    try {
        const politicians = await db('politicians').select('*');

        const enrichedPoliticians = await Promise.all(
            politicians.map(async p => {
                const [{ count: voteCount }] = await db('votes')
                    .where('politician_id', p.politician_id)
                    .count('vote_id as count');

                const topWordRows = await db('votes')
                    .join('words', 'votes.word_id', '=', 'words.word_id')
                    .where('votes.politician_id', p.politician_id)
                    .select('words.word', 'words.sentiment_score')
                    .groupBy('words.word', 'words.sentiment_score')
                    .count('* as appearances')
                    .orderBy('appearances', 'desc')
                    .limit(3);

                const searchWordRows = await db('votes')
                    .join('words', 'votes.word_id', '=', 'words.word_id')
                    .where('votes.politician_id', p.politician_id)
                    .select('words.word')
                    .groupBy('words.word')
                    .count('* as appearances')
                    .orderBy('appearances', 'desc')
                    .limit(50);
                
                return {
                    ...p,
                    vote_count: parseInt(voteCount) || 0,
                    top_words: topWordRows.map(w => {
                        let sentimentCategory = 'gray';
                        const scoreToUse = (w.sentiment_score === null || typeof w.sentiment_score === 'undefined') ?
                            vader.SentimentIntensityAnalyzer.polarity_scores(w.word).compound :
                            w.sentiment_score;

                        if (scoreToUse >= 0.1) sentimentCategory = 'green';
                        else if (scoreToUse <= -0.1) sentimentCategory = 'red';

                        return {
                            word: w.word,
                            sentiment: sentimentCategory,
                            score: parseFloat(scoreToUse.toFixed(4))
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

app.post('/politicians', async (req, res) => {
    const { name, position } = req.body;
    const ip = getClientIP(req);

    if (!name || !position) {
        return res.status(400).send('Missing name or position');
    }

    const underLimit = await isUnderLimit(ip, 'add_politician', null, 1);
    if (!underLimit) {
        return res.status(429).send('Rate limit exceeded');
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

app.get('/politician/:id/data', async (req, res) => {
    const { id } = req.params;

    try {
        const politician = await db('politicians').where({ politician_id: id }).first();

        if (!politician) {
            return res.status(404).send('Politician not found');
        }

        const allWordsFromDb = await db('words').select('word_id', 'word', 'sentiment_score');
        const votesForThisPolitician = await db('votes').where({ politician_id: id });

        const wordDetailsMap = new Map();
        allWordsFromDb.forEach(w => wordDetailsMap.set(w.word_id, {
            word: w.word,
            sentiment_score: w.sentiment_score
        }));

        const wordVoteCounts = {};
        votesForThisPolitician.forEach(vote => {
            const wordDetail = wordDetailsMap.get(vote.word_id);
            if (wordDetail) {
                wordVoteCounts[wordDetail.word] = (wordVoteCounts[wordDetail.word] || 0) + 1;
            }
        });

        const detailedWordsResponse = [];
        for (const wordText in wordVoteCounts) {
            if (Object.prototype.hasOwnProperty.call(wordVoteCounts, wordText)) {
                const count = wordVoteCounts[wordText];
                const wordObjFromDbList = allWordsFromDb.find(w => w.word.toLowerCase() === wordText.toLowerCase());

                let finalSentimentScore = 0.0;
                let sentimentCategory = 'gray';

                if (wordObjFromDbList && typeof wordObjFromDbList.sentiment_score === 'number' && wordObjFromDbList.sentiment_score !== null) {
                    finalSentimentScore = wordObjFromDbList.sentiment_score;
                } else {
                    finalSentimentScore = vader.SentimentIntensityAnalyzer.polarity_scores(wordText).compound;
                }

                if (finalSentimentScore >= 0.1) sentimentCategory = 'green';
                else if (finalSentimentScore <= -0.1) sentimentCategory = 'red';

                detailedWordsResponse.push({
                    word: wordText,
                    count: count,
                    sentiment: sentimentCategory,
                    sentiment_score: parseFloat(finalSentimentScore.toFixed(4)),
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

// --- MODIFIED /words Endpoint for Real-Time Updates ---
app.post('/words', async (req, res) => {
    const { word, politician_id } = req.body;
    const ip = getClientIP(req);

    if (!word || !politician_id) {
        return res.status(400).send('Missing word or politician ID');
    }

    const result = await rateLimitedAction(ip, 'submit_vote', politician_id, async () => {
        // Your existing database logic to add a vote is perfect.
        let wordEntry = await db('words')
            .whereRaw('LOWER(word) = ?', word.toLowerCase())
            .first();

        const userId = await getOrCreateUserIdFromIP(ip);

        if (!wordEntry) {
            const vaderResult = vader.SentimentIntensityAnalyzer.polarity_scores(word);
            const sentimentScore = parseFloat(vaderResult.compound.toFixed(4));
            const [row] = await db('words')
                .insert({
                    word: word.toLowerCase(),
                    user_id: userId,
                    sentiment_score: sentimentScore,
                })
                .returning('*');
            wordEntry = row;
        }

        await db('votes').insert({
            politician_id,
            word_id: wordEntry.word_id,
            user_id: userId,
        });

        // --- BROADCAST LOGIC ---
        // After the vote is saved, get the complete updated list to broadcast.
        // This reuses logic from your GET endpoint to ensure data consistency.
        const allWordsFromDb = await db('words').select('word_id', 'word', 'sentiment_score');
        const votesForThisPolitician = await db('votes').where({ politician_id });
        const wordDetailsMap = new Map(allWordsFromDb.map(w => [w.word_id, w]));
        
        const wordVoteCounts = {};
        votesForThisPolitician.forEach(vote => {
            const wordDetail = wordDetailsMap.get(vote.word_id);
            if(wordDetail) wordVoteCounts[wordDetail.word] = (wordVoteCounts[wordDetail.word] || 0) + 1;
        });

        // This is the data payload the frontend (`politician.js`) is expecting
        const updatedWords = Object.entries(wordVoteCounts).map(([wordText, count]) => {
            const wordObjFromDbList = allWordsFromDb.find(w => w.word === wordText);
            return {
                word: wordText,
                count: count,
                sentiment_score: wordObjFromDbList ? wordObjFromDbList.sentiment_score : 0.0,
            };
        });
        
        // Emit the fresh data to all clients viewing this specific politician's page.
        io.emit(`wordsUpdated:${politician_id}`, updatedWords);
    });

    if (!result.allowed) {
        return res.status(429).send('Rate limit exceeded for this politician');
    }
    
    // Let the original client know their submission was successful.
    // The UI update will happen via the websocket broadcast.
    res.status(201).json({ message: 'Word submitted and vote added' });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

const PORT = process.env.PORT || 3000;
// --- CHANGE 3: Use server.listen instead of app.listen ---
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});