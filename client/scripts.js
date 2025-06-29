// Copyright 2024-2025 soap.fyi <https://soap.fyi>

// --- IMPORTS ---
// We import D3 for its color scales and the main stylesheet.
import * as d3 from 'd3';
import './styles.css';

// --- CORE FUNCTIONS ---

// Block 2: The Grid-Building Function with Advanced Styling
async function loadPoliticiansGrid() {
    try {
        const response = await fetch('/politicians');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const politicians = await response.json();
        const grid = document.getElementById('politician-grid');
        if (!grid) return;

        grid.innerHTML = ''; // Clear old content

        politicians.forEach(p => {
            const card = document.createElement('div');
            card.className = 'politician-card';
            card.dataset.politicianId = p.politician_id;

            const searchTerms = [
                p.name.toLowerCase(),
                p.position.toLowerCase(),
                ...(p.search_words || [])
            ].join(' ');
            card.setAttribute('data-search-terms', searchTerms);

            card.addEventListener('click', () => {
                window.location.href = `/politician/${p.politician_id}`;
            });

            const avgScore = p.average_sentiment_score || 0;
            const mainBubbleStyle = getBubbleFillStyle(avgScore);

            const topWordsHTML = p.top_words && p.top_words.length > 0
              ? p.top_words.map(w => {
                  const wordStyle = getSentimentStyle(w.score);
                  return `<span class="word-tag" style="background-color: ${wordStyle.backgroundColor}; color: ${wordStyle.color};">${w.word}</span>`;
                }).join(' ')
              : '<span class="word-tag muted">No words yet</span>';

            card.innerHTML = `
              <div class="politician-bubble">${p.vote_count || 0}</div>
              <div class="politician-name">${p.name}</div>
              <div class="politician-position">${p.position}</div>
              <div class="politician-top-words">${topWordsHTML}</div>
            `;

            grid.appendChild(card);
        });

    } catch (error) {
        console.error('Failed to load politicians grid:', error);
        const grid = document.getElementById('politician-grid');
        if (grid) {
            grid.innerHTML = '<p>Could not load politician data. Please try again later.</p>';
        }
    }
}

/**
 * Handles the form submission for creating a new politician.
 */
async function submitNewPolitician(event) {
    event.preventDefault();
    const nameInput = document.getElementById('name');
    const positionInput = document.getElementById('position');
    const name = nameInput.value;
    const position = positionInput.value;

    try {
        const response = await fetch('/politicians', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, position })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to add politician');
        }

        // Clear form and reload the grid with the new data
        nameInput.value = '';
        positionInput.value = '';
        loadPoliticiansGrid(); // Reload the grid to show the new politician
        showMessage('Added successfully', 'success');

    } catch (err) {
        console.error('Error adding politician:', err);
        showMessage(err.message);
    }
}

/**
 * Filters the visible politician cards based on the search input.
 * This function works on the data already present in the DOM, making it fast.
 */
function filterTable() {
    const input = document.getElementById('filter-input');
    if (!input) return;

    const filter = input.value.toLowerCase();
    const grid = document.getElementById('politician-grid');
    if (!grid) return;

    const cards = grid.getElementsByClassName('politician-card');
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const searchTerms = card.getAttribute('data-search-terms');
        if (searchTerms.includes(filter)) {
            card.style.display = ""; // Show card
        } else {
            card.style.display = "none"; // Hide card
        }
    }
}

// --- HELPER FUNCTIONS ---

// Block 1: Advanced Styling Functions

/**
 * The master color function. It takes a sentiment score and returns a
 * D3-calculated color. This is the core of your visual style.
 * @param {number} score - A sentiment score from -1.0 to 1.0
 * @returns {{fill: string, fillOpacity: number}}
 */
function getBubbleFillStyle(score) {
    const BUBBLE_OPACITY = 1.0;
    let colorString;

    // Scale for positive scores: from 'A little positive' to 'Most positive'
    const positiveColorScale = d3.scaleLinear()
        .domain([0.05, 1.0])
        .range(['#9fad42', '#2a8d64']) // Yellow-green to deep green
        .clamp(true);

    // Scale for negative scores: from 'A little negative' to 'Most negative'
    const negativeColorScale = d3.scaleLinear()
        .domain([-0.05, -1.0])
        .range(['#CDb14c', '#DE3B3B']) // Gold-ish to deep red
        .clamp(true);

    if (score >= 0.05) {
        colorString = positiveColorScale(score);
    } else if (score <= -0.05) {
        colorString = negativeColorScale(score);
    } else {
        colorString = '#BFBFBF'; // Neutral color
    }
    
    return { fill: colorString, fillOpacity: BUBBLE_OPACITY };
}

/**
 * A helper that uses getBubbleFillStyle to return style properties
 * for smaller elements like word tags, ensuring visual consistency.
 * @param {number} score - A sentiment score from -1.0 to 1.0
 * @returns {{backgroundColor: string, color: string}}
 */
function getSentimentStyle(score) {
    const { fill } = getBubbleFillStyle(score);
    // Always use white text on the dark, saturated backgrounds for high contrast
    const textColor = '#FFFFFF'; 
    return { backgroundColor: fill, color: textColor };
}

/**
 * Displays a temporary floating message at the bottom of the screen.
 * Can be used for errors, success messages, etc.
 */
function showMessage(msg, type = 'error') {
    const el = document.createElement('div');
    el.innerText = msg;
    el.style.position = 'fixed';
    el.style.bottom = '20px';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.background = type === 'success' ? '#28a745' : '#ff3860'; // Green for success, red for error
    el.style.color = 'white';
    el.style.padding = '10px 20px';
    el.style.borderRadius = '8px';
    el.style.zIndex = 2100; // High z-index
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    el.style.fontFamily = '"Inter", "Segoe UI", sans-serif';
    el.style.fontSize = '1rem';
    document.body.appendChild(el);
    setTimeout(() => {
        el.remove();
    }, 4000);
}


// --- MAIN EXECUTION ---

// This event listener is the entry point. It runs once the HTML is ready.
document.addEventListener('DOMContentLoaded', () => {

    // Logic for the home page (index.html)
    if (document.getElementById('politician-grid')) {
        loadPoliticiansGrid();

        const filterInput = document.getElementById('filter-input');
        if (filterInput) {
            filterInput.addEventListener('input', filterTable);
        }

        const addPoliticianForm = document.getElementById('add-politician-form');
        if (addPoliticianForm) {
            addPoliticianForm.addEventListener('submit', submitNewPolitician);
        }
    }

    // Logic for the banner message (present on multiple pages)
    const banner = document.getElementById('banner-message');
    const closeBannerBtn = document.getElementById('close-banner-btn');
    if (banner && closeBannerBtn) {
        try {
            if (sessionStorage.getItem('bannerClosed') === 'true') {
                banner.style.display = 'none';
            } else {
                banner.style.display = 'flex';
            }
        } catch (e) {
            console.warn('SessionStorage not available for banner state.');
            banner.style.display = 'flex';
        }

        closeBannerBtn.addEventListener('click', function() {
            banner.style.display = 'none';
            try {
                sessionStorage.setItem('bannerClosed', 'true');
            } catch (e) {
                console.warn('SessionStorage not available for banner state.');
            }
        });
    }

    // This file does not handle the politician detail page logic.
    // That is correctly handled by `politician.js`.
});