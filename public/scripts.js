// Copyright 2024-2025 soap.fyi <https://soap.fyi>

let politiciansData = [];
let currentColumnOrder = null;

// Fetches all politicians and their individual word data (votes), then stores them globally
function loadPoliticians() {
    fetch('/politicians')
        .then(response => response.json())
        .then(async politicians => {
            for (let politician of politicians) {
                try {
                    const response = await fetch(`/politician/${politician.politician_id}/data`);
                    if (!response.ok) throw new Error('Failed to fetch politician data');
                    const data = await response.json();
                    politician.votesForPolitician = data?.votesForPolitician || {};
                } catch (err) {
                    console.error(`Error fetching data for politician ID ${politician.politician_id}:`, err);
                    politician.votesForPolitician = {};
                }                
            }

            politiciansData = politicians;

            if (!currentColumnOrder) {
                currentColumnOrder = Object.keys(politiciansData[0].votesForPolitician || {}).sort();
            }

            // renderTable();
        })
        .catch(error => {
            console.error('Error loading politicians:', error);
        });
}

// Submits a new word vote for a specific politician, then reloads their word data
function submitVoteForWord(word, politicianId) {
    fetch('/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: word, politician_id: politicianId }),
    })
    .then(response => response.text())
    .then(() => loadPoliticianData())
    .catch(error => {
        console.error('Error submitting vote:', error);
        showMessage(error.message || 'Error submitting vote');
    });
}

// Filters visible politician cards based on search input (name, position, and top words)
function filterTable() {
    const filter = document.getElementById('filter-input').value.toLowerCase();
    const cards = document.querySelectorAll('.politician-card');
  
    cards.forEach(card => {
      const name = card.querySelector('.politician-name')?.textContent?.toLowerCase() || '';
      const position = card.querySelector('.politician-position')?.textContent?.toLowerCase() || '';
      const id = card.dataset.politicianId;
      const pol = politiciansData.find(p => p.politician_id == id);
  
      const searchWords = (pol?.search_words || []).join(' ').toLowerCase();
      const fullText = `${name} ${position} ${searchWords}`;
  
      const matches = fullText.includes(filter);
      card.style.display = matches ? '' : 'none';
    });
  }
  

// Handles form submission for creating a new politician, resets the form, and reloads UI
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

        if (!response.ok) throw new Error(await response.text());
        const newPol = await response.json();
        // console.log('Added:', newPol);

        // Clear the form fields after successful submit
        nameInput.value = '';
        positionInput.value = '';

        loadPoliticians();
        loadPoliticiansGrid();
    } catch (err) {
        console.error('Error adding politician:', err);
        showMessage(err.message || "Something went wrong");
    }
}

// Renders politician cards on the homepage using data from /politicians
async function loadPoliticiansGrid() {
    const grid = document.getElementById('politician-grid');
    if (!grid) return;
    
    grid.innerHTML = ''; // Clear existing cards
    
    const res = await fetch('/politicians');
    const politicians = await res.json();
    politiciansData = politicians;

    
    politicians.forEach(p => {
        const card = document.createElement('div');
        card.className = 'politician-card';
        card.dataset.politicianId = p.politician_id;
        card.onclick = () => window.location.href = `/politician/${p.politician_id}`;
    
        const topWord = p.top_words?.[0];
        const sentiment = topWord?.sentiment || 'gray';
    
        card.innerHTML = `
          <div class="politician-bubble bubble-${sentiment}">${p.vote_count || 0}</div>
          <div class="politician-name">${p.name}</div>
          <div class="politician-position">${p.position}</div>
          <div class="politician-top-words bg-${sentiment}">
            ${p.top_words && p.top_words.length
              ? p.top_words.map(w =>
                  `<span class="word-tag word-${w.sentiment}">${w.word}</span>`
                ).join(' ')
              : '<span class="word-tag muted">No words yet</span>'}
          </div>
        `;
    
        grid.appendChild(card);
    });
    
}

// --- MODIFICATIONS START HERE ---

// Global variables to track the rate limit message specifically
let rateLimitMessageElement = null;
let rateLimitMessageTimeoutId = null;
const RATE_LIMIT_MESSAGE_TEXT = "Rate limit exceeded for this IP";

