// Copyright 2024-2025 soap.fyi <https://soap.fyi>

import './styles.css';
import * as d3 from 'd3';

// --- GLOBAL VARIABLES FOR STATE MANAGEMENT ---
let currentVoteData = [];
let currentPoliticianId = null;
let layoutData = null; 
let socket = null; 

// NEW: State for the time-fade toggle
let isTimeFadeEnabled = false;

let rateLimitMessageElement = null;
let rateLimitMessageTimeoutId = null;
const RATE_LIMIT_MESSAGE_TEXT = "Rate limit exceeded";

// --- MEDIAPIPE LANDMARK INDICES ---
const MOUTH_OUTER_CONTOUR_INDICES = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const LEFT_EYE_CONTOUR_INDICES = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE_CONTOUR_INDICES = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const NOSE_TIP_INDEX = 4;
const CHIN_POINT_INDEX = 152;
const FACE_SILHOUETTE_INDICES = [
  10,  338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 
  172, 58,  132, 93,  234, 127, 162, 21,  54,  103, 67,  109
];
// --- END MEDIAPIPE LANDMARK INDICES ---


// --- HELPER FUNCTIONS ---

function getBubbleFillStyle(score) {
    const BUBBLE_OPACITY = 0.75;
    let colorString;

    const positiveColorScale = d3.scaleLinear().domain([0.05, 1.0]).range(['#9fad42', '#2a8d64']).clamp(true);
    const negativeColorScale = d3.scaleLinear().domain([-0.05, -1.0]).range(['#CDb14c', '#DE3B3B']).clamp(true);

    if (score >= 0.05) {
        colorString = positiveColorScale(score);
    } else if (score <= -0.05) {
        colorString = negativeColorScale(score);
    } else {
        colorString = '#BFBFBF';
    }
    
    // Opacity is now constant and NOT affected by time.
    return { fill: colorString, fillOpacity: BUBBLE_OPACITY };
}

function polygonArea(points) {
    let area = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        area += (points[j].x + points[i].x) * (points[j].y - points[i].y);
    }
    return Math.abs(area / 2);
}

