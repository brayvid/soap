// Copyright 2024-2025 soap.fyi <https://soap.fyi>

require('dotenv').config();
const db = require('../db');
const vader = require('vader-sentiment');

async function backfillSentiment() {
  try {
    const words = await db('words')
      .select('word_id', 'word')
      .whereNull('sentiment_score');

    console.log(`Backfilling ${words.length} words...`);

    for (const w of words) {
      const score = vader.SentimentIntensityAnalyzer.polarity_scores(w.word).compound;

      await db('words')
        .where({ word_id: w.word_id })
        .update({ sentiment_score: score });
    }

    console.log('Backfill complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error during backfill:', err);
    process.exit(1);
  }
}

backfillSentiment();
