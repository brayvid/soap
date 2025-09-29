// Copyright 2024-2025 soap.fyi <https://soap.fyi>

// soap/scripts/backfillNeutrals.cjs
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- Configuration ---
const KNEX_CONFIG_PATH = path.join(__dirname, '..', 'knexfile.cjs');
const KNEX_ENV = process.env.NODE_ENV || 'development';

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error(`[${new Date().toISOString()}] ERROR: GOOGLE_GEMINI_API_KEY environment variable is not set (and not found in .env).`);
    process.exit(1);
}

const GEMINI_MODEL_NAME = "gemini-2.5-flash"; // Or your preferred model

const CUSTOM_MANUAL_LEXICON_PATH = path.join(__dirname, '..', 'custom_sentiment_lexicon.json');

// Lexicon Database Table and Column names (your 'words' table)
const LEXICON_DB_TABLE_NAME = 'words';
const LEXICON_DB_ID_COLUMN = 'word_id';
const LEXICON_DB_WORD_COLUMN = 'word';
const LEXICON_DB_SCORE_COLUMN = 'sentiment_score';
// Optional: Column to track the source of the score
// const LEXICON_DB_SCORE_SOURCE_COLUMN = 'sentiment_score_source';


// API Call Configuration
const REQUEST_DELAY_MS = 2000; // Delay between API calls (2 seconds)

// Representative scores for categories from the CUSTOM manual lexicon
const MANUAL_LEXICON_POSITIVE_SCORE = 0.5;
const MANUAL_LEXICON_NEGATIVE_SCORE = -0.5;
const MANUAL_LEXICON_NEUTRAL_SCORE = 0.0;

// --- Initialization ---
// API Key check moved up

let knexLexiconDB;
try {
    const knexConfig = require(KNEX_CONFIG_PATH)[KNEX_ENV];
    if (!knexConfig) { // Ensure knexConfig itself is found
        throw new Error(`Knex configuration for environment '${KNEX_ENV}' not found in ${KNEX_CONFIG_PATH}`);
    }
    knexLexiconDB = require('knex')(knexConfig);
    console.log(`[${new Date().toISOString()}] Connected to lexicon database using '${KNEX_ENV}' config.`);
} catch (error) {
    console.error(`[${new Date().toISOString()}] Error initializing Knex for lexicon DB:`, error.message);
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });

