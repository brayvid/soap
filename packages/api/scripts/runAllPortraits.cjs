const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// --- Configuration ---
const PROJECT_ROOT = path.resolve(__dirname, '..'); 
const ORIGINALS_DIR = path.join(PROJECT_ROOT, 'originals');
const PORTRAITS_OUTPUT_DIR = path.join(PROJECT_ROOT, 'portraits');
const DATA_OUTPUT_DIR = path.join(PROJECT_ROOT, 'data');
const PROCESS_SCRIPT_PATH = path.join(__dirname, 'processPortrait.cjs');

// --- End Configuration ---

function executeProcessScript(politicianId) {
    return new Promise((resolve, reject) => {
        const command = `node "${PROCESS_SCRIPT_PATH}" ${politicianId}`;
        console.log(`\nExecuting: ${command}`);

        const childProcess = exec(command, (error, stdout, stderr) => {
            if (stdout) {
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
    const forceRun = process.argv.includes('--force');
    if (forceRun) {
        console.log("--- FORCE RUN enabled: All portraits will be re-processed. ---");
    }

    console.log(`Looking for original portraits in: ${ORIGINALS_DIR}`);
    let files;
    try {
        files = fs.readdirSync(ORIGINALS_DIR);
    } catch (err) {
        console.error(`Error reading originals directory ${ORIGINALS_DIR}:`, err);
        process.exit(1);
    }

    const portraitRegex = /^original-(\d+)\.jpg$/i;
    const politicianIds = [];

    for (const file of files) {
        const match = file.match(portraitRegex);
        if (match && match[1]) {
            politicianIds.push(match[1]);
        }
    }

    if (politicianIds.length === 0) {
        console.log("No portraits found matching the pattern 'original-<id>.jpg'.");
        return;
    }

    politicianIds.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    console.log(`Found ${politicianIds.length} potential IDs to process.`);

    let processedCount = 0;
    let skippedCount = 0;
    let failCount = 0;

    for (const id of politicianIds) {
        const portraitPath = path.join(PORTRAITS_OUTPUT_DIR, `portrait-${id}.jpg`);
        const layoutPath = path.join(DATA_OUTPUT_DIR, `layout-${id}.json`);

        if (!forceRun && fs.existsSync(portraitPath) && fs.existsSync(layoutPath)) {
            console.log(`Skipping ID ${id}: Output files already exist.`);
            skippedCount++;
            continue;
        }

        try {
            await executeProcessScript(id);
            processedCount++;
            console.log(`--- Finished processing for ID ${id} ---`);
        } catch (err) {
            failCount++;
            console.error(`--- Critical error processing for ID ${id}. Moving to next. ---`);
        }
    }

    console.log("\n--- Batch Processing Summary ---");
    console.log(`Successfully processed: ${processedCount}`);
    console.log(`Skipped (already exist): ${skippedCount}`);
    console.log(`Failed: ${failCount}`);
    console.log("Batch processing complete.");

    if (failCount > 0) {
        process.exitCode = 1;
    }
}

main().catch(err => {
    console.error("Unhandled error in main runner:", err);
    process.exit(1);
});