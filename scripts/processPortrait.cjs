// scripts/processPortrait.js

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');

async function generateLayoutWithPython(politicianId, outputJsonPath) {
    return new Promise((resolve, reject) => {
        const pythonExecutable = 'python3'; 
        const scriptPath = path.resolve(__dirname, 'processPortrait.py'); // Corrected to match your Python file name

        console.log(`Node.js: Spawning Python script -> ${pythonExecutable} ${scriptPath} ${politicianId}`);
        
        const pythonProcess = spawn(pythonExecutable, [scriptPath, String(politicianId)]);

        let jsonData = '';
        let errorData = '';

        pythonProcess.stdout.on('data', (data) => {
            jsonData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            const errLine = data.toString().trim();
            if (errLine) {
                console.error(`Python stderr: ${errLine}`);
            }
            errorData += data.toString();
        });

        pythonProcess.on('close', (code) => {
            // The Python script is now responsible for saving its own file.
            // This Node.js script's only job is to confirm it ran successfully.
            console.log(`Python script exited with code ${code}`);
            if (code === 0) {
                // If you still need the data in Node.js for some reason, you can parse it.
                // But we no longer save it from here.
                try {
                    const layoutData = jsonData.trim() ? JSON.parse(jsonData) : null;
                    if(layoutData){
                        console.log('Node.js: Python script finished and produced valid JSON.');
                        resolve(layoutData);
                    } else {
                        // This case handles when python exits 0 but has no output (e.g. no face detected)
                        reject(new Error(`Python script exited successfully but produced no JSON output. Check Python stderr: ${errorData || "No specific messages."}`));
                    }
                } catch (e) {
                     reject(new Error(`Failed to parse JSON from Python. Error: ${e.message}. Python stdout was: ${jsonData}`));
                }

            } else {
                reject(new Error(`Python script failed with code ${code}. Python Error: ${errorData || "No specific error output."}`));
            }
        });

        pythonProcess.on('error', (err) => {
            console.error('Node.js: Failed to start Python subprocess.', err);
            reject(err);
        });
    });
}


// --- Main dynamic function to handle command-line arguments ---
async function main() {
    const politicianId = process.argv[2]; 

    if (!politicianId || isNaN(Number(politicianId))) {
        console.error('ERROR: Please provide a valid politician_id as a numeric argument.');
        console.log('Usage: node scripts/processPortrait.js <politicianId>');
        console.log('Example: node scripts/processPortrait.js 1');
        process.exit(1);
    }

    try {
        console.log(`Node.js: Processing ID ${politicianId} using Python bridge...`);
        // We no longer need to pass a path from here. The Python script knows where to save its files.
        await generateLayoutWithPython(politicianId); 
        console.log(`Node.js: Successfully completed processing for ID ${politicianId}.`);

    } catch (error) {
        console.error(`Node.js: An error occurred in main() while processing ID ${politicianId} with Python:`);
        console.error(error.message); 
        process.exit(1); // Exit with a non-zero code to indicate failure
    }
}

// Execute the main function when the script is run.
main();