// Helper function to create and style a message element
function createMessageElement(msgText) {
    const el = document.createElement('div');
    el.innerText = msgText;
    el.style.position = 'fixed';
    el.style.bottom = '20px';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.background = '#ff3860'; // red-ish
    el.style.color = 'white';
    el.style.padding = '10px 20px';
    el.style.borderRadius = '8px';
    el.style.zIndex = 1000;
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    el.style.fontFamily = 'sans-serif';
    el.style.fontSize = '1rem';
    document.body.appendChild(el);
    return el;
}

// Displays a temporary floating error message at the bottom of the screen
function showMessage(msg) {
    if (msg === RATE_LIMIT_MESSAGE_TEXT) {
        if (rateLimitMessageElement && document.body.contains(rateLimitMessageElement)) {
            // Rate limit message is already visible, reset its timer
            clearTimeout(rateLimitMessageTimeoutId);
            rateLimitMessageTimeoutId = setTimeout(() => {
                if (rateLimitMessageElement) {
                    rateLimitMessageElement.remove();
                }
                // Clear references
                rateLimitMessageElement = null;
                rateLimitMessageTimeoutId = null;
            }, 5000);
            return; // Do not create a new element
        } else {
            // Rate limit message is not visible or was removed by other means.
            // Clear any potentially stale timer or element reference.
            if (rateLimitMessageTimeoutId) {
                clearTimeout(rateLimitMessageTimeoutId);
            }
            if (rateLimitMessageElement && rateLimitMessageElement.parentElement) {
                 // If it exists but wasn't caught by document.body.contains (unlikely but safe)
                rateLimitMessageElement.remove();
            }
            
            // Create and show the new rate limit message
            rateLimitMessageElement = createMessageElement(msg);
            rateLimitMessageTimeoutId = setTimeout(() => {
                if (rateLimitMessageElement) {
                    rateLimitMessageElement.remove();
                }
                // Clear references
                rateLimitMessageElement = null;
                rateLimitMessageTimeoutId = null;
            }, 5000);
            return; // Rate limit message handled
        }
    }

    // For all other messages, create them normally
    const el = createMessageElement(msg);
    setTimeout(() => {
      el.remove();
    }, 5000);
}
// --- MODIFICATIONS END HERE ---
    
// Determines which page you're on and sets up appropriate event handlers and data loading
window.onload = () => {
    const addPoliticianForm = document.getElementById('add-politician-form');
    if (addPoliticianForm) {
      addPoliticianForm.addEventListener('submit', submitNewPolitician);
    }
  
    const addWordForm = document.getElementById('add-word-form');
    if (addWordForm) {
      addWordForm.addEventListener('submit', submitNewWord);
    }
  
    const politicianNameElement = document.getElementById('politician-name');
    if (politicianNameElement) {
      loadPoliticianData(); // you're on a politician/:id page
    } else if (document.getElementById('politician-grid')) {
        loadPoliticiansGrid();

        // Attach filter listener
        const filterInput = document.getElementById('filter-input');
        if (filterInput) {
            filterInput.addEventListener('input', () => {
            clearTimeout(window._filterDebounce);
            window._filterDebounce = setTimeout(filterTable, 200); // debounce
            });
        }  
    } else {
      loadPoliticians(); // fallback if you're using a table
    }
  };

document.addEventListener('DOMContentLoaded', function() {
    const banner = document.getElementById('banner-message');
    const closeBannerBtn = document.getElementById('close-banner-btn');

    if (banner && closeBannerBtn) {
        try {
            // Check if banner was closed previously in this session
            if (sessionStorage.getItem('bannerClosed') === 'true') {
                banner.style.display = 'none';
            } else {
                banner.style.display = 'flex'; // Ensure it's visible if not closed
            }
        } catch (e) {
            console.warn('SessionStorage is not available for banner state:', e);
            banner.style.display = 'flex'; // Show banner if sessionStorage fails
        }

        closeBannerBtn.addEventListener('click', function() {
            banner.style.display = 'none';
            try {
                // Remember for this session that the banner was closed
                sessionStorage.setItem('bannerClosed', 'true');
            } catch (e) {
                console.warn('SessionStorage is not available for banner state:', e);
                // Banner is hidden for this view, but state won't be remembered for next
            }
        });
    }
});