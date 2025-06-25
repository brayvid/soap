// Copyright 2024-2025 soap.fyi <https://soap.fyi>

// --- GLOBAL VARIABLES FOR STATE MANAGEMENT ---
let currentVoteData = [];
let currentPoliticianId = null;
let layoutData = null;

// --- HELPER FUNCTIONS ---
function getBubbleFillStyle(score) {
    let fill = '#AAA';
    let fillOpacity = 0.6;
    if (score >= 0.05) {
        fill = '#008000';
        fillOpacity = 0.3 + (0.7 * (score - 0.05) / (1.0 - 0.05));
        fillOpacity = Math.min(1.0, Math.max(0.3, fillOpacity));
    } else if (score <= -0.05) {
        fill = '#DC143C';
        fillOpacity = 0.3 + (0.7 * (Math.abs(score) - 0.05) / (1.0 - 0.05));
        fillOpacity = Math.min(1.0, Math.max(0.3, fillOpacity));
    }
    return { fill, fillOpacity: fillOpacity.toFixed(2) };
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

// --- DATA LOADING & DRAWING ---
function loadPoliticianData() {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const politicianId = pathParts[pathParts.length - 1];
    if (!politicianId || isNaN(Number(politicianId))) { window.location.href = '/404.html'; return; }
    currentPoliticianId = politicianId;

    const politicianDataPromise = fetch(`/politician/${politicianId}/data`).then(res => {
        if (!res.ok) throw new Error('Politician data not found');
        return res.json();
    });

    const layoutDataPromise = fetch(`/data/layout-${politicianId}.json`).then(res => {
        if (!res.ok) {
            console.warn(`Layout file for ID ${politicianId} not found. Using fallback layout.`);
            return null;
        }
        return res.json();
    });

    Promise.all([politicianDataPromise, layoutDataPromise])
    .then(([politicianData, fetchedLayoutData]) => {
        layoutData = fetchedLayoutData; 
        if (layoutData) {
            layoutData.boundary = layoutData.boundary.map(p => ({ x: p.x || p._x, y: p.y || p._y }));
            layoutData.features = layoutData.features.map(f => ({ ...f, x: f.x || f._x, y: f.y || f._y }));
        }
        document.getElementById('politician-name').textContent = politicianData.politician.name;
        document.getElementById('politician-position').textContent = politicianData.politician.position;
        currentVoteData = politicianData.votesForPolitician || [];
        
        const bubbleContainer = document.getElementById('bubble-chart-container');
        if (!currentVoteData.some(v => v.count > 0)) {
            bubbleContainer.innerHTML = `<div style="text-align: center; padding: 1rem;">Be the first to add a word.</div>`;
            bubbleContainer.classList.add('bubble-empty');
            bubbleContainer.classList.remove('bubble-active');
        } else {
            bubbleContainer.innerHTML = '<svg id="bubble-chart"></svg>'; 
            bubbleContainer.classList.remove('bubble-empty');
            bubbleContainer.classList.add('bubble-active');
            drawBubbleChart(currentVoteData);
        }
    }).catch(err => {
        console.error('Error loading initial data:', err);
        window.location.href = '/404.html';
    });
}

function drawBubbleChart(voteData) {
    const data = voteData.filter(entry => entry.count > 0).map(entry => ({
        word: entry.word, value: entry.count, score: entry.sentiment_score,
    }));
    if (data.length === 0) return;

    if (layoutData) {
        drawFaceLayout(data);
    } else {
        drawFallbackLayout(data);
    }
}

// --- FALLBACK LAYOUT FUNCTION ---
function drawFallbackLayout(data) {
    const svg = d3.select("#bubble-chart");
    svg.selectAll("*").remove(); // Clear previous content
    const container = document.getElementById('bubble-chart-container');
    const PACK_LAYOUT_DIMENSION = Math.min(container.clientWidth, container.clientHeight) || 500;

    const pack = d3.pack().size([PACK_LAYOUT_DIMENSION, PACK_LAYOUT_DIMENSION]).padding(5);
    
    const totalSubmissionCount = d3.sum(data, d => d.value);
    const root = d3.hierarchy({ children: data }).sum(d => d.value / totalSubmissionCount);
    
    const nodes = pack(root).leaves(); // These nodes have .x, .y, .r, and .data (original datum)

    svg.attr("viewBox", `0 0 ${PACK_LAYOUT_DIMENSION} ${PACK_LAYOUT_DIMENSION}`)
       .attr("preserveAspectRatio", "xMidYMid meet");

    const chartGroup = svg.append("g"); // Main group for chart elements

    // Create separate layers for circles and text
    const circleLayer = chartGroup.append("g").attr("class", "circle-layer");
    const textLayer = chartGroup.append("g").attr("class", "text-layer"); // Text layer will be drawn on top of circle layer

    // Bind data to groups for circles
    const circleGroups = circleLayer.selectAll("g.bubble-circle-group")
        .data(nodes, d => d.data.word) // key by word from original data
        .join("g")
        .attr("class", "bubble-circle-group")
        .attr('transform', d => `translate(${d.x},${d.y})`); // Position group

    // Append circles to their groups
    circleGroups.append("circle")
        .attr("r", d => d.r)
        .attr("fill", d => getBubbleFillStyle(d.data.score).fill)
        .attr("fill-opacity", d => getBubbleFillStyle(d.data.score).fillOpacity)
        .style("cursor", "pointer")
        .on("click", (event, d) => voteForWord(d.data.word, currentPoliticianId));
        
    // Bind data to groups for text labels
    const textGroups = textLayer.selectAll("g.bubble-text-group")
        .data(nodes, d => d.data.word) // key by word from original data
        .join("g")
        .attr("class", "bubble-text-group")
        .attr('transform', d => `translate(${d.x},${d.y})`); // Position group

    // Append text labels to their groups
    textGroups.append("text")
        .attr("text-anchor", "middle")
        .style("font-size", d => Math.max(Math.min(d.r / 2.5, 32), 8) + "px")
        .style("fill", "#000")
        .style("pointer-events", "none") // Ensures clicks pass through to circles
        .each(function(d) { // d is a node from pack(root).leaves()
            const el = d3.select(this);
            const fontSize = parseFloat(el.style("font-size"));
            el.append("tspan").text(d.data.word).attr("x", 0).attr("dy", -fontSize * 0.2);
            el.append("tspan").text(d.data.value).attr("x", 0).attr("dy", "1.2em");
        });
}

// --- FACE-SHAPING LAYOUT FUNCTION ---
function drawFaceLayout(data) {
    const svg = d3.select("#bubble-chart");
    svg.selectAll("*").remove(); // Clear previous content
    
    const headShape = [...layoutData.boundary];
    headShape.push({ x: headShape[headShape.length - 1].x, y: 0 }); 
    headShape.push({ x: headShape[0].x, y: 0 });

    const faceArea = polygonArea(headShape);
    const POWER_SCALE = 1.25;
    const scaledTotalVoteValue = d3.sum(data, d => Math.pow(d.value, POWER_SCALE));
    const targetCoverage = 1.1;
    const scalingFactor = (faceArea * targetCoverage) / scaledTotalVoteValue;

    const sortedByPop = [...data].sort((a, b) => b.value - a.value);
    const ANCHOR_COUNT = 5;
    const featureTargets = layoutData.features.filter(Boolean);

    const nodes = sortedByPop.map((d, i) => {
        const scaledValue = Math.pow(d.value, POWER_SCALE);
        const bubbleArea = scaledValue * scalingFactor;
        const radius = Math.sqrt(bubbleArea / Math.PI);
        let target = {};

        if (i < ANCHOR_COUNT && featureTargets[i]) {
            target = featureTargets[i];
        } else {
            const fillerIndex = i - ANCHOR_COUNT;
            const boundaryIndex = fillerIndex % layoutData.boundary.length;
            target = layoutData.boundary[boundaryIndex];
        }
        
        let hash = 0;
        for (let charIndex = 0; charIndex < d.word.length; charIndex++) {
            hash = (hash << 5) - hash + d.word.charCodeAt(charIndex);
            hash |= 0; 
        }
        const offsetX = (hash % 10) - 4.5; 
        const offsetY = ((hash >> 4) % 10) - 4.5;

        return {
            ...d, radius: isNaN(radius) ? 10 : Math.max(radius, 3),
            target: target, 
            x: target.x + offsetX, 
            y: target.y + offsetY,
        };
    }); // `nodes` is an array of { word, value, score, radius, x, y, ... }

    function mulberry32(a) {
        return function() {
          let t = a += 0x6D2B79F5;
          t = Math.imul(t ^ t >>> 15, t | 1);
          t ^= t + Math.imul(t ^ t >>> 7, t | 61);
          return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }
    const seed = parseInt(currentPoliticianId) * 1000 + nodes.length;
    const randomSource = mulberry32(seed);

    const simulation = d3.forceSimulation(nodes, randomSource)
        .force("collide", d3.forceCollide().radius(d => d.radius + 2).strength(0.9))
        .force("x", d3.forceX().strength(d => (sortedByPop.findIndex(n => n.word === d.word) < ANCHOR_COUNT) ? 0.3 : 0.1).x(d => d.target.x))
        .force("y", d3.forceY().strength(d => (sortedByPop.findIndex(n => n.word === d.word) < ANCHOR_COUNT) ? 0.3 : 0.1).y(d => d.target.y))
        .force("boundary", (alpha) => {
            for (const node of nodes) {
                if (!isInside(node, headShape)) {
                    const centerX = layoutData.canvasWidth / 2, centerY = layoutData.canvasHeight / 2;
                    node.vx += (centerX - node.x) * 0.25 * alpha;
                    node.vy += (centerY - node.y) * 0.25 * alpha;
                }
            }
        }).stop();

    for (let i = 0; i < 300; ++i) simulation.tick(); // Run simulation to position nodes

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(d => {
        minX = Math.min(minX, d.x - d.radius);
        maxX = Math.max(maxX, d.x + d.radius);
        minY = Math.min(minY, d.y - d.radius);
        maxY = Math.max(maxY, d.y + d.radius);
    });
    
    const contentWidth = maxX - minX, contentHeight = maxY - minY;
    const finalViewBoxSide = Math.max(contentWidth, contentHeight) * 1.05; 
    const viewBoxX = minX - (finalViewBoxSide - contentWidth) / 2;
    const viewBoxY = minY - (finalViewBoxSide - contentHeight) / 2;
    
    svg.attr("viewBox", `${viewBoxX} ${viewBoxY} ${finalViewBoxSide} ${finalViewBoxSide}`)
       .attr("preserveAspectRatio", "xMidYMid meet");

    const chartGroup = svg.append("g"); // Main group for chart elements

    // Create separate layers for circles and text
    const circleLayer = chartGroup.append("g").attr("class", "circle-layer");
    const textLayer = chartGroup.append("g").attr("class", "text-layer"); // Text layer will be drawn on top

    // Bind data to groups for circles
    // `nodes` here is the array from the force simulation, members have .word, .radius, .score, .x, .y
    const circleGroups = circleLayer.selectAll("g.bubble-circle-group")
        .data(nodes, d => d.word) 
        .join("g")
        .attr("class", "bubble-circle-group")
        .attr('transform', d => `translate(${d.x},${d.y})`); // Position group

    // Append circles to their groups
    circleGroups.append("circle")
        .attr("r", d => d.radius)
        .attr("fill", d => getBubbleFillStyle(d.score).fill)
        .attr("fill-opacity", d => getBubbleFillStyle(d.score).fillOpacity)
        .style("cursor", "pointer")
        .on("click", (event, d) => voteForWord(d.word, currentPoliticianId));
    
    // Bind data to groups for text labels
    const textGroups = textLayer.selectAll("g.bubble-text-group")
        .data(nodes, d => d.word)
        .join("g")
        .attr("class", "bubble-text-group")
        .attr('transform', d => `translate(${d.x},${d.y})`); // Position group
        
    // Append text labels to their groups
    textGroups.append("text")
        .attr("text-anchor", "middle")
        .style("font-size", d => {
            const baseSize = d.radius / 2;
            return Math.max(Math.min(baseSize, 60), 8) + "px";
        }) 
        .style("fill", "#000")
        .style("pointer-events", "none") // Ensures clicks pass through to circles
        .style("paint-order", "stroke") 
        .style("stroke-width", "0.08em")
        .style("stroke-linejoin", "round")
        // .style("stroke", "#FFFFFF") // Uncomment and set a contrast color for actual outline
        .each(function(d) { // d is a node from the force simulation
            const el = d3.select(this);
            const fontSize = parseFloat(el.style("font-size"));
            el.append("tspan").text(d.word).attr("x", 0).attr("dy", -fontSize * 0.2); 
            el.append("tspan").text(d.value).attr("x", 0).attr("dy", "1.1em");
        });
}

// --- EVENT HANDLERS AND REAL-TIME LOGIC ---
function voteForWord(word, politicianId) {
    if (!word || !politicianId) return;
    fetch('/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, politician_id: Number(politicianId) }),
    }).then(async (response) => {
        if (response.status === 429) showMessage("Rate limit exceeded for this IP");
        else if (!response.ok) showMessage("Error submitting vote.");
    }).catch(err => {
        console.error('Vote error:', err);
        showMessage("A network error occurred.");
    });
}

function submitNewWord(event) {
    event.preventDefault();
    const newWordInput = document.getElementById('new-word');
    const newWord = newWordInput.value.trim();
    if (newWord) {
        voteForWord(newWord, currentPoliticianId);
    }
    newWordInput.value = '';
}

document.addEventListener('DOMContentLoaded', () => {
    const isPoliticianPage = /^\/politician\/\d+$/.test(window.location.pathname);
    if (!isPoliticianPage) return;
    loadPoliticianData();
    const form = document.getElementById('add-word-form');
    if (form) form.addEventListener('submit', submitNewWord);

    const socket = io();
    socket.on('connect', () => {});
    socket.on(`wordsUpdated:${currentPoliticianId}`, (updatedWords) => {
        console.log('Received updated words, redrawing layout.');
        currentVoteData = updatedWords;

        const bubbleContainer = document.getElementById('bubble-chart-container');
        if (updatedWords.some(v => v.count > 0)) {
            if (!document.getElementById('bubble-chart')) {
                bubbleContainer.innerHTML = '<svg id="bubble-chart"></svg>';
            }
            bubbleContainer.classList.remove('bubble-empty');
            bubbleContainer.classList.add('bubble-active');
            drawBubbleChart(updatedWords);
        } else {
            bubbleContainer.innerHTML = `<div style="text-align: center; padding: 1rem;">Be the first to add a word.</div>`;
            bubbleContainer.classList.add('bubble-empty');
            bubbleContainer.classList.remove('bubble-active');
        }
    });
    socket.on('disconnect', () => console.log('Disconnected from WebSocket server.'));
});

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        // Check currentVoteData state as it might be empty
        const activeData = currentVoteData.filter(entry => entry.count > 0);
        if (activeData.length > 0) { // Only redraw if there's data to show
            drawBubbleChart(currentVoteData); // drawBubbleChart itself filters for count > 0
        }
    }, 150);
});

// --- END OF FILE politician.js ---