// Copyright 2024-2025 soap.fyi <https://soap.fyi>

// scripts/processPortrait.js
const fs = require('fs/promises');
const path = require('path');
const canvas = require('canvas');
const faceapi = require('@vladmandic/face-api');

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// Helper to normalize a point, ensuring it has x and y properties, not _x and _y
const normalizePoint = (point) => ({
    x: point.x || point._x,
    y: point.y || point._y
});

// Helper to find the center point of a set of landmarks, using the normalizer
const getCenter = (points) => {
    const sum = points.reduce((acc, p) => {
        const normP = normalizePoint(p);
        return { x: acc.x + normP.x, y: acc.y + normP.y };
    }, { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
};

async function generateLayout(portraitPath, outputPath) {
  console.log('Loading models...');
  await faceapi.nets.ssdMobilenetv1.loadFromDisk('./models');
  await faceapi.nets.faceLandmark68Net.loadFromDisk('./models');

  console.log('Processing image:', portraitPath);
  try {
    const img = await canvas.loadImage(portraitPath);
    const detection = await faceapi.detectSingleFace(img).withFaceLandmarks();
    if (!detection) {
      throw new Error(`Could not detect a face in the image at ${portraitPath}.`);
    }

    const { landmarks, detection: { box } } = detection;

    const layoutData = {
      canvasWidth: box.width,
      canvasHeight: box.height,
      features: [
        { name: "left_eye",  ...getCenter(landmarks.getLeftEye()),  strength: 1.0 },
        { name: "right_eye", ...getCenter(landmarks.getRightEye()), strength: 1.0 },
        { name: "mouth",     ...getCenter(landmarks.getMouth()),     strength: 0.8 },
        { name: "nose",      ...getCenter(landmarks.getNose()),      strength: 0.4 },
        { name: "chin",      ...normalizePoint(landmarks.getJawOutline()[8]), strength: 0.6 }
      ],
      boundary: landmarks.getJawOutline().map(normalizePoint)
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(layoutData, null, 2));
    console.log('Successfully created layout file at:', outputPath);

  } catch (error) {
      console.error(`\nERROR: Could not load or process the image at "${portraitPath}".`);
      console.error('Please ensure the file exists and is a valid image.\n');
      throw error;
  }
}

// --- NEW DYNAMIC MAIN FUNCTION ---
async function main() {
    // process.argv[2] is the first actual argument from the command line
    const politicianId = process.argv[2];

    if (!politicianId || isNaN(Number(politicianId))) {
        console.error('ERROR: Please provide a valid politician_id as an argument.');
        console.log('Usage: node scripts/processPortrait.js 1');
        return;
    }

    try {
        const inputFileName = `portrait-${politicianId}.jpg`;
        const inputPath = path.join('./portraits', inputFileName);
        
        const outputFileName = `layout-${politicianId}.json`;
        const outputPath = path.join('./public/data', outputFileName);

        await generateLayout(inputPath, outputPath);

    } catch (error) {
        console.error(`An error occurred while processing ID ${politicianId}:`);
        // The specific error is already logged in generateLayout, so we just exit
    }
}

main();