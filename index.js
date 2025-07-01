// Copyright 2024-2025 soap.fyi

// --- IMPORTS ---
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import vader from 'vader-sentiment';
import { isUnderLimit, logAction } from './middleware/ipRateLimit.js';
import db from './db.js';

// --- BOILERPLATE FOR ES MODULES ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- HELPER FUNCTIONS & SETUP ---
const locks = new Map();

async function rateLimitedAction(ip, action, politicianId, callback) {
    const key = `${ip}-${politicianId}`;
    while (locks.get(key)) { await new Promise(resolve => setTimeout(resolve, 25)); }
    locks.set(key, true);
    try {
        const allowed = await isUnderLimit(ip, action, politicianId);
        if (!allowed) return { allowed: false };
        await callback();
        await logAction(ip, action, politicianId);
        return { allowed: true };
    } finally {
        locks.delete(key);
    }
}

async function getOrCreateUserIdFromIP(ip) {
    const existingUser = await db('users').where({ ip }).first();
    if (existingUser) return existingUser.id;
    const username = `user_${ip.replace(/\./g, '_')}`;
    const email = `${ip.replace(/\./g, '-') + '@autogen.local'}`;
    const password_hash = 'ip-only-no-password';
    const [newUser] = await db('users').insert({ ip, username, email, password_hash }).returning('*');
    return newUser.id;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 1. CORE MIDDLEWARE ---
app.use(compression());
app.set('trust proxy', true);
app.use(express.json());

function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    return (forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress).trim();
}

// --- 2. API & ASSET ROUTES (ORDER IS CRITICAL) ---

app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok' }));

app.get('/portraits/:filename', (req, res) => {
    const { filename } = req.params;
    if (!/^portrait-\d+\.jpg$/.test(filename) && filename !== 'blank.jpg') {
        return res.status(400).send('Invalid filename format');
    }
    const requestedPortraitPath = path.join(__dirname, 'portraits', filename);
    fs.access(requestedPortraitPath, fs.constants.F_OK, (err) => {
        if (err) {
            const fallbackPortraitPath = path.join(__dirname, 'portraits', 'blank.jpg');
            res.sendFile(fallbackPortraitPath, (fallbackErr) => {
                if (fallbackErr) {
                    console.error("CRITICAL: Fallback image 'blank.jpg' is missing.", fallbackErr);
                    res.status(404).send('Image not found');
                }
            });
        } else {
            res.sendFile(requestedPortraitPath);
        }
    });
});

app.get('/data/layout-:id.json', (req, res) => {
    const politicianId = req.params.id;
    if (!/^\d+$/.test(politicianId)) return res.status(400).send('Invalid ID format');
    const requestedLayoutPath = path.join(__dirname, 'data', `layout-${politicianId}.json`);
    fs.access(requestedLayoutPath, fs.constants.F_OK, (err) => {
        if (err) return res.status(404).send('Layout data not found');
        res.sendFile(requestedLayoutPath);
    });
});

app.get('/politician/:id/data', async (req, res) => {
    const { id } = req.params;
    try {
        const politician = await db('politicians').where({ politician_id: id }).first();
        if (!politician) return res.status(404).send('Politician not found');
        const allWordsFromDb = await db('words').select('word_id', 'word', 'sentiment_score');
        const votesForThisPolitician = await db('votes').where({ politician_id: id });
        const wordDetailsMap = new Map(allWordsFromDb.map(w => [w.word_id, { word: w.word, sentiment_score: w.sentiment_score }]));
        const wordVoteCounts = {};
        votesForThisPolitician.forEach(vote => { const wordDetail = wordDetailsMap.get(vote.word_id); if (wordDetail) { wordVoteCounts[wordDetail.word] = (wordVoteCounts[wordDetail.word] || 0) + 1; }});
        const detailedWordsResponse = [];
        for (const wordText in wordVoteCounts) { if (Object.prototype.hasOwnProperty.call(wordVoteCounts, wordText)) { const count = wordVoteCounts[wordText]; const wordObjFromDbList = allWordsFromDb.find(w => w.word.toLowerCase() === wordText.toLowerCase()); let finalSentimentScore = 0.0; if (wordObjFromDbList && typeof wordObjFromDbList.sentiment_score === 'number') { finalSentimentScore = wordObjFromDbList.sentiment_score; } else if (vader && vader.SentimentIntensityAnalyzer) { finalSentimentScore = vader.SentimentIntensityAnalyzer.polarity_scores(wordText).compound; } let sentimentCategory = 'gray'; if (finalSentimentScore >= 0.1) sentimentCategory = 'green'; else if (finalSentimentScore <= -0.1) sentimentCategory = 'red'; detailedWordsResponse.push({ word: wordText, count: count, sentiment: sentimentCategory, sentiment_score: parseFloat(finalSentimentScore.toFixed(4)), }); } }
        res.json({ politician, votesForPolitician: detailedWordsResponse, });
    } catch (err) { console.error(`Error in /politician/:id/data route:`, err); res.status(500).send('Error loading politician data'); }
});

