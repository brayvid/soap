// Copyright 2024-2025 soap.fyi

// --- IMPORTS ---
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import vader from 'vader-sentiment';
import cors from 'cors'; 
import { isUnderLimit, logAction } from './middleware/ipRateLimit.js';
import db from './db.js';

// --- BOILERPLATE & SETUP ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'https://www.use.soap.fyi',
  'https://use.soap.fyi',
  process.env.FRONTEND_URL || 'http://localhost:3000',
];

// CORS middleware with multiple allowed origins
app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error(`CORS policy: Origin ${origin} not allowed`));
    }
  }
}));

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"]
  }
});

app.use(compression());
app.set('trust proxy', true); // Important for getting IP address behind a proxy (like Railway)
app.use(express.json());

// Serve all static files (portraits, layouts) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Redirect naked domain to www in production
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV === 'production' &&
    (req.hostname === 'use.soap.fyi' || req.hostname === 'use.soap.fyi:443') &&
    req.path !== '/healthz'
  ) {
    return res.redirect(301, `https://www.use.soap.fyi${req.originalUrl}`);
  }
  next();
});

// --- HELPER FUNCTIONS ---
async function getOrCreateUserIdFromIP(ip) {
    const existingUser = await db('users').where({ ip }).first();
    if (existingUser) return existingUser.id;
    const username = `user_${ip.replace(/\./g, '_')}`;
    const email = `${ip.replace(/\./g, '-') + '@autogen.local'}`;
    const password_hash = 'ip-only-no-password';
    const [newUser] = await db('users').insert({ ip, username, email, password_hash }).returning('*');
    return newUser.id;
}

async function getAggregatedVotesForPolitician(politicianId) {
    try {
        const aggregatedVotes = await db('votes as v')
            .join('words as w', 'v.word_id', 'w.word_id')
            .where('v.politician_id', politicianId)
            .groupBy('w.word', 'w.sentiment_score')
            .select(
                'w.word',
                'w.sentiment_score',
                db.raw('COUNT(v.vote_id) as count'),
                db.raw('MAX(v.created_at) as last_voted_at')
            );
        return aggregatedVotes;
    } catch (error) {
        console.error(`Failed to get aggregated votes for politician ${politicianId}:`, error);
        return [];
    }
}

function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    return (forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress).trim();
}

// --- API ROUTES ---
app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok' }));

app.get('/politician/:id/data', async (req, res) => {
    const { id } = req.params;
    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ error: 'A valid politician ID is required.' });
    }
    try {
        const politician = await db('politicians').where({ politician_id: Number(id) }).first();
        if (!politician) {
            return res.status(404).json({ error: 'Politician not found' });
        }
        const votesForPolitician = await getAggregatedVotesForPolitician(Number(id));
        res.json({ politician, votesForPolitician });
    } catch (err) {
        console.error(`Error in /politician/:id/data for ID ${id}:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/politicians', async (req, res) => {
    try {
        const politicians = await db('politicians').select('*').orderBy('name', 'asc');
        const allVotes = await db('votes').select('politician_id', 'word_id');
        const allWords = await db('words').select('word_id', 'word', 'sentiment_score');
        
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
            const wordCounts = new Map();
            let totalSentimentScore = 0;

            for (const vote of politicianVotes) {
                const wordInfo = wordMap.get(vote.word_id);
                if (wordInfo) {
                    if (!wordCounts.has(wordInfo.word)) {
                        wordCounts.set(wordInfo.word, { count: 0, score: wordInfo.sentiment_score });
                    }
                    const current = wordCounts.get(wordInfo.word);
                    current.count++;
                    totalSentimentScore += wordInfo.sentiment_score ?? 0;
                }
            }
            const average_sentiment_score = vote_count > 0 ? totalSentimentScore / vote_count : 0;
            const sortedWords = [...wordCounts.entries()].map(([word, data]) => ({ word, ...data })).sort((a, b) => b.count - a.count);
            const top_words = sortedWords.slice(0, 3);
            const search_words = sortedWords.slice(0, 50).map(w => w.word);
            return { ...p, vote_count, top_words, search_words, average_sentiment_score };
        });

        res.json(enrichedPoliticians.sort((a, b) => b.vote_count - a.vote_count));
    } catch (err) {
        console.error('CRITICAL ERROR fetching politicians:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// In your server/index.js

// ... (keep all your other code)

app.post('/politicians', async (req, res) => {
    const { name, position } = req.body;
    const ip = getClientIP(req);
    if (!name || !position) return res.status(400).json({ error: 'Missing name or position' });

    try {
        const underLimit = await isUnderLimit(ip, 'add_politician', null);
        if (!underLimit) return res.status(429).json({ error: 'Rate limit exceeded' });

        const existing = await db('politicians').whereRaw('LOWER(name) = ?', name.toLowerCase()).first();
        if (existing) return res.status(409).json({ error: 'Politician already exists' });

        const userId = await getOrCreateUserIdFromIP(ip);
        const [newPolitician] = await db('politicians').insert({ name, position, user_id: userId }).returning('*');
        await logAction(ip, 'add_politician', null);

        // --- ADD THIS REVALIDATION LOGIC ---
        try {
            console.log('Politician added. Triggering cache revalidation on the frontend...');
            await fetch(`${process.env.NEXT_FRONTEND_URL}/api/revalidate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tag: 'politicians-list', // The tag you want to revalidate
                    secret: process.env.REVALIDATION_TOKEN
                })
            });
            console.log('Cache revalidation signal sent.');
        } catch (revalError) {
            // Log the error, but don't fail the main request.
            // The politician was added successfully.
            console.error('Error triggering frontend revalidation:', revalError);
        }
        // --- END OF REVALIDATION LOGIC ---

        res.status(201).json(newPolitician);
    } catch (err) {
        console.error('Error adding politician:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/words', async (req, res) => {
    const { word, politician_id } = req.body;
    const ip = getClientIP(req);
    if (!word || !politician_id) return res.status(400).json({ error: 'Missing word or politician ID' });

    try {
        const underLimit = await isUnderLimit(ip, 'submit_vote', politician_id);
        if (!underLimit) return res.status(429).json({ error: 'Rate limit exceeded for this politician.' });

        let wordEntry = await db('words').whereRaw('LOWER(word) = ?', word.toLowerCase()).first();
        const userId = await getOrCreateUserIdFromIP(ip);
        if (!wordEntry) {
            const vaderResult = vader.SentimentIntensityAnalyzer.polarity_scores(word);
            const [row] = await db('words').insert({ word: word.toLowerCase(), user_id: userId, sentiment_score: vaderResult.compound }).returning('*');
            wordEntry = row;
        }

        await db('votes').insert({ politician_id, word_id: wordEntry.word_id, user_id: userId });
        await logAction(ip, 'submit_vote', politician_id);
        
        const updatedWords = await getAggregatedVotesForPolitician(politician_id);
        io.emit(`wordsUpdated:${politician_id}`, updatedWords);
        res.status(201).json({ message: 'Vote submitted' });
    } catch (err) {
        console.error(`Error submitting word for politician ${politician_id}:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- SERVER INITIALIZATION ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`API Server running on http://localhost:${PORT}`);
});
