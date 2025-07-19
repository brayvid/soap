// packages/web/src/components/PoliticianPageClient.tsx
"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import * as d3 from 'd3';
import { Socket } from 'socket.io-client';
import { useToast } from '@/context/ToastContext';

// --- Type Definitions ---
type Vote = { word: string; count: number; sentiment_score: number; last_voted_at: string; };
type Politician = { politician_id: number; name: string; position: string; };
type LayoutPoint = { id: number; x: number; y: number; };
type LayoutData = { canvasWidth: number; canvasHeight: number; all_points: LayoutPoint[]; };
type BubbleData = { word: string; value: number; score: number; decayFactor: number; };
type SimulationNode = BubbleData & d3.SimulationNodeDatum & { radius: number; targetX: number; targetY: number; forceStrengthModifier: number; };
type HierarchyBubbleNode = d3.HierarchyCircularNode<BubbleData>;

// --- D3 Helper Functions ---
const FACE_SILHOUETTE_INDICES = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const LEFT_EYE_CONTOUR_INDICES = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE_CONTOUR_INDICES = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const MOUTH_OUTER_CONTOUR_INDICES = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const NOSE_TIP_INDEX = 4;
const CHIN_POINT_INDEX = 152;

function polygonArea(points: { x: number; y: number }[]): number { let a = 0; for (let i = 0, j = points.length - 1; i < points.length; j = i++) a += (points[j].x + points[i].x) * (points[j].y - points[i].y); return Math.abs(a / 2); }
function isInside(point: { x: number; y: number }, vs: { x: number; y: number }[]): boolean { const x = point.x, y = point.y; let inside = false; for (let c = 0, j = vs.length - 1; c < vs.length; j = c++) { const vi = vs[c]; const vj = vs[j]; if (((vi.y > y) !== (vj.y > y)) && (x < (vj.x - vi.x) * (y - vi.y) / (vj.y - vi.y) + vi.x)) inside = !inside; } return inside; }
function getPointsByIndices(allPoints: LayoutPoint[], indices: number[]): { x: number; y: number }[] { return indices.map(i => allPoints?.[i]).filter(Boolean); }
function getCenterOfPoints(points: { x: number; y: number }[]): { x: number; y: number } | null { if (!points || points.length === 0) return null; const s = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 }); return { x: s.x / points.length, y: s.y / points.length }; }
function mulberry32(seed: number): () => number { return function() { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } }

// --- STYLING LOGIC PORTED FROM ORIGINAL SCRIPT ---
const positiveColorScale = d3.scaleLinear<string>().domain([0.05, 1.0]).range(['#9fad42', '#2a8d64']).clamp(true);
const negativeColorScale = d3.scaleLinear<string>().domain([-0.05, -1.0]).range(['#CDb14c', '#DE3B3B']).clamp(true);

function getBubbleFillStyle(score: number): { fill: string; fillOpacity: number } {
    const BUBBLE_OPACITY = 1.0;
    let colorString: string;

    if (score >= 0.05) {
        colorString = positiveColorScale(score);
    } else if (score <= -0.05) {
        colorString = negativeColorScale(score);
    } else {
        colorString = '#BFBFBF';
    }
    
    return { fill: colorString, fillOpacity: BUBBLE_OPACITY };
}


