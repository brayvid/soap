const express = require('express');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const fastcsv = require('fast-csv');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Paths to CSV files
const politiciansFilePath = path.join(__dirname, 'politicians.csv');
const wordsFilePath = path.join(__dirname, 'words.csv');
const votesFilePath = path.join(__dirname, 'votes.csv');

// Helper function to read CSV file and filter out empty or malformed records
function readCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => {
                // Add a condition to check if data is valid
                if (Object.values(data).some(value => value)) {
                    results.push(data);
                } else {
                    console.warn(`Skipped invalid or empty record: ${JSON.stringify(data)}`);
                }
            })
            .on('end', () => {
                console.log(`Read ${results.length} valid records from ${filePath}`);
                resolve(results);
            })
            .on('error', (err) => {
                console.error(`Error reading file ${filePath}:`, err);
                reject(err);
            });
    });
}


// Route to get all politicians
app.get('/politicians', async (req, res) => {
    try {
        const politicians = await readCSV(politiciansFilePath);
        console.log('Politicians:', politicians);
        res.json(politicians);
    } catch (err) {
        console.error('Error reading politicians data:', err);
        res.status(500).send('Error reading politicians data');
    }
});

// Route to add a new politician
app.post('/politicians', async (req, res) => {
    const { name, position } = req.body;

    try {
        const politicians = await readCSV(politiciansFilePath);
        const newPoliticianId = politicians.length > 0 ? (parseInt(politicians[politicians.length - 1].politician_id) + 1).toString() : '1';
        const newPolitician = {
            politician_id: newPoliticianId,
            name: name,
            position: position,
            created_at: new Date().toISOString(),
        };

        appendToCSV(politiciansFilePath, newPolitician);

        res.status(201).send('Politician added successfully');
    } catch (err) {
        console.error('Error adding politician:', err);
        res.status(500).send('Error adding politician');
    }
});


app.get('/politician/:id/data', async (req, res) => {
    const politicianId = req.params.id;

    try {
        const politicians = await readCSV(politiciansFilePath);
        const words = await readCSV(wordsFilePath);
        const votes = await readCSV(votesFilePath);

        const politician = politicians.find(p => p.politician_id === politicianId);
        if (!politician) {
            console.error(`Politician with ID ${politicianId} not found`);
            return res.status(404).send('Politician not found');
        }

        // Aggregate votes for this politician
        const politicianVotes = votes.filter(vote => vote.politician_id === politicianId);
        const wordCountsForPolitician = words.reduce((acc, word) => {
            acc[word.word] = 0; // Initialize all words to 0 votes
            return acc;
        }, {});

        politicianVotes.forEach(vote => {
            const word = words.find(w => w.word_id === vote.word_id);
            if (word) {
                wordCountsForPolitician[word.word] += 1;
            }
        });

        console.log(`Returning data for politician ID ${politicianId}`);
        res.json({
            politician,
            votesForPolitician: wordCountsForPolitician,
        });
    } catch (err) {
        console.error('Error reading politician data:', err);
        res.status(500).send('Error reading politician data');
    }
});

// Route to submit a word and add a vote for a politician
app.post('/words', async (req, res) => {
    const { word, politician_id } = req.body;

    try {
        const words = await readCSV(wordsFilePath);
        const votes = await readCSV(votesFilePath);

        let wordEntry = words.find(w => w.word.toLowerCase() === word.toLowerCase());

        // If the word does not exist, add it to the words.csv
        if (!wordEntry) {
            const newWordId = words.length > 0 ? (parseInt(words[words.length - 1].word_id) + 1).toString() : '1';
            const newWord = {
                word_id: newWordId,
                word: word.toLowerCase(),
                created_at: new Date().toISOString(),
            };
            appendToCSV(wordsFilePath, newWord);
            wordEntry = newWord;
        }

        // Add a vote for the word and politician
        const newVoteId = votes.length > 0 ? (parseInt(votes[votes.length - 1].vote_id) + 1).toString() : '1';
        const newVote = {
            vote_id: newVoteId,
            user_id: '1', // In a real application, this should be dynamic based on the logged-in user
            politician_id: politician_id,
            word_id: wordEntry.word_id,
            created_at: new Date().toISOString(),
        };
        appendToCSV(votesFilePath, newVote);

        res.status(201).send('Word submitted and vote added');
    } catch (err) {
        console.error('Error handling word submission:', err);
        res.status(500).send('Error handling word submission');
    }
});

// Helper function to append a new row to a CSV file
function appendToCSV(filePath, data) {
    const ws = fs.createWriteStream(filePath, { flags: 'a' });
    ws.write('\n'); // Ensure a newline before writing new data
    fastcsv.write([data], { headers: false }).pipe(ws);
}

// Serve the homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the politician page
app.get('/politician/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'politician.html'));
});

// Start the server
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
