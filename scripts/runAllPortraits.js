const fs = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');

// --- Configuration ---
// __dirname is now '.../soap/scripts/'

// Project root is one level up from the 'scripts/' directory
const PROJECT_ROOT = path.resolve(__dirname, '..'); 

const PORTRAITS_DIR = path.join(PROJECT_ROOT, 'portraits'); // Correct: soap/portraits/
const PROCESS_SCRIPT_PATH = path.join(__dirname, 'processPortrait.js'); // Correct: soap/scripts/processPortrait.js

// --- End Configuration ---

function executeProcessScript(politicianId) {
    return new Promise((resolve, reject) => {
        const command = `node "${PROCESS_SCRIPT_PATH}" ${politicianId}`;
        console.log(`\nExecuting: ${command}`);

        const childProcess = exec(command, (error, stdout, stderr) => {
            if (stdout) {
                // Trim to avoid logging just empty newlines if stdout is only that
                const trimmedStdout = stdout.trim();
                if (trimmedStdout) console.log(`Stdout for ID ${politicianId}:\n${trimmedStdout}`);
            }
            if (stderr) {
                const trimmedStderr = stderr.trim();
                if (trimmedStderr) console.error(`Stderr for ID ${politicianId}:\n${trimmedStderr}`);
            }
            if (error) {
                console.error(`Error executing script for ID ${politicianId}:`, error);
                reject(error); 
                return;
            }
            resolve({ politicianId, stdout, stderr });
        });
    });
}

async function main() {
    console.log(`Looking for portraits in: ${PORTRAITS_DIR}`);
    let files;
    try {
        files = await fs.readdir(PORTRAITS_DIR);
    } catch (err) {
        console.error(`Error reading portraits directory ${PORTRAITS_DIR}:`, err);
        process.exit(1); // Exit if we can't read the portraits dir
    }

    const portraitRegex = /^portrait-(\d+)\.jpg$/i;
    const politicianIds = [];

    for (const file of files) {
        const match = file.match(portraitRegex);
        if (match && match[1]) {
            politicianIds.push(match[1]);
        }
    }

    if (politicianIds.length === 0) {
        console.log("No portraits found matching the pattern 'portrait-<id>.jpg'.");
        return;
    }

    politicianIds.sort((a, b) => parseInt(a, 10) - parseInt(b, 10)); // Sort IDs numerically
    console.log(`Found IDs to process: ${politicianIds.join(', ')}`);

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const id of politicianIds) {
        try {
            await executeProcessScript(id);
            // We assume processPortrait.js handles its own success/failure logging clearly.
            // A more robust way would be for processPortrait.js to exit with code 0 for success
            // and non-zero for failure, and check that here.
            // For now, we'll assume if exec doesn't error, the script was launched.
            results.push({ politicianId: id, status: 'Launched (check logs for details)' });
            successCount++;
            console.log(`--- Finished launching processing for ID ${id} ---`);
        } catch (err) {
            results.push({ politicianId: id, status: 'Failed to launch script', error: err.message });
            failCount++;
            console.error(`--- Critical error launching processing for ID ${id}. Moving to next. ---`);
        }
    }

    console.log("\n--- Batch Processing Summary ---");
    results.forEach(res => {
        if (res.status.includes('Failed')) {
            console.error(`ID ${res.politicianId}: ${res.status} - ${res.error || 'Check stderr above'}`);
        } else {
            console.log(`ID ${res.politicianId}: ${res.status}`);
        }
    });
    console.log(`\nSuccessfully launched: ${successCount}, Failed to launch: ${failCount}`);
    console.log("Batch processing complete.");
    if (failCount > 0) {
        process.exitCode = 1; // Indicate a non-zero exit code if there were failures
    }
}

main().catch(err => {
    console.error("Unhandled error in main runner:", err);
    process.exit(1); // Ensure non-zero exit for unhandled errors
});