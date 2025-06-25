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
            layoutData.features = layoutData.features.map(f => ({
                ...f, x: f.x || f._x, y: f.y || f._y
            }));
        }
        
        document.getElementById('politician-name').textContent = politicianData.politician.name;
        document.getElementById('politician-position').textContent = politicianData.politician.position;
        currentVoteData = politicianData.votesForPolitician || [];

        const bubbleContainer = document.getElementById('bubble-chart-container');
        if (!currentVoteData.some(v => v.count > 0)) {
            bubbleContainer.innerHTML = `<div style="text-align: center; padding: 1rem;">Be the first to add a word.</div>`;
        } else {
            bubbleContainer.innerHTML = '<svg id="bubble-chart"></svg>';
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
    svg.selectAll("*").remove();
    const container = document.getElementById('bubble-chart-container');
    const PACK_LAYOUT_DIMENSION = Math.min(container.clientWidth, container.clientHeight) || 500;

    const pack = d3.pack().size([PACK_LAYOUT_DIMENSION, PACK_LAYOUT_DIMENSION]).padding(5);
    
    // --- MODIFIED SIZING ---
    // The sum is now based on the proportional value, not the absolute count.
    const totalSubmissionCount = d3.sum(data, d => d.value);
    const root = d3.hierarchy({ children: data }).sum(d => d.value / totalSubmissionCount);
    
    const nodes = pack(root).leaves();

    svg.attr("viewBox", `0 0 ${PACK_LAYOUT_DIMENSION} ${PACK_LAYOUT_DIMENSION}`)
       .attr("preserveAspectRatio", "xMidYMid meet");

    const chartGroup = svg.append("g");
    const bubbles = chartGroup.selectAll("g").data(nodes, d => d.data.word).join("g")
        .attr('transform', d => `translate(${d.x}, ${d.y})`);

    bubbles.append("circle").attr("r", d => d.r).attr("fill", d => getBubbleFillStyle(d.data.score).fill).attr("fill-opacity", d => getBubbleFillStyle(d.data.score).fillOpacity).style("cursor", "pointer").on("click", (event, d) => voteForWord(d.data.word, currentPoliticianId));
        
    bubbles.append("text").attr("text-anchor", "middle").style("font-size", d => Math.max(Math.min(d.r / 2.5, 32), 8) + "px").style("fill", "#000").style("pointer-events", "none").each(function(d) {
        const el = d3.select(this);
        const fontSize = parseFloat(el.style("font-size"));
        el.append("tspan").text(d.data.word).attr("x", 0).attr("dy", -fontSize * 0.2);
        el.append("tspan").text(d.data.value).attr("x", 0).attr("dy", "1.2em");
    });
}

// --- FACE-SHAPING LAYOUT FUNCTION ---
function drawFaceLayout(data) {
    const svg = d3.select("#bubble-chart");
    svg.selectAll("*").remove();
    
    const headShape = [...layoutData.boundary];
    headShape.push({ x: headShape[headShape.length - 1].x, y: 0 });
    headShape.push({ x: headShape[0].x, y: 0 });

    const faceArea = polygonArea(headShape);
    
    // --- MODIFIED SIZING LOGIC ---
    const totalSubmissionCount = d3.sum(data, d => d.value);
    // The scaling factor is now a large number to multiply the small percentages by.
    const scalingFactor = faceArea * 3; // Tune this "magic number" to get the right overall size.
    
    const sortedByPop = [...data].sort((a, b) => b.value - a.value);
    const ANCHOR_COUNT = 5;
    const featureTargets = layoutData.features.filter(Boolean);

    const nodes = sortedByPop.map((d, i) => {
        // The bubble's area is now its proportion of the total, scaled up.
        const proportion = d.value / totalSubmissionCount;
        const bubbleArea = proportion * scalingFactor;
        const radius = Math.sqrt(bubbleArea / Math.PI);
        let target = {};

        if (i < ANCHOR_COUNT && featureTargets[i]) {
            target = featureTargets[i];
        } else {
            const numRings = 4;
            const fillerNodesCount = Math.max(1, sortedByPop.length - ANCHOR_COUNT);
            const rankInFillers = i - ANCHOR_COUNT;
            const ringIndex = Math.floor((rankInFillers / fillerNodesCount) * numRings);
            const ringRadius = (layoutData.canvasWidth / 3.5) * (1 - (ringIndex / (numRings * 1.2)));
            const angle = (rankInFillers / Math.max(1, fillerNodesCount / numRings)) * 2 * Math.PI;
            target = {
                x: (layoutData.canvasWidth / 2) + Math.cos(angle) * ringRadius,
                y: (layoutData.canvasHeight / 2) + Math.sin(angle) * ringRadius
            };
        }
        return {
            ...d, radius: isNaN(radius) ? 10 : Math.max(radius, 2),
            target: target, x: target.x + (Math.random() - 0.5) * 5, y: target.y + (Math.random() - 0.5) * 5,
        };
    });

    const simulation = d3.forceSimulation(nodes)
        .force("collide", d3.forceCollide().radius(d => d.radius + 2).strength(1))
        .force("x", d3.forceX().strength(0.2).x(d => d.target.x))
        .force("y", d3.forceY().strength(0.2).y(d => d.target.y))
        .force("boundary", (alpha) => {
            for (const node of nodes) {
                if (!isInside(node, headShape)) {
                    const centerX = layoutData.canvasWidth / 2, centerY = layoutData.canvasHeight / 2;
                    node.vx += (centerX - node.x) * 0.1 * alpha;
                    node.vy += (centerY - node.y) * 0.1 * alpha;
                }
            }
        }).stop();

    for (let i = 0; i < 250; ++i) simulation.tick();

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(d => {
        minX = Math.min(minX, d.x - d.radius);
        maxX = Math.max(maxX, d.x + d.radius);
        minY = Math.min(minY, d.y - d.radius);
        maxY = Math.max(maxY, d.y + d.radius);
    });
    
    const contentWidth = maxX - minX, contentHeight = maxY - minY;
    const finalViewBoxSide = Math.max(contentWidth, contentHeight) * 1.05; // Tighter crop
    const viewBoxX = minX - (finalViewBoxSide - contentWidth) / 2;
    const viewBoxY = minY - (finalViewBoxSide - contentHeight) / 2;
    
    svg.attr("viewBox", `${viewBoxX} ${viewBoxY} ${finalViewBoxSide} ${finalViewBoxSide}`)
       .attr("preserveAspectRatio", "xMidYMid meet");

    const chartGroup = svg.append("g");
    const bubbles = chartGroup.selectAll("g").data(nodes, d => d.word).join("g")
        .attr('transform', d => `translate(${d.x}, ${d.y})`);

    bubbles.append("circle").attr("r", d => d.radius).attr("fill", d => getBubbleFillStyle(d.score).fill).attr("fill-opacity", d => getBubbleFillStyle(d.score).fillOpacity).style("cursor", "pointer").on("click", (event, d) => voteForWord(d.word, currentPoliticianId));
    
    bubbles.append("text")
        .attr("text-anchor", "middle")
        .style("font-size", d => Math.max(Math.min(d.radius / 2.2, 40), 8) + "px") // Larger max font size
        .style("fill", "#000").style("pointer-events", "none")
        .style("paint-order", "stroke").style("stroke-width", "0.08em").style("stroke-linejoin", "round")
        .each(function(d) {
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
        drawBubbleChart(updatedWords);
    });
    socket.on('disconnect', () => console.log('Disconnected from WebSocket server.'));
});

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (currentVoteData && currentVoteData.length > 0) {
            drawBubbleChart(currentVoteData);
        }
    }, 150);
});