export function PoliticianPageClient() {
    const params = useParams();
    const politicianId = params.id as string;
    const { showToast } = useToast();

    const [politician, setPolitician] = useState<Politician | null>(null);
    const [votes, setVotes] = useState<Vote[]>([]);
    const [layout, setLayout] = useState<LayoutData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [newWord, setNewWord] = useState('');
    const [isTimeFadeEnabled, setIsTimeFadeEnabled] = useState(false);
    
    const svgRef = useRef<SVGSVGElement>(null);
    const socketRef = useRef<Socket | null>(null);

    const handleVote = useCallback(async (word: string) => {
        if (!politicianId) return;
        try {
            const apiUrl = `${process.env.NEXT_PUBLIC_API_BASE_URL}/words`; 
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ word, politician_id: politicianId }), });
            if (response.status === 429) {
                showToast('Rate limit exceeded', 'error');
            } else if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                showToast(errData.error || "An error occurred.", 'error');
            }
        } catch (error) {
            console.error("Vote submission error:", error);
            showToast("A network error occurred.", 'error');
        }
    }, [politicianId, showToast]);

    useEffect(() => {
        if (!politicianId) return;
        const fetchData = async () => {
            try {
                setIsLoading(true); setError(null);
                const [politicianRes, layoutRes] = await Promise.all([
                    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/politician/${politicianId}/data`), 
                    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/data/layout-${politicianId}.json`)
                ]);
                if (!politicianRes.ok) throw new Error('Politician not found');
                const politicianData = await politicianRes.json();
                setPolitician(politicianData.politician); setVotes(politicianData.votesForPolitician);
                if (layoutRes.ok) { setLayout(await layoutRes.json()); } else { setLayout(null); }
            } catch (err) { setError('Failed to load politician data.'); console.error(err); } 
            finally { setIsLoading(false); }
        };
        fetchData();
    }, [politicianId]);

    useEffect(() => {
        if (!politicianId) return;
        const socketInitializer = async () => {
            const { io } = await import('socket.io-client');
            const socketUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
            socketRef.current = io(socketUrl);
            socketRef.current.on('connect', () => console.log(`Socket connected to ${socketUrl}`));
            socketRef.current.on(`wordsUpdated:${politicianId}`, (updatedWords: Vote[]) => { setVotes(updatedWords); });
        };
        socketInitializer();
        return () => { socketRef.current?.disconnect(); };
    }, [politicianId]);

    const processedData = useMemo(() => {
        if (!isTimeFadeEnabled) { return votes.map(d => ({ ...d, decayFactor: 1.0, decayedCount: d.count })); }
        const FADE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        return votes.map(d => { const ageMs = now - new Date(d.last_voted_at).getTime(); const decayFactor = Math.max(0, 1 - ageMs / FADE_DURATION_MS); return { ...d, decayFactor, decayedCount: d.count * decayFactor }; }).filter(d => d.decayedCount >= 0.1);
    }, [votes, isTimeFadeEnabled]);

    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();
        
        const dataForChart: BubbleData[] = processedData.map(d => ({ word: d.word, value: d.decayedCount, score: d.sentiment_score, decayFactor: d.decayFactor }));
        
        if (layout) {
            drawFaceLayout(svg, dataForChart, layout, politicianId, handleVote);
        } else {
            drawFallbackLayout(svg, dataForChart, handleVote);
        }
    }, [processedData, layout, politicianId, handleVote]);

    const handleNewWordSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (newWord) { handleVote(newWord); setNewWord(''); }
    };

    if (isLoading) return <p style={{ textAlign: 'center', padding: '2rem' }}>Loading...</p>;
    if (error) return <p style={{ textAlign: 'center', padding: '2rem', color: 'red' }}>{error}</p>;
    if (!politician) return <p style={{ textAlign: 'center', padding: '2rem' }}>Politician not found.</p>;

    return ( <div className="container"> <header> <h1>{politician.name}</h1> <p>{politician.position}</p> </header> <section id="votes-summary"> <div className="section-header"> <h2>Click to agree</h2> <div id="chart-controls"> <label className="switch"> <input type="checkbox" id="time-fade-toggle" checked={isTimeFadeEnabled} onChange={(e) => setIsTimeFadeEnabled(e.target.checked)} /> <span className="slider round"></span> </label> <span style={{ marginLeft: '8px' }}>Last 7 Days Only</span> </div> </div> <div id="bubble-chart-container" className={processedData.length > 0 ? 'bubble-active' : 'bubble-empty'}> <svg id="bubble-chart" ref={svgRef}></svg> </div> </section> <section id="add-word"> <h2>Add a word</h2> <form id="add-word-form" onSubmit={handleNewWordSubmit}> <label htmlFor="new-word">New Word:</label> <input type="text" id="new-word" name="new-word" maxLength={30} required value={newWord} onChange={(e) => setNewWord(e.target.value)} /> <button type="submit">Add Word</button> </form> </section> </div> );
}

