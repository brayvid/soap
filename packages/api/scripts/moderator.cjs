// moderationScript.cjs

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Client } = require('pg');
const nodemailer = require('nodemailer'); // Import nodemailer
require('dotenv').config();

// --- CONFIGURATION ---
const DRY_RUN = true;

// --- INITIALIZE CLIENTS ---
if (!process.env.GOOGLE_GEMINI_API_KEY || !process.env.DB_MOD_URL || !process.env.GMAIL_EMAIL || !process.env.GMAIL_APP_PASSWORD || !process.env.REPORT_RECIPIENT_EMAIL) {
    console.error("FATAL ERROR: Missing one or more required environment variables (GEMINI, DB, or GMAIL).");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
const generationConfig = { temperature: 0.1, responseMimeType: "application/json" };
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig });
const dbClient = new Client({ connectionString: process.env.DB_MOD_URL });

// --- SCRIPT FUNCTIONS ---

async function fetchAllWords() {
    // ... (This function remains the same)
    console.log("Fetching all words from the database...");
    const res = await dbClient.query('SELECT word_id, word FROM words ORDER BY word_id');
    console.log(`Found ${res.rows.length} words to analyze.`);
    return res.rows;
}

function buildPrompt(words) {
    // ... (This function remains the same)
    const prompt = `
      You are a precise and discerning content moderator for a political commentary platform.
      Your primary goal is to differentiate between unacceptable hate speech and acceptable (even if harsh) political criticism.
      Your response MUST be a valid JSON array of objects representing words to be DELETED.
      Each object must have "word_id" (integer) and "reason" (string) keys. If no words meet the deletion criteria, return an empty array: [].
      --- DELETION CRITERIA (Strict) ---
      1.  **HATE SPEECH:** You MUST flag words that are slurs or dehumanizing language targeting individuals based on their identity in a protected class (race, ethnicity, religion, disability, gender, sexual orientation). This is your highest priority. This category INCLUDES words like "retarded", "nazi", and other racial or homophobic slurs.
      2.  **SPAM / GIBBERISH:** You MUST flag words that are nonsensical (e.g., "aaaaaaaaaa") or clearly promotional.
      --- ALLOWANCE CRITERIA (Crucial) ---
      1.  **POLITICAL CRITICISM & INSULTS:** You MUST ALLOW words that criticize a politician's actions, character, intelligence, or policies. This is true even if the words are severe insults. This category includes terms like: 'liar', 'traitor', 'corrupt', 'idiot', 'thug', 'warmonger', 'fascist', 'sociopath', 'scumbag', 'asshole'. These words, while harsh, are considered part of legitimate political discourse and should NOT be flagged.
      Your task is to apply these principles. Do not just match words; understand the category they fall into.
      Analyze the following list of words:
      ${JSON.stringify(words)}
    `;
    return prompt;
}

async function deleteFlaggedWords(wordIdsToDelete) {
    // ... (This function remains the same)
    if (wordIdsToDelete.length === 0) return 0;
    await dbClient.query('BEGIN');
    try {
        const wordDeletionResult = await dbClient.query('DELETE FROM words WHERE word_id = ANY($1::int[])', [wordIdsToDelete]);
        await dbClient.query('COMMIT');
        console.log(` - ${wordDeletionResult.rowCount} word entries deleted successfully.`);
        return wordDeletionResult.rowCount;
    } catch (error) {
        await dbClient.query('ROLLBACK');
        console.error(" - ERROR: Transaction failed. All changes have been rolled back.", error.message);
        throw error; // Re-throw the error to be caught by the main function
    }
}

// --- NEW: Function to send the final report email ---
async function sendReportEmail(htmlContent) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_EMAIL,
                pass: process.env.GMAIL_APP_PASSWORD,
            },
        });

        const mailOptions = {
            from: `"Moderation Bot" <${process.env.GMAIL_EMAIL}>`,
            to: process.env.REPORT_RECIPIENT_EMAIL,
            subject: `Content Moderation Report - ${new Date().toLocaleString()}`,
            html: htmlContent,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Report email sent successfully: ${info.messageId}`);
    } catch (error) {
        console.error("\n--- FAILED TO SEND REPORT EMAIL ---", error);
    }
}


async function moderateWords() {
    console.log("--- Starting Principle-Based Moderation Script ---");
    console.log(`--- RUN MODE: ${DRY_RUN ? 'DRY RUN (No changes will be made)' : 'LIVE (PERMANENTLY DELETING DATA)'} ---\n`);

    let reportHTML = `<h1>Moderation Report</h1><p><strong>Run Time:</strong> ${new Date().toLocaleString()}</p>`;
    
    try {
        await dbClient.connect();
        console.log("Database connection established.");

        const allWords = await fetchAllWords();
        reportHTML += `<p><strong>Total Words Analyzed:</strong> ${allWords.length}</p>`;

        if (allWords.length === 0) {
            reportHTML += "<p>The 'words' table is empty. No action was taken.</p>";
            return;
        }

        const prompt = buildPrompt(allWords);
        console.log("\nSending request to Gemini API...");
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        console.log("Response received. Parsing...");
        
        let flaggedWords = JSON.parse(responseText);
        // ... validation logic ...
        console.log("JSON response validated.");

        reportHTML += `<p><strong>Run Mode:</strong> ${DRY_RUN ? 'DRY RUN (No deletions occurred)' : 'LIVE MODE'}</p>`;

        if (flaggedWords.length > 0) {
            reportHTML += `<h2>${flaggedWords.length} Words Flagged for Deletion</h2>`;
            reportHTML += `<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
                            <thead><tr><th>ID</th><th>Word</th><th>Reason</th></tr></thead><tbody>`;

            console.log(`\n--- Gemini Flagged ${flaggedWords.length} Words for Deletion (Principle-Based) ---`);
            for (const item of flaggedWords) {
                const originalWord = allWords.find(w => w.word_id === item.word_id);
                const wordText = originalWord ? originalWord.word : 'N/A';
                console.log(` - ID: ${item.word_id}, Word: "${wordText}", Reason: ${item.reason}`);
                reportHTML += `<tr><td>${item.word_id}</td><td>${wordText}</td><td>${item.reason}</td></tr>`;
            }
            reportHTML += "</tbody></table>";

            if (!DRY_RUN) {
                const wordIdsToDelete = flaggedWords.map(item => item.word_id);
                const deletedCount = await deleteFlaggedWords(wordIdsToDelete);
                reportHTML += `<h3>Action Taken: Successfully deleted ${deletedCount} words.</h3>`;
            } else {
                 reportHTML += "<h3>Action Taken: None (Dry Run).</h3>";
            }
        } else {
            reportHTML += "<h2>Analysis complete. No words were flagged as harmful.</h2>";
            console.log("\n--- Analysis complete. No words were flagged. ---");
        }
    } catch (err) {
        console.error("\n--- AN UNEXPECTED ERROR OCCURRED ---", err);
        reportHTML += `<h2>Script Failed!</h2><p>The moderation script encountered an unexpected error.</p><pre>${err.stack}</pre>`;
    } finally {
        if (dbClient) await dbClient.end();
        console.log("\nDatabase connection closed.");
        await sendReportEmail(reportHTML); // Send the email report before exiting
    }
}

moderateWords();