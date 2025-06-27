// Copyright 2024-2025 soap.fyi <https://soap.fyi>
// Filename: politician.js (for individual politician pages)

// --- GLOBAL VARIABLES FOR STATE MANAGEMENT ---
let currentVoteData = [];
let currentPoliticianId = null;
let layoutData = null; 
let socket = null; 

let rateLimitMessageElement = null;
let rateLimitMessageTimeoutId = null;
const RATE_LIMIT_MESSAGE_TEXT = "Rate limit exceeded for this IP";

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
    const BUBBLE_OPACITY = 1.0; // A fixed opacity for all bubbles.
    let colorString;

    if (score >= 0.05) {
        // Positive score: vary green from light to dark
        const strength = (score - 0.05) / (1.0 - 0.05); // Normalize score from 0 to 1
        const color = d3.hsl('#2E8B57'); // Start with SeaGreen
        color.l = 0.65 - (strength * 0.25); // Vary lightness from 65% down to 40%
        colorString = color.toString();
    } else if (score <= -0.05) {
        // Negative score: vary red from light to dark
        const strength = (Math.abs(score) - 0.05) / (1.0 - 0.05); // Normalize score from 0 to 1
        const color = d3.hsl('#CD5C5C'); // Start with IndianRed
        color.l = 0.75 - (strength * 0.20); // Vary lightness from 75% down to 55%
        colorString = color.toString();
    } else {
        // Neutral score
        colorString = '#BFBFBF';
    }
    
    // Return the calculated color and the fixed opacity.
    return { fill: colorString, fillOpacity: BUBBLE_OPACITY };
}


function polygonArea(points) {
    let area = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const p1x = points[i].x, p1y = points[i].y;
        const p2x = points[j].x, p2y = points[j].y;
        area += (p2x + p1x) * (p2y - p1y);
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
        if (!res.ok) {
            console.error(`🔴 Failed to fetch politician data for ID ${politicianId}. Status: ${res.status} ${res.statusText}`);
            throw new Error(`Politician data not found (status ${res.status})`);
        }
        return res.json();
    }).catch(err => {
        console.error("🔴 Fetch error for politicianDataPromise:", err.message, err.stack);
        throw err; 
    });

    const layoutDataPromise = fetch(`/data/layout-${politicianId}.json`).then(res => {
        if (!res.ok) {
            console.warn(`🟡 Layout file /data/layout-${politicianId}.json not found. Status: ${res.status}. Using fallback layout.`);
            return null;
        }
        return res.json();
    }).catch(err => {
        console.warn(`🟡 Fetch error for layoutDataPromise: ${err.message}. Using fallback for layout.`);
        return null;
    });

    Promise.all([politicianDataPromise, layoutDataPromise])
    .then(([politicianData, fetchedLayoutData]) => {
        if (!politicianData || !politicianData.politician) {
            console.error('🔴 Critical error: Politician core data object not loaded or incomplete.');
            window.location.href = '/404.html';
            return;
        }

        layoutData = fetchedLayoutData; 

        document.getElementById('politician-name').textContent = politicianData.politician.name;
        document.getElementById('politician-position').textContent = politicianData.politician.position;
        currentVoteData = politicianData.votesForPolitician || [];
        
        const bubbleContainer = document.getElementById('bubble-chart-container');
        if (!currentVoteData.some(v => v.count > 0)) {
            bubbleContainer.innerHTML = `<div style="text-align: center; padding: 1rem;">Be the first to add a word.</div>`;
            bubbleContainer.classList.add('bubble-empty');
            bubbleContainer.classList.remove('bubble-active');
        } else {
            bubbleContainer.innerHTML = `
                <div id="portrait-overlay"></div>
                <svg id="bubble-chart"></svg>
            `;
            bubbleContainer.classList.remove('bubble-empty');
            bubbleContainer.classList.add('bubble-active');
            drawBubbleChart(currentVoteData);
        }
        if (currentPoliticianId) {
            initializeSocket(currentPoliticianId);
        }

    }).catch(err => {
        console.error("🔴 ERROR in Promise.all for initial data loading:", err.message, err.stack);
        if (err.message.includes("Politician data not found")) {
            window.location.href = '/404.html';
        } else {
            const bubbleContainer = document.getElementById('bubble-chart-container');
            if (bubbleContainer) {
                 bubbleContainer.innerHTML = `<div style="color: red; padding: 1rem;">Failed to load page data. Please try again. Check console for details.</div>`;
            }
        }
    });
}