function isInside(point, vs) {
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number' || isNaN(point.x) || isNaN(point.y)) return false;
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y;
        let xj = vs[j].x, yj = vs[j].y;
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function getPointsByIndices(allPoints, indices) {
    if (!allPoints || !indices) return [];
    return indices.map(index => allPoints[index]).filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
}

function getCenterOfPoints(points) {
    if (!points || points.length === 0) return null;
    const sumX = points.reduce((acc, p) => acc + p.x, 0);
    const sumY = points.reduce((acc, p) => acc + p.y, 0);
    return { x: sumX / points.length, y: sumY / points.length };
}

function createMessageElement(msgText) {
    const el = document.createElement('div');
    el.innerText = msgText;
    el.style.position = 'fixed'; el.style.bottom = '20px'; el.style.left = '50%';
    el.style.transform = 'translateX(-50%)'; el.style.background = '#ff3860';
    el.style.color = 'white'; el.style.padding = '10px 20px';
    el.style.borderRadius = '8px'; el.style.zIndex = 1000;
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    el.style.fontFamily = 'sans-serif'; el.style.fontSize = '1rem';
    document.body.appendChild(el);
    return el;
}

function showMessage(msg) {
    if (msg === RATE_LIMIT_MESSAGE_TEXT) {
        if (rateLimitMessageElement && document.body.contains(rateLimitMessageElement)) {
            clearTimeout(rateLimitMessageTimeoutId);
            rateLimitMessageTimeoutId = setTimeout(() => {
                if (rateLimitMessageElement) rateLimitMessageElement.remove();
                rateLimitMessageElement = null; rateLimitMessageTimeoutId = null;
            }, 5000);
            return; 
        } else {
            if (rateLimitMessageTimeoutId) clearTimeout(rateLimitMessageTimeoutId);
            if (rateLimitMessageElement && rateLimitMessageElement.parentElement) rateLimitMessageElement.remove();
            rateLimitMessageElement = createMessageElement(msg);
            rateLimitMessageTimeoutId = setTimeout(() => {
                if (rateLimitMessageElement) rateLimitMessageElement.remove();
                rateLimitMessageElement = null; rateLimitMessageTimeoutId = null;
            }, 5000);
            return;
        }
    }
    const el = createMessageElement(msg);
    setTimeout(() => { el.remove(); }, 5000);
}

function mulberry32(seed) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

/**
 * Processes raw vote data, applying a time-based decay to the vote counts if enabled.
 * IMPORTANT: This function assumes each vote object 'd' has a 'last_voted_at' property,
 * which is an ISO 8601 timestamp string from the server.
 * @param {Array} rawData The original array of vote data from the server.
 * @returns {Array} The processed data, ready for visualization.
 */
function processVoteDataForDisplay(rawData) {
    if (!isTimeFadeEnabled) {
        // If fade is off, just format the data as before, adding a default decayFactor of 1.
        return rawData.map(d => ({ ...d, decayFactor: 1.0 }));
    }

    const FADE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    const now = Date.now();

    const processedData = rawData.map(d => {
        if (!d.last_voted_at) {
            console.warn(`Word "${d.word}" is missing 'last_voted_at' timestamp. It will not be faded.`);
            return { ...d, decayFactor: 1.0 }; // Treat as new if no timestamp
        }

        const lastVoteTime = new Date(d.last_voted_at).getTime();
        const ageMs = now - lastVoteTime;

        // Calculate a decay factor (0.0 to 1.0). 1.0 is brand new, 0.0 is 1 month or older.
        const decayFactor = Math.max(0, 1 - (ageMs / FADE_DURATION_MS));
        
        // Adjust the count (value) based on the decay.
        const decayedCount = d.count * decayFactor;

        return {
            ...d,
            count: decayedCount, // Use the new decayed count for sizing
            decayFactor: decayFactor // Pass the factor for opacity
        };
    });

    // Filter out bubbles that have completely faded (shrunk to nothing)
    return processedData.filter(d => d.count >= 0.1); // Use a small threshold to avoid floating point issues
}


// --- DATA LOADING & DRAWING ---
function loadPoliticianData() {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const politicianId = pathParts[pathParts.length - 1];
    
    if (!politicianId || isNaN(Number(politicianId))) { 
        console.error("🔴 Invalid or missing politician ID in URL:", window.location.pathname);
        window.location.href = '/404.html'; 
        return; 
    }
    currentPoliticianId = politicianId;
    console.log(`Loading data for politician ID: ${currentPoliticianId}`);

    const politicianDataPromise = fetch(`/politician/${politicianId}/data`).then(res => {
        if (!res.ok) throw new Error(`Politician data not found (status ${res.status})`);
        return res.json();
    });

    const layoutDataPromise = fetch(`/data/layout-${politicianId}.json`).then(res => {
        if (!res.ok) {
            console.warn(`🟡 Layout file /data/layout-${politicianId}.json not found. Using fallback.`);
            return null;
        }
        return res.json();
    });

    Promise.all([politicianDataPromise, layoutDataPromise])
    .then(([politicianData, fetchedLayoutData]) => {
        if (!politicianData || !politicianData.politician) {
            console.error('🔴 Critical error: Politician core data object not loaded.');
            window.location.href = '/404.html';
            return;
        }

        layoutData = fetchedLayoutData; 

        document.getElementById('politician-name').textContent = politicianData.politician.name;
        document.getElementById('politician-position').textContent = politicianData.politician.position;
        // Store the raw, unmodified data
        currentVoteData = politicianData.votesForPolitician || [];
        
        // Call the new redraw function which handles data processing
        redrawChartWithCurrentSettings();

        if (currentPoliticianId) {
            initializeSocket(currentPoliticianId);
        }

    }).catch(err => {
        console.error("🔴 ERROR in initial data loading:", err.message, err.stack);
        window.location.href = '/404.html';
    });
}

// Central function to redraw the chart using current settings
function redrawChartWithCurrentSettings() {
    const bubbleContainer = document.getElementById('bubble-chart-container');
    if (!bubbleContainer) return;
    
    // Process the master data based on the current toggle state
    const dataForDisplay = processVoteDataForDisplay(currentVoteData);

    if (!dataForDisplay || dataForDisplay.length === 0) {
        // AFTER
        bubbleContainer.innerHTML = `<div style="text-align: center; padding: 1rem;">Be the first to add a word.</div>`;
        bubbleContainer.classList.add('bubble-empty');
        bubbleContainer.classList.remove('bubble-active');
    } else {
        if (!document.getElementById('bubble-chart')) {
             bubbleContainer.innerHTML = `<svg id="bubble-chart"></svg>`;
        }
        bubbleContainer.classList.remove('bubble-empty');
        bubbleContainer.classList.add('bubble-active');
        drawBubbleChart(dataForDisplay);
    }
}

function drawBubbleChart(processedVoteData) { // Now receives processed data
    try {
        const data = processedVoteData.map(entry => ({
            word: entry.word, 
            value: entry.count, // This is now the (potentially decayed) count
            score: entry.sentiment_score,
            decayFactor: entry.decayFactor // Pass the decay factor through
        }));

        if (data.length === 0) {
            const svg = d3.select("#bubble-chart");
            if (svg && !svg.empty()) svg.selectAll("*").remove();
            return;
        }

        if (layoutData && layoutData.all_points && layoutData.all_points.length > 0) {
            drawFaceLayout(data);
        } else {
            console.warn("🟡 Fallback layout triggered.");
            drawFallbackLayout(data);
        }
    } catch (err) {
        console.error("🔴 ERROR in drawBubbleChart:", err.message, err.stack);
    }
}

function drawFallbackLayout(data) {
    try {
        const svg = d3.select("#bubble-chart");
        if (svg.empty()) return;
        svg.selectAll("*").remove();
        const container = document.getElementById('bubble-chart-container');
        if (!container) return;
        const PACK_LAYOUT_DIMENSION = Math.min(container.clientWidth, container.clientHeight) || 500;

        const pack = d3.pack().size([PACK_LAYOUT_DIMENSION, PACK_LAYOUT_DIMENSION]).padding(5);
        const totalSubmissionCount = d3.sum(data, d => d.value) || 1;
        const root = d3.hierarchy({ children: data }).sum(d => d.value / totalSubmissionCount);
        const nodes = pack(root).leaves();

        svg.attr("viewBox", `0 0 ${PACK_LAYOUT_DIMENSION} ${PACK_LAYOUT_DIMENSION}`)
           .attr("preserveAspectRatio", "xMidYMid meet");

        const circleGroups = svg.selectAll("g.bubble-circle-group")
            .data(nodes, d => d.data.word).join("g")
            .attr("class", "bubble-circle-group")
            .attr('transform', d => `translate(${d.x},${d.y})`);

        circleGroups.append("circle")
            .attr("r", d => d.r)
            .attr("fill", d => getBubbleFillStyle(d.data.score).fill)
            .attr("fill-opacity", d => getBubbleFillStyle(d.data.score).fillOpacity)
            .style("cursor", "pointer")
            .on("click", (event, d) => voteForWord(d.data.word, currentPoliticianId));

        circleGroups.append("text")
            .text(d => d.data.word)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .style("fill", "#000")
            .style("font-family", "Inter, sans-serif")
            .style("pointer-events", "none")
            .each(function(d) {
                const textSelection = d3.select(this);
                const availableWidth = d.r * 1.9;
                textSelection.style("font-size", "10px");
                const naturalWidth = this.getComputedTextLength();
                if (naturalWidth === 0) return;
                const newFontSize = (10 * availableWidth) / naturalWidth;
                textSelection.style("font-size", `${Math.min(d.r * 1.4, Math.max(newFontSize, 6))}px`);
            });
            
    } catch (err) {
        console.error("🔴 ERROR IN drawFallbackLayout:", err.message, err.stack);
    }
}

function drawFaceLayout(data) {
    try {
        const svg = d3.select("#bubble-chart");
        if (svg.empty()) return;
        svg.selectAll("*").remove();
        
        const allPoints = layoutData.all_points;
        const canvasWidth = layoutData.canvasWidth;
        const canvasHeight = layoutData.canvasHeight;
        const headShapePoints = getPointsByIndices(allPoints, FACE_SILHOUETTE_INDICES);
        
        if (headShapePoints.length < 3 || !canvasWidth || !canvasHeight) {
            drawFallbackLayout(data);
            return;
        }
        const faceCentroid = getCenterOfPoints(headShapePoints);
        if (!faceCentroid) {
            drawFallbackLayout(data);
            return;
        }

        svg.attr("viewBox", `0 0 ${canvasWidth} ${canvasHeight}`)
           .attr("preserveAspectRatio", "xMidYMid meet");

        const faceArea = polygonArea(headShapePoints);
        const POWER_SCALE = 1.05; 
        const scaledTotalVoteValue = d3.sum(data, d => Math.pow(d.value, POWER_SCALE)) || 1;
        const targetCoverage = 0.9; 
        const scalingFactor = (faceArea * targetCoverage) / scaledTotalVoteValue;
        const dataSignature = data.length + d3.sum(data, d => d.value);
        const seed = parseInt(currentPoliticianId) * dataSignature;
        const random = mulberry32(seed);
        const featureTargets = [
            getCenterOfPoints(getPointsByIndices(allPoints, LEFT_EYE_CONTOUR_INDICES)),
            getCenterOfPoints(getPointsByIndices(allPoints, RIGHT_EYE_CONTOUR_INDICES)),
            allPoints[NOSE_TIP_INDEX],
            getCenterOfPoints(getPointsByIndices(allPoints, MOUTH_OUTER_CONTOUR_INDICES)),
            allPoints[CHIN_POINT_INDEX] 
        ].filter(p => p);
        const sortedByPop = [...data].sort((a, b) => b.value - a.value);
        const ANCHOR_COUNT = Math.min(featureTargets.length, sortedByPop.length, 5);
        
        const nodes = sortedByPop.map((d, i) => {
            const scaledValue = Math.pow(d.value, POWER_SCALE);
            const bubbleArea = scaledValue * scalingFactor;
            let radius = Math.sqrt(bubbleArea / Math.PI);
            radius = isNaN(radius) || radius < 3 ? 3 : Math.max(radius, 3);
            let targetX, targetY, isAnchor = false, forceStrengthModifier = 0.05;
            if (i < ANCHOR_COUNT && featureTargets[i]) {
                targetX = featureTargets[i].x;
                targetY = featureTargets[i].y;
                isAnchor = true;
                forceStrengthModifier = 0.5;
            } else {
                let attempts = 0, pointFound = false;
                do {
                    const angle = random() * 2 * Math.PI, dist = random() * Math.min(canvasWidth, canvasHeight) * 0.4; 
                    targetX = faceCentroid.x + Math.cos(angle) * dist;
                    targetY = faceCentroid.y + Math.sin(angle) * dist;
                    pointFound = isInside({x: targetX, y: targetY}, headShapePoints);
                } while (!pointFound && ++attempts < 100); 
                if (!pointFound) { targetX = faceCentroid.x; targetY = faceCentroid.y; }
                forceStrengthModifier = 0.02 + (random() * 0.03);
            }
            return { 
                ...d, // This carries over word, score, value, and decayFactor
                radius, 
                isAnchor, 
                targetX, 
                targetY, 
                forceStrengthModifier, 
                x: targetX + (random() - 0.5), 
                y: targetY + (random() - 0.5) 
            };
        });

        const simulation = d3.forceSimulation(nodes)
            .force("collide", d3.forceCollide().radius(d => d.radius + 1.2).strength(0.9))
            .force("x_target", d3.forceX().strength(d => d.forceStrengthModifier).x(d => d.targetX))
            .force("y_target", d3.forceY().strength(d => d.forceStrengthModifier).y(d => d.targetY))
            .force("boundary", alpha => {
                for (const node of nodes) {
                    if (!isInside(node, headShapePoints)) {
                        node.vx += (faceCentroid.x - node.x) * 0.3 * alpha;
                        node.vy += (faceCentroid.y - node.y) * 0.3 * alpha;
                    }
                }
            })
            .force("center_overall", d3.forceCenter(faceCentroid.x, faceCentroid.y).strength(0.04))
            .stop();
        for (let i = 0; i < 300; ++i) simulation.tick();
        
        const chartGroup = svg.append("g");

        chartGroup.append("image")
            .attr("href", `/portraits/portrait-${currentPoliticianId}.jpg`)
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", canvasWidth)
            .attr("height", canvasHeight);
        
        nodes.sort((a,b) => a.radius - b.radius); 

        const circleLayer = chartGroup.append("g")
            .attr("class", "circle-layer")
            .style("mix-blend-mode", "multiply");

        const textLayer = chartGroup.append("g")
            .attr("class", "text-layer")
            .style("mix-blend-mode", "normal");

        const circleGroups = circleLayer.selectAll("g.bubble-circle-group")
            .data(nodes, d => d.word).join("g")
            .attr("class", "bubble-circle-group")
            .attr('transform', d => `translate(${d.x.toFixed(2)},${d.y.toFixed(2)})`);

        circleGroups.append("circle")
            .attr("r", d => d.radius)
            .attr("fill", d => getBubbleFillStyle(d.score, d.decayFactor).fill)
            .attr("fill-opacity", d => getBubbleFillStyle(d.score, d.decayFactor).fillOpacity)
            .style("cursor", "pointer")
            .on("click", (event, d) => voteForWord(d.word, currentPoliticianId));
        
        const textGroups = textLayer.selectAll("g.bubble-text-group")
            .data(nodes, d => d.word).join("g")
            .attr("class", "bubble-text-group")
            .attr('transform', d => `translate(${d.x.toFixed(2)},${d.y.toFixed(2)})`);
            
        textGroups.append("text")
            .text(d => d.word)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .style("fill", "#fff")
            .style("font-family", "Inter, sans-serif")
            .style("pointer-events", "none")
            .each(function(d) {
                const textSelection = d3.select(this);
                const availableWidth = d.radius * 1.9;
                textSelection.style("font-size", "10px");
                const naturalWidth = this.getComputedTextLength();
                if (naturalWidth === 0) return;
                const newFontSize = (10 * availableWidth) / naturalWidth;
                textSelection.style("font-size", `${Math.min(d.radius * 1.4, Math.max(newFontSize, 6))}px`);
            });

    } catch (err) {
        console.error("🔴 ERROR IN drawFaceLayout:", err.message, err.stack);
    }
}

// --- EVENT HANDLERS AND REAL-TIME LOGIC ---
function voteForWord(word, politicianId) {
    if (!word || !politicianId) return;
    fetch('/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, politician_id: Number(politicianId) }),
    }).then(async (response) => {
        if (response.status === 429) showMessage(RATE_LIMIT_MESSAGE_TEXT);
        else if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            showMessage(errData.error || "Error submitting vote.");
        }
    }).catch(err => {
        console.error('🔴 Vote error:', err);
        showMessage("A network error occurred while voting.");
    });
}

