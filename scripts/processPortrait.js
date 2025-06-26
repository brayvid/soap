// scripts/processPortrait.js

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');

async function generateLayoutWithPython(politicianId, outputJsonPath) {
    return new Promise((resolve, reject) => {
        // Adjust 'python3' if your Python executable is named differently (e.g., 'python')
        // or if you need to use a specific path to a virtual environment's Python.
        const pythonExecutable = 'python3'; 

        // Assuming process_portrait_py.py is in the same 'scripts/' directory as this Node.js script.
        // __dirname in Node.js refers to the directory of the current module.
        const scriptPath = path.resolve(__dirname, 'processPortrait.py'); 

        console.log(`Node.js: Spawning Python script -> ${pythonExecutable} ${scriptPath} ${politicianId}`);
        
        // Spawn the Python process, passing the script path and politicianId as arguments.
        const pythonProcess = spawn(pythonExecutable, [scriptPath, String(politicianId)]);

        let jsonData = ''; // To accumulate data from Python's stdout
        let errorData = ''; // To accumulate data from Python's stderr

        // Listen for data from Python's standard output
        pythonProcess.stdout.on('data', (data) => {
            jsonData += data.toString();
        });

        // Listen for data from Python's standard error
        pythonProcess.stderr.on('data', (data) => {
            const errLine = data.toString().trim();
            if (errLine) { // Only log if there's actual error content
                console.error(`Python stderr: ${errLine}`);
            }
            errorData += data.toString();
        });

        // Listen for when the Python process closes
        pythonProcess.on('close', async (code) => {
            console.log(`Python script exited with code ${code}`);
            if (code === 0 && jsonData.trim() !== '') {
                try {
                    // Python script prints JSON to stdout, parse it here.
                    const layoutData = JSON.parse(jsonData); 
                    
                    // Ensure the output directory exists before writing the file.
                    await fs.mkdir(path.dirname(outputJsonPath), { recursive: true });
                    // Write the parsed layout data to the specified output path.
                    await fs.writeFile(outputJsonPath, JSON.stringify(layoutData, null, 2));
                    
                    console.log('Node.js: Successfully created layout file from Python output at:', outputJsonPath);
                    resolve(layoutData); // Resolve the promise with the layout data
                } catch (parseError) {
                    console.error('Node.js: Error parsing JSON from Python script:', parseError);
                    console.error('Python stdout was:', jsonData); // Log what Python sent
                    reject(new Error('Failed to parse JSON from Python: ' + parseError.message + "\nErrorData from Python: " + errorData));
                }
            } else if (code !== 0) {
                // Python script exited with an error code.
                reject(new Error(`Python script failed with code ${code}. Python Error: ${errorData || "No specific error output from Python. Check Python script logs."} Python Stdout: ${jsonData}`));
            } else { 
                // Python script exited successfully (code 0) but produced no JSON output.
                // This might happen if no face was detected or the image wasn't found by Python.
                reject(new Error(`Python script exited successfully but produced no JSON output. This might mean no face was detected or the image was not found by the Python script. Python stderr: ${errorData || "No specific error messages from Python."}`));
            }
        });

        // Listen for errors in spawning the Python process itself
        pythonProcess.on('error', (err) => {
            console.error('Node.js: Failed to start Python subprocess.', err);
            reject(err); // Reject the promise if the subprocess fails to start
        });
    });
}


// --- Main dynamic function to handle command-line arguments ---
async function main() {
    // process.argv[2] is the first actual argument from the command line (e.g., the ID)
    const politicianId = process.argv[2]; 

    if (!politicianId || isNaN(Number(politicianId))) {
        console.error('ERROR: Please provide a valid politician_id as a numeric argument.');
        console.log('Usage: node scripts/processPortrait.js <politicianId>');
        console.log('Example: node scripts/processPortrait.js 1');
        return; // Exit if no valid ID is provided
    }

    try {
        // Node.js determines the final output path for the JSON file.
        const outputFileName = `layout-${politicianId}.json`;
        // This assumes processPortrait.js is in 'scripts/' and output is 'public/data/' at project root
        const outputJsonPath = path.resolve(__dirname, '..', 'public', 'data', outputFileName);

        console.log(`Node.js: Processing ID ${politicianId} using Python bridge...`);
        // Call the function that manages the Python script execution.
        // Pass the ID and the desired final output path for the JSON.
        await generateLayoutWithPython(politicianId, outputJsonPath); 

    } catch (error) {
        console.error(`Node.js: An error occurred in main() while processing ID ${politicianId} with Python:`);
        // Log the error message. The full error object might have more details if needed.
        console.error(error.message); 
    }
}

// Execute the main function when the script is run.
main();