function drawFaceLayout(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, data: BubbleData[], layoutData: LayoutData, politicianId: string, handleVote: (word: string) => void) {
    if (data.length === 0) {
        return drawFallbackLayout(svg, data, handleVote);
    }

    const { all_points, canvasWidth, canvasHeight } = layoutData;
    const headShapePoints = getPointsByIndices(all_points, FACE_SILHOUETTE_INDICES);
    const faceCentroid = getCenterOfPoints(headShapePoints);
    if (!headShapePoints || headShapePoints.length < 3 || !canvasWidth || !canvasHeight || !faceCentroid) { return drawFallbackLayout(svg, data, handleVote); }
    
    svg.attr("viewBox", `0 0 ${canvasWidth} ${canvasHeight}`).attr("preserveAspectRatio", "xMidYMid meet");
    
    // --- FIX START ---
    // Widen the range of the logarithmic scale to exaggerate the size difference.
    const [, maxVal] = d3.extent(data, d => d.value);
    const sizeScale = d3.scaleLog().domain([1, maxVal || 1]).range([3, 22]).clamp(true);
    const contribution = (val: number) => Math.pow(sizeScale(Math.max(1, val)), 2);

    const faceArea = polygonArea(headShapePoints);
    const scaledTotalVoteValue = d3.sum(data, d => contribution(d.value)) || 1;
    // --- FIX END ---
    
    const targetCoverage = 0.9;
    const scalingFactor = (faceArea * targetCoverage) / scaledTotalVoteValue;
    const dataSignature = data.length + d3.sum(data, d => d.value);
    const seed = Number(politicianId) * dataSignature;
    const random = mulberry32(seed);
    const featureTargets = [getCenterOfPoints(getPointsByIndices(all_points, LEFT_EYE_CONTOUR_INDICES)), getCenterOfPoints(getPointsByIndices(all_points, RIGHT_EYE_CONTOUR_INDICES)), all_points[NOSE_TIP_INDEX], getCenterOfPoints(getPointsByIndices(all_points, MOUTH_OUTER_CONTOUR_INDICES)), all_points[CHIN_POINT_INDEX]].filter(Boolean);
    const sortedByPop = [...data].sort((a, b) => b.value - a.value);
    const ANCHOR_COUNT = Math.min(featureTargets.length, sortedByPop.length, 5);
    
    const nodes: SimulationNode[] = sortedByPop.map((d, i) => { 
        const scaledValue = contribution(d.value);
        const bubbleArea = scaledValue * scalingFactor; 
        let radius = Math.sqrt(bubbleArea / Math.PI); 
        // --- FIX START ---
        // Adjust the minimum radius to match the new scale, ensuring visibility without flattening the range.
        radius = isNaN(radius) || radius < 6 ? 6 : radius;
        // --- FIX END ---
        
        let targetX, targetY, forceStrengthModifier; 
        if (i < ANCHOR_COUNT && featureTargets[i]) { 
            targetX = featureTargets[i]!.x; 
            targetY = featureTargets[i]!.y; 
            forceStrengthModifier = 0.5; 
        } else { 
            let attempts = 0, pointFound = false; 
            do { 
                const angle = random() * 2 * Math.PI, dist = random() * Math.min(canvasWidth, canvasHeight) * 0.4; 
                targetX = faceCentroid.x + Math.cos(angle) * dist; 
                targetY = faceCentroid.y + Math.sin(angle) * dist; 
                pointFound = isInside({x: targetX, y: targetY}, headShapePoints); 
            } while (!pointFound && ++attempts < 100); 
            if (!pointFound) { 
                targetX = faceCentroid.x; 
                targetY = faceCentroid.y; 
            } 
            forceStrengthModifier = 0.02 + (random() * 0.03); 
        } 
        return { ...d, radius: radius, targetX: targetX, targetY: targetY, forceStrengthModifier: forceStrengthModifier, x: targetX + (random() - 0.5), y: targetY + (random() - 0.5) }; 
    });
    
    const simulation = d3.forceSimulation(nodes).force("collide", d3.forceCollide<SimulationNode>().radius(d => d.radius + 1.2).strength(0.9)).force("x_target", d3.forceX<SimulationNode>().strength(d => d.forceStrengthModifier).x(d => d.targetX)).force("y_target", d3.forceY<SimulationNode>().strength(d => d.forceStrengthModifier).y(d => d.targetY)).force("boundary", alpha => { for (const node of nodes) { const point = { x: node.x ?? 0, y: node.y ?? 0 }; if (!isInside(point, headShapePoints)) { node.vx = (node.vx || 0) + (faceCentroid.x - point.x) * 0.3 * alpha; node.vy = (node.vy || 0) + (faceCentroid.y - point.y) * 0.3 * alpha; } } }).force("center_overall", d3.forceCenter(faceCentroid.x, faceCentroid.y).strength(0.04)).stop();
    for (let i = 0; i < 300; ++i) simulation.tick();

    const chartGroup = svg.append("g");
    const imageUrl = `${process.env.NEXT_PUBLIC_API_BASE_URL}/portraits/portrait-${politicianId}.jpg`;
    chartGroup.append("image").attr("href", imageUrl).attr("width", canvasWidth).attr("height", canvasHeight);
    
    nodes.sort((a, b) => a.radius - b.radius);

    const circleLayer = chartGroup.append("g").style("mix-blend-mode", "multiply");
    const textLayer = chartGroup.append("g").style("mix-blend-mode", "normal");
    
    const circleGroups = circleLayer.selectAll<SVGGElement, SimulationNode>("g.bubble-circle-group").data(nodes, d => d.word).join("g").attr("class", "bubble-circle-group").attr('transform', d => `translate(${d.x!.toFixed(2)},${d.y!.toFixed(2)})`);
    circleGroups.append("circle").attr("r", d => d.radius).attr("fill", d => getBubbleFillStyle(d.score).fill).attr("fill-opacity", d => getBubbleFillStyle(d.score).fillOpacity).style("cursor", "pointer").on("click", (event, d) => handleVote(d.word));
    
    const textGroups = textLayer.selectAll<SVGGElement, SimulationNode>("g.bubble-text-group").data(nodes, d => d.word).join("g").attr("class", "bubble-text-group").attr('transform', d => `translate(${d.x!.toFixed(2)},${d.y!.toFixed(2)})`);
    textGroups.append("text").text(d => d.word).attr("text-anchor", "middle").attr("dominant-baseline", "central").style("fill", "#fff").style("font-family", "Inter, sans-serif").style("pointer-events", "none")
      .each(function(d) {
          const textSelection = d3.select(this);
          const availableWidth = d.radius * 1.9;
          textSelection.style("font-size", "10px");
          const naturalWidth = (this as SVGTextElement).getComputedTextLength();
          if (naturalWidth === 0) return;
          const newFontSize = (10 * availableWidth) / naturalWidth;
          textSelection.style("font-size", `${Math.min(d.radius * 1.4, Math.max(newFontSize, 6))}px`);
      });
}