let customManualLexicon = {};
try {
    if (fs.existsSync(CUSTOM_MANUAL_LEXICON_PATH)) {
        customManualLexicon = JSON.parse(fs.readFileSync(CUSTOM_MANUAL_LEXICON_PATH, 'utf8'));
        console.log(`[${new Date().toISOString()}] Loaded custom manual lexicon from: ${CUSTOM_MANUAL_LEXICON_PATH}`);
    } else {
        console.warn(`[${new Date().toISOString()}] Custom manual lexicon file not found at ${CUSTOM_MANUAL_LEXICON_PATH}.`);
    }
} catch (error) {
    console.error(`[${new Date().toISOString()}] Error loading custom manual lexicon:`, error);
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Gets sentiment score from Gemini API for a given word.
 * @param {string} word The word to analyze.
 * @returns {Promise<number|null>} A sentiment score between -1.0 and 1.0, or null.
 */
async function getSentimentFromGemini(word) {
    const prompt = `Analyze the sentiment of the following word: "${word}".
Return your response ONLY as a JSON object with a single key "sentiment_score",
where the value is a float between -1.0 (most negative) and 1.0 (most positive).
Example for "happy": {"sentiment_score": 0.8}
Example for "sad": {"sentiment_score": -0.7}
Example for "table": {"sentiment_score": 0.0}
Word to analyze: "${word}"
JSON response:`;

    try {
        console.log(`[${new Date().toISOString()}]     Querying Gemini for: "${word}"`);
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        let cleanedText = text.replace(/^```json\s*|```\s*$/g, '').trim();
        const jsonResponse = JSON.parse(cleanedText);

        if (jsonResponse && typeof jsonResponse.sentiment_score === 'number') {
            let score = jsonResponse.sentiment_score;
            score = Math.max(-1.0, Math.min(1.0, score));
            return parseFloat(score.toFixed(4));
        } else {
            console.warn(`[${new Date().toISOString()}]     Gemini response for "${word}" was not in expected JSON format: ${text}`);
            return null;
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}]     Error calling Gemini API for "${word}":`, error.message);
        if (error.message.includes('429') || error.message.includes('rate limit')) {
            console.warn(`[${new Date().toISOString()}]     Rate limit likely hit. Consider increasing REQUEST_DELAY_MS.`);
        }
        return null;
    }
}

/**
 * Main function to backfill scores in the 'words' table using Gemini.
 * Only processes words where sentiment_score is currently 0.0.
 */
async function backfillNeutrals() {
    console.log(`[${new Date().toISOString()}] \nStarting backfill for 'words' table (targeting sentiment_score = 0.0) using Google Gemini...`);
    let recordsScanned = 0;
    let recordsUpdated = 0;
    let recordsStillZero = 0;
    let apiFailures = 0;

    try {
        const wordsToProcessQuery = knexLexiconDB(LEXICON_DB_TABLE_NAME)
            .where(LEXICON_DB_SCORE_COLUMN, 0.0);

        const wordsToProcess = await wordsToProcessQuery.select(
            LEXICON_DB_ID_COLUMN, LEXICON_DB_WORD_COLUMN, LEXICON_DB_SCORE_COLUMN
        );

        recordsScanned = wordsToProcess.length;
        if (recordsScanned === 0) {
            console.log(`[${new Date().toISOString()}] No words found with sentiment_score = 0.0 to backfill.`);
            return;
        }
        console.log(`[${new Date().toISOString()}] Found ${recordsScanned} words with sentiment_score = 0.0 to process.`);

        for (let i = 0; i < wordsToProcess.length; i++) {
            const entry = wordsToProcess[i];
            const wordId = entry[LEXICON_DB_ID_COLUMN];
            const wordText = entry[LEXICON_DB_WORD_COLUMN];
            const originalDbScore = entry[LEXICON_DB_SCORE_COLUMN];
            const standardizedWord = wordText.toLowerCase().trim();

            console.log(`[${new Date().toISOString()}] \nProcessing word ${i + 1}/${recordsScanned}: "${wordText}" (ID: ${wordId}, current score: ${originalDbScore})`);

            let newScore = null;
            let scoreSource = 'gemini_api';

            if (customManualLexicon.hasOwnProperty(standardizedWord)) {
                const manualSentimentCategory = customManualLexicon[standardizedWord].toLowerCase();
                if (manualSentimentCategory === 'positive') newScore = MANUAL_LEXICON_POSITIVE_SCORE;
                else if (manualSentimentCategory === 'negative') newScore = MANUAL_LEXICON_NEGATIVE_SCORE;
                else if (manualSentimentCategory === 'neutral') newScore = MANUAL_LEXICON_NEUTRAL_SCORE;

                if (newScore !== null) {
                    scoreSource = 'custom_manual_lexicon';
                    console.log(`[${new Date().toISOString()}]     Using score from manual lexicon: ${newScore}`);
                }
            }

            if (newScore === null) {
                newScore = await getSentimentFromGemini(wordText);
                if (newScore === null) {
                    apiFailures++;
                }
            }

            let needsUpdate = false;
            if (newScore !== null) {
                if (parseFloat(newScore.toFixed(4)) !== parseFloat(originalDbScore.toFixed(4))) {
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                const updatePayload = { [LEXICON_DB_SCORE_COLUMN]: newScore };
                await knexLexiconDB(LEXICON_DB_TABLE_NAME)
                    .where(LEXICON_DB_ID_COLUMN, wordId)
                    .update(updatePayload);
                recordsUpdated++;
                console.log(`[${new Date().toISOString()}]     SUCCESS: Updated ID ${wordId} ("${wordText}"): old_score=${originalDbScore}, new_score=${newScore} (source: ${scoreSource})`);
            } else {
                recordsStillZero++;
                if (newScore !== null) {
                     console.log(`[${new Date().toISOString()}]     INFO: Score for ID ${wordId} ("${wordText}") determined as ${newScore} (source: ${scoreSource}), but this did not differ from original_score=${originalDbScore}. No update needed.`);
                } else {
                     console.log(`[${new Date().toISOString()}]     INFO: Could not determine a new score for ID ${wordId} ("${wordText}"). Score remains ${originalDbScore}.`);
                }
            }

            if (i < wordsToProcess.length - 1 && (scoreSource === 'gemini_api' || (newScore === null && scoreSource === 'gemini_api'))) {
                await delay(REQUEST_DELAY_MS);
            }
        }

    } catch (error) {
        console.error(`[${new Date().toISOString()}] \nError during Gemini backfill process:`, error);
    } finally {
        const finalTimestamp = `[${new Date().toISOString()}]`;
        console.log(`${finalTimestamp} \n--- Gemini Backfill Summary (Targeting Score = 0.0) ---`);
        console.log(`${finalTimestamp} Total words scanned (original score = 0.0): ${recordsScanned}`);
        console.log(`${finalTimestamp} Words updated with a new non-zero score: ${recordsUpdated}`);
        console.log(`${finalTimestamp} API/Processing failures (could not get score from Gemini): ${apiFailures}`);
        console.log(`${finalTimestamp} Words where score remained 0.0 (or API failed): ${recordsStillZero}`);
        if (knexLexiconDB) {
            await knexLexiconDB.destroy();
            console.log(`${finalTimestamp} Database connection closed.`);
        }
    }
}

// Run the backfill process
backfillNeutrals();