function submitNewWord(event) {
    event.preventDefault();
    const newWordInput = document.getElementById('new-word');
    const newWord = newWordInput.value.trim();
    if (newWord && currentPoliticianId) {
        voteForWord(newWord, currentPoliticianId);
    }
    newWordInput.value = '';
}

function initializeSocket(politicianIdForSocket) {
    if (!politicianIdForSocket || typeof io === 'undefined') return;
    if (socket && socket.connected) socket.disconnect();
    
    socket = io(); 
    socket.on('connect', () => {
        console.log(`Socket connected. Listening for wordsUpdated:${politicianIdForSocket}`);
    });

    socket.on(`wordsUpdated:${politicianIdForSocket}`, (updatedWords) => {
        console.log(`Received updated words for ID ${politicianIdForSocket}.`);
        // Store the new raw data
        currentVoteData = updatedWords; 

        try {
            // Call the central redraw function
            redrawChartWithCurrentSettings();
        } catch (err) {
            console.error("🔴 ERROR in socket wordsUpdated handler:", err.message, err.stack);
        }
    });

    socket.on('disconnect', (reason) => console.log('Disconnected. Reason:', reason));
    socket.on('connect_error', (err) => console.error('🔴 Socket connection error:', err.message));
}

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        // Call the central redraw function on resize
        if (currentVoteData && currentVoteData.length > 0) {
            redrawChartWithCurrentSettings(); 
        }
    }, 200);
});

document.addEventListener('DOMContentLoaded', () => {
    try {
        if (!/^\/politician\/\d+$/.test(window.location.pathname)) return;
        
        if (!document.getElementById('politician-name') || !document.getElementById('politician-position') || !document.getElementById('bubble-chart-container')) {
            throw new Error("Critical HTML elements for politician page are missing.");
        }
        
        loadPoliticianData(); 
        
        const form = document.getElementById('add-word-form');
        if (form) form.addEventListener('submit', submitNewWord);
        
        // Event listener for the time-fade toggle
        const timeFadeToggle = document.getElementById('time-fade-toggle');
        if (timeFadeToggle) {
            timeFadeToggle.addEventListener('change', (event) => {
                isTimeFadeEnabled = event.target.checked;
                console.log(`Time fade mode ${isTimeFadeEnabled ? 'enabled' : 'disabled'}. Redrawing chart.`);
                // Redraw the chart with the new setting, using the existing data
                redrawChartWithCurrentSettings();
            });
        }
        
    } catch (err) {
        console.error("🔴 ERROR in DOMContentLoaded:", err.message, err.stack);
        document.body.innerHTML = `<div style="color: red; padding: 20px; text-align: center;">A critical error occurred. Please check the console.</div>`;
    }
});