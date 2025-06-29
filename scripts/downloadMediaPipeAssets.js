const https = require('https');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const MEDIAPIPE_VERSION = '0.10.9'; // Ensure this matches the version you intend to use
const BASE_CDN_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm/`;
const MODEL_CDN_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const PROJECT_ROOT = path.resolve(__dirname, '..'); // Assumes this script is run from the project root
// Or if this script is in 'scripts/', use: const PROJECT_ROOT = path.resolve(__dirname, '..');


const WASM_FILES_TO_DOWNLOAD = [
    'vision_wasm_internal.js',
    'vision_wasm_internal.wasm'
];
const MODEL_FILE_NAME = 'face_landmarker.task';

const WASM_DEST_DIR = path.join(PROJECT_ROOT, 'models', 'mediapipe-wasm');
const MODEL_DEST_DIR = path.join(PROJECT_ROOT, 'models');
// --- End Configuration ---

// Helper function to download a file
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const directory = path.dirname(destPath);
        fs.mkdirSync(directory, { recursive: true }); // Ensure directory exists

        const file = fs.createWriteStream(destPath);
        console.log(`Downloading ${url} to ${destPath}...`);

        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => {
                    console.log(`Downloaded ${path.basename(destPath)} successfully.`);
                    resolve();
                });
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {}); // Delete the file if download fails
            reject(err);
        });
    });
}

async function main() {
    console.log('Starting download of MediaPipe assets...');

    // Create base directories if they don't exist
    if (!fs.existsSync(WASM_DEST_DIR)) {
        fs.mkdirSync(WASM_DEST_DIR, { recursive: true });
        console.log(`Created directory: ${WASM_DEST_DIR}`);
    }
    if (!fs.existsSync(MODEL_DEST_DIR)) {
        fs.mkdirSync(MODEL_DEST_DIR, { recursive: true });
        console.log(`Created directory: ${MODEL_DEST_DIR}`);
    }

    try {
        // Download WASM files
        for (const fileName of WASM_FILES_TO_DOWNLOAD) {
            const url = BASE_CDN_URL + fileName;
            const destPath = path.join(WASM_DEST_DIR, fileName);
            await downloadFile(url, destPath);
        }

        // Download Model file
        const modelDestPath = path.join(MODEL_DEST_DIR, MODEL_FILE_NAME);
        await downloadFile(MODEL_CDN_URL, modelDestPath);

        console.log('\nAll MediaPipe assets downloaded successfully!');
        console.log(`Model file: ${modelDestPath}`);
        console.log(`WASM files in: ${WASM_DEST_DIR}`);

    } catch (error) {
        console.error('\nError downloading MediaPipe assets:', error);
    }
}

main();