app.get('/politicians', async (req, res) => {
    try {
        const [politicians, allVotes, allWords] = await Promise.all([
            db('politicians').select('*'),
            db('votes').select('politician_id', 'word_id'),
            db('words').select('word_id', 'word', 'sentiment_score')
        ]);
        const wordMap = new Map(allWords.map(w => [w.word_id, w]));
        const votesByPolitician = new Map();
        for (const vote of allVotes) {
            if (!votesByPolitician.has(vote.politician_id)) {
                votesByPolitician.set(vote.politician_id, []);
            }
            votesByPolitician.get(vote.politician_id).push(vote);
        }
        const enrichedPoliticians = politicians.map(p => {
            const politicianVotes = votesByPolitician.get(p.politician_id) || [];
            const vote_count = politicianVotes.length;
            const wordCounts = {};
            let totalSentimentScore = 0;
            for (const vote of politicianVotes) {
                const wordInfo = wordMap.get(vote.word_id);
                if (wordInfo) {
                    if (!wordCounts[wordInfo.word]) {
                        wordCounts[wordInfo.word] = { count: 0, score: wordInfo.sentiment_score };
                    }
                    wordCounts[wordInfo.word].count++;
                    totalSentimentScore += wordInfo.sentiment_score ?? 0;
                }
            }
            const average_sentiment_score = vote_count > 0 ? totalSentimentScore / vote_count : 0;
            const sortedWords = Object.entries(wordCounts).map(([word, data]) => ({ word, ...data })).sort((a, b) => b.count - a.count);
            const top_words = sortedWords.slice(0, 3).map(w => ({ word: w.word, score: w.score ?? (vader.SentimentIntensityAnalyzer.polarity_scores(w.word).compound || 0.0) }));
            const search_words = sortedWords.slice(0, 50).map(w => w.word);
            return { ...p, vote_count, top_words, search_words, average_sentiment_score };
        });
        res.json(enrichedPoliticians.sort((a, b) => b.vote_count - a.vote_count));
    } catch (err) {
        console.error('CRITICAL ERROR fetching politicians:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/politicians', async (req, res) => {
    const { name, position } = req.body;
    const ip = getClientIP(req);
    if (!name || !position) return res.status(400).send('Missing name or position');
    const underLimit = await isUnderLimit(ip, 'add_politician', null, 1);
    if (!underLimit) return res.status(429).send('Rate limit exceeded');
    try {
        const existing = await db('politicians').where({ name }).first();
        if (existing) return res.status(409).json({ error: 'Politician already exists' });
        const userId = await getOrCreateUserIdFromIP(ip);
        const [newPolitician] = await db('politicians').insert({ name, position, user_id: userId }).returning('*');
        await logAction(ip, 'add_politician', null);
        res.status(201).json(newPolitician);
    } catch (err) {
        console.error('Error adding politician:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// RESTORED /words ROUTE
app.post('/words', async (req, res) => {
    const { word, politician_id } = req.body;
    const ip = getClientIP(req);
    if (!word || !politician_id) {
        return res.status(400).send('Missing word or politician ID');
    }
    const result = await rateLimitedAction(ip, 'submit_vote', politician_id, async () => {
        let wordEntry = await db('words').whereRaw('LOWER(word) = ?', word.toLowerCase()).first();
        const userId = await getOrCreateUserIdFromIP(ip);
        if (!wordEntry) {
            const vaderResult = vader.SentimentIntensityAnalyzer.polarity_scores(word);
            const sentimentScore = parseFloat(vaderResult.compound.toFixed(4));
            const [row] = await db('words').insert({ word: word.toLowerCase(), user_id: userId, sentiment_score: sentimentScore, }).returning('*');
            wordEntry = row;
        }
        await db('votes').insert({ politician_id, word_id: wordEntry.word_id, user_id: userId });
        const allWordsFromDb = await db('words').select('word_id', 'word', 'sentiment_score');
        const votesForThisPolitician = await db('votes').where({ politician_id });
        const wordDetailsMap = new Map(allWordsFromDb.map(w => [w.word_id, w]));
        const wordVoteCounts = {};
        votesForThisPolitician.forEach(vote => { const wordDetail = wordDetailsMap.get(vote.word_id); if(wordDetail) wordVoteCounts[wordDetail.word] = (wordVoteCounts[wordDetail.word] || 0) + 1; });
        const updatedWords = Object.entries(wordVoteCounts).map(([wordText, count]) => {
            const wordObjFromDbList = allWordsFromDb.find(w => w.word === wordText);
            return { word: wordText, count: count, sentiment_score: wordObjFromDbList ? wordObjFromDbList.sentiment_score : 0.0, };
        });
        io.emit(`wordsUpdated:${politician_id}`, updatedWords);
    });
    if (!result.allowed) {
        return res.status(429).send('Rate limit exceeded for this politician');
    }
    res.status(201).json({ message: 'Word submitted and vote added' });
});

// RESTORED /sentiment ROUTE
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


// --- 3. FRONT-END SERVING (Generic routes come last) ---
app.get('/politician/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!/^\d+$/.test(id)) return next();
        const politician = await db('politicians').where({ politician_id: Number(id) }).first();
        if (politician) {
            const filePath = (process.env.NODE_ENV === 'production')
                ? path.join(__dirname, 'dist', 'politician.html')
                : path.join(__dirname, 'client', 'politician.html');
            res.sendFile(filePath);
        } else {
            return next();
        }
    } catch (err) {
        console.error('Error in /politician/:id HTML route:', err);
        next(err);
    }
});

// --------------------------------
// Catch-all 404 page
// --------------------------------
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});


if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
}

// --- START THE SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});