// +++ SIMPLIFIED: The server now handles the fallback logic +++
function applyPortraitOverlay(politicianId) {
    if (!politicianId) return;

    const portraitOverlay = document.getElementById('portrait-overlay');
    if (!portraitOverlay) {
        // This can happen if the socket updates the page to an empty state. It's safe to ignore.
        return;
    }
    
    // The client simply requests the image. The server will respond with the
    // correct portrait or the blank.jpg automatically. No client-side
    // error handling is needed for this anymore.
    const portraitUrl = `/portraits/portrait-${politicianId}.jpg`;
    portraitOverlay.style.backgroundImage = `url('${portraitUrl}')`;
    console.log(`🖼️ Requesting portrait: ${portraitUrl}`);
}

function drawBubbleChart(voteData) {
    try {
        const data = voteData.filter(entry => entry.count > 0).map(entry => ({
            word: entry.word, value: entry.count, score: entry.sentiment_score,
        }));

        if (data.length === 0) {
            const svg = d3.select("#bubble-chart");
            if (svg && !svg.empty()) svg.selectAll("*").remove();
            const bubbleContainer = document.getElementById('bubble-chart-container');
            if (bubbleContainer) {
                bubbleContainer.innerHTML = `<div style="text-align: center; padding: 1rem;">No active words to display.</div>`;
                bubbleContainer.classList.add('bubble-empty');
                bubbleContainer.classList.remove('bubble-active');
            }
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

        const chartGroup = svg.append("g");
        const circleLayer = chartGroup.append("g").attr("class", "circle-layer");
        const textLayer = chartGroup.append("g").attr("class", "text-layer");

        const circleGroups = circleLayer.selectAll("g.bubble-circle-group")
            .data(nodes, d => d.data.word)
            .join("g")
            .attr("class", "bubble-circle-group")
            .attr('transform', d => `translate(${d.x},${d.y})`);

        circleGroups.append("circle")
            .attr("r", d => d.r)
            .attr("fill", d => getBubbleFillStyle(d.data.score).fill)
            .attr("fill-opacity", d => getBubbleFillStyle(d.data.score).fillOpacity)
            .style("cursor", "pointer")
            .on("click", (event, d) => voteForWord(d.data.word, currentPoliticianId));

        const textGroups = textLayer.selectAll("g.bubble-text-group")
            .data(nodes, d => d.data.word)
            .join("g")
            .attr("class", "bubble-text-group")
            .attr('transform', d => `translate(${d.x},${d.y})`);

        textGroups.append("text")
            .attr("text-anchor", "middle")
            .style("font-size", d => Math.max(Math.min(d.r / 2.5, 32), 8) + "px")
            .style("fill", "#000")
            .style("pointer-events", "none")
            .each(function(d) {
                const el = d3.select(this);
                const fontSize = parseFloat(el.style("font-size"));
                el.append("tspan").text(d.data.word).attr("x", 0).attr("dy", -fontSize * 0.2);
                el.append("tspan").text(d.data.value).attr("x", 0).attr("dy", "1.2em");
            });
            
        applyPortraitOverlay(currentPoliticianId);

    } catch (err) {
        console.error("🔴 ERROR IN drawFallbackLayout:", err.message, err.stack);
        const bubbleContainer = document.getElementById('bubble-chart-container');
        if (bubbleContainer) {
            bubbleContainer.innerHTML = `<div style="color: red; padding: 1rem;">Error drawing chart (Fallback). Check console.</div>`;
        }
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
        if (headShapePoints.length < 3) { drawFallbackLayout(data); return; }
        const faceCentroid = getCenterOfPoints(headShapePoints);
        if (!faceCentroid) { drawFallbackLayout(data); return; }

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

            let targetX, targetY;
            let isAnchor = false;
            let forceStrengthModifier = 0.05;

            if (i < ANCHOR_COUNT && featureTargets[i]) {
                targetX = featureTargets[i].x;
                targetY = featureTargets[i].y;
                isAnchor = true;
                forceStrengthModifier = 0.5;
            } else {
                let attempts = 0;
                let pointFound = false;
                do {
                    const angle = random() * 2 * Math.PI;
                    const dist = random() * Math.min(canvasWidth, canvasHeight) * 0.4; 
                    targetX = faceCentroid.x + Math.cos(angle) * dist;
                    targetY = faceCentroid.y + Math.sin(angle) * dist;
                    attempts++;
                    pointFound = isInside({x: targetX, y: targetY}, headShapePoints);
                } while (!pointFound && attempts < 100); 
                
                if (!pointFound) { 
                    targetX = faceCentroid.x;
                    targetY = faceCentroid.y;
                }
                 forceStrengthModifier = 0.02 + (random() * 0.03);
            }
            
            return {
                ...d, radius, isAnchor,
                targetX: targetX, targetY: targetY,
                forceStrengthModifier: forceStrengthModifier,
                x: targetX + (random() - 0.5) * radius * 0.1, 
                y: targetY + (random() - 0.5) * radius * 0.1,
            };
        });

        const simulation = d3.forceSimulation(nodes)
            .force("collide", d3.forceCollide().radius(d => d.radius + 1.2).strength(0.9))
            .force("x_target", d3.forceX().strength(d => d.forceStrengthModifier).x(d => d.targetX))
            .force("y_target", d3.forceY().strength(d => d.forceStrengthModifier).y(d => d.targetY))
            .force("boundary", (alpha) => {
                const boundaryStrength = 0.3 * alpha;
                for (const node of nodes) {
                    if (!isInside(node, headShapePoints)) {
                        node.vx += (faceCentroid.x - node.x) * boundaryStrength;
                        node.vy += (faceCentroid.y - node.y) * boundaryStrength;
                    }
                }
            })
            .force("center_overall", d3.forceCenter(faceCentroid.x, faceCentroid.y).strength(0.04))
            .stop();

        for (let i = 0; i < 300; ++i) { 
            simulation.tick();
        }

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        headShapePoints.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        });
        nodes.forEach(d => {
            minX = Math.min(minX, d.x - d.radius); maxX = Math.max(maxX, d.x + d.radius);
            minY = Math.min(minY, d.y - d.radius); maxY = Math.max(maxY, d.y + d.radius);
        });
        
        const PADDING = Math.min(canvasWidth, canvasHeight) * 0.02;
        minX -= PADDING; minY -= PADDING;
        maxX += PADDING; maxY += PADDING;

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        
        svg.attr("viewBox", `${minX} ${minY} ${contentWidth} ${contentHeight}`)
           .attr("preserveAspectRatio", "xMidYMid meet");

        const chartGroup = svg.append("g");
        
        nodes.sort((a,b) => a.radius - b.radius); 

        const circleLayer = chartGroup.append("g").attr("class", "circle-layer");
        const textLayer = chartGroup.append("g").attr("class", "text-layer");

        const circleGroups = circleLayer.selectAll("g.bubble-circle-group")
            .data(nodes, d => d.word) 
            .join("g")
            .attr("class", "bubble-circle-group")
            .attr('transform', d => `translate(${d.x.toFixed(2)},${d.y.toFixed(2)})`);

        circleGroups.append("circle")
            .attr("r", d => d.radius)
            .attr("fill", d => getBubbleFillStyle(d.score).fill)
            .attr("fill-opacity", d => getBubbleFillStyle(d.score).fillOpacity)
            .style("cursor", "pointer")
            .on("click", (event, d) => voteForWord(d.word, currentPoliticianId));
        
        const textGroups = textLayer.selectAll("g.bubble-text-group")
            .data(nodes, d => d.word) 
            .join("g")
            .attr("class", "bubble-text-group")
            .attr('transform', d => `translate(${d.x.toFixed(2)},${d.y.toFixed(2)})`);
            
        textGroups.append("text")
            .text(d => d.word)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .style("fill", "#111")
            .style("font-family", "Inter, sans-serif")
            .style("pointer-events", "none")
            .each(function(d) {
                const textSelection = d3.select(this);
                const availableWidth = d.radius * 1.9;
                
                textSelection.style("font-size", "10px");
                const naturalWidthAt10px = this.getComputedTextLength();
                if (naturalWidthAt10px === 0) return;

                const newFontSize = (10 * availableWidth) / naturalWidthAt10px;
                
                textSelection.style("font-size", `${Math.min(d.radius * 1.4, Math.max(newFontSize, 6))}px`);
            });
            
        applyPortraitOverlay(currentPoliticianId);

    } catch (err) {
        console.error("🔴 ERROR IN drawFaceLayout:", err.message, err.stack);
        const bubbleContainer = document.getElementById('bubble-chart-container');
        if (bubbleContainer) {
            bubbleContainer.innerHTML = `<div style="color: red; padding: 1rem;">Error drawing chart (Face Layout). Check console.</div>`;
        }
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
            try {
                const errData = await response.json();
                showMessage(errData.error || "Error submitting vote.");
            } catch (e) {
                showMessage("Error submitting vote (unable to parse server response).");
            }
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
    if (!politicianIdForSocket) {
        console.warn("🟡 Cannot initialize socket without politicianIdForSocket.");
        return;
    }
    if (typeof io === 'undefined') {
        console.error("🔴 Socket.IO client (io) not found. Make sure it's included in your HTML.");
        return;
    }
    if (socket && socket.connected) {
        socket.disconnect();
    }
    socket = io(); 
    socket.on('connect', () => {
        console.log(`Socket connected. Listening for wordsUpdated:${politicianIdForSocket}`);
    });

    socket.on(`wordsUpdated:${politicianIdForSocket}`, (updatedWords) => {
        console.log(`Received updated words for ID ${politicianIdForSocket}.`);
        currentVoteData = updatedWords; 

        try {
            const bubbleContainer = document.getElementById('bubble-chart-container');
            if (!bubbleContainer) return;
            if (updatedWords && updatedWords.some(v => v.count > 0)) {
                if (!document.getElementById('bubble-chart')) { 
                    bubbleContainer.innerHTML = `
                        <div id="portrait-overlay"></div>
                        <svg id="bubble-chart"></svg>
                    `;
                }
                bubbleContainer.classList.remove('bubble-empty');
                bubbleContainer.classList.add('bubble-active');
                drawBubbleChart(updatedWords);
            } else {
                bubbleContainer.innerHTML = `<div style="text-align: center; padding: 1rem;">Be the first to add a word.</div>`;
                bubbleContainer.classList.add('bubble-empty');
                bubbleContainer.classList.remove('bubble-active');
            }
        } catch (err) {
            console.error("🔴 ERROR in socket wordsUpdated handler:", err.message, err.stack);
        }
    });

    socket.on('disconnect', (reason) => console.log('Disconnected from WebSocket server. Reason:', reason));
    socket.on('connect_error', (err) => {
        console.error('🔴 Socket connection error:', err.message, err.type);
    });
}

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        try { 
            const activeData = currentVoteData && currentVoteData.filter(entry => entry.count > 0);
            if (activeData && activeData.length > 0 && document.getElementById('bubble-chart')) { 
                drawBubbleChart(currentVoteData); 
            }
        } catch (err) {
            console.error("🔴 ERROR in resize handler:", err.message, err.stack);
        }
    }, 200);
});

document.addEventListener('DOMContentLoaded', () => {
    try {
        const isPoliticianPage = /^\/politician\/\d+$/.test(window.location.pathname);
        if (!isPoliticianPage) return;
        
        if (!document.getElementById('politician-name') || 
            !document.getElementById('politician-position') ||
            !document.getElementById('bubble-chart-container')) {
            console.error("🔴 Critical HTML elements for politician page are missing.");
            return;
        }
        loadPoliticianData(); 
        const form = document.getElementById('add-word-form');
        if (form) {
            form.addEventListener('submit', submitNewWord);
        } else {
            console.warn("🟡 Add word form not found.");
        }
    } catch (err) {
        console.error("🔴 ERROR in DOMContentLoaded:", err.message, err.stack);
         const body = document.querySelector('body');
         if(body) body.innerHTML = `<div style="color: red; padding: 20px; text-align: center;">A critical error occurred setting up the page. Please check the console.</div>`;
    }
});