function drawFallbackLayout(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, data: BubbleData[], handleVote: (word: string) => void) {
  const container = svg.node()!.parentElement as HTMLElement;
  const width = container.clientWidth;
  const height = container.clientHeight;
  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

  if (data.length === 0) {
      const fontSize = Math.max(20, width / 45);
      svg.append("text")
         .attr("x", width / 2)
         .attr("y", height / 2)
         .attr("text-anchor", "middle")
         .attr("dominant-baseline", "central")
         .style("font-family", "Inter, sans-serif")
         .style("font-size", `${fontSize}px`)
         .style("fill", "#6c757d")
         .text("Be the first to add a word.");
      return;
  }

  const pack = d3.pack<BubbleData>().size([width, height]).padding(5);

  const rootData: BubbleData & { children?: BubbleData[] } = {
    word: 'root',
    value: 0,
    score: 0,
    decayFactor: 1,
    children: data
  };
  
  // --- FIX START ---
  // Replicate the widened logarithmic scale for consistency.
  const [, maxVal] = d3.extent(data, d => d.value);
  const sizeScale = d3.scaleLog().domain([1, maxVal || 1]).range([3, 22]).clamp(true);
  const contribution = (val: number) => Math.pow(sizeScale(Math.max(1, val)), 2);
  
  const root = d3.hierarchy(rootData).sum((d) => d.value ? contribution(d.value) : 0);
  // --- FIX END ---
  
  const nodes = pack(root).leaves();
  
  const circleGroups = svg.selectAll<SVGGElement, HierarchyBubbleNode>("g")
      .data(nodes)
      .join("g")
      .attr('transform', d => `translate(${d.x},${d.y})`);
  
  circleGroups.append("circle")
      // --- FIX START ---
      // Adjust minimum radius to match the new scale.
      .attr("r", d => Math.max(d.r, 6))
      // --- FIX END ---
      .attr("fill", d => getBubbleFillStyle(d.data.score).fill)
      .attr("fill-opacity", d => getBubbleFillStyle(d.data.score).fillOpacity)
      .style("cursor", "pointer")
      .on("click", (event, d) => handleVote(d.data.word));
  
  circleGroups.append("text")
      .text(d => d.data.word)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .style("fill", "#000")
      .style("font-family", "Inter, sans-serif")
      .style("pointer-events", "none")
      .each(function(d) {
          const textSelection = d3.select(this);
          // --- FIX START ---
          const radius = Math.max(d.r, 6);
          const availableWidth = radius * 1.9;
          // --- FIX END ---
          textSelection.style("font-size", "10px");
          const naturalWidth = (this as SVGTextElement).getComputedTextLength();
          if (naturalWidth === 0) return;
          const newFontSize = (10 * availableWidth) / naturalWidth;
          // --- FIX START ---
          textSelection.style("font-size", `${Math.min(radius * 1.4, Math.max(newFontSize, 6))}px`);
          // --- FIX END ---
      });
}