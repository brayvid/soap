// Copyright 2024-2025 soap.fyi <https://soap.fyi>

let politiciansData = [];
let currentColumnOrder = null;
let sortDirection = 'desc';
let currentSortColumn = 0;

// Load all politicians for the homepage table
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
                    console.error(`❌ Error fetching data for politician ID ${politician.politician_id}:`, err);
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
 
function filterTable() {
    const filter = document.getElementById('filter-input').value.toLowerCase();
    const cards = document.querySelectorAll('.politician-card');
  
    cards.forEach(card => {
      const name = card.querySelector('.politician-name')?.textContent.toLowerCase() || '';
      const position = card.querySelector('.politician-position')?.textContent.toLowerCase() || '';
      const words = Array.from(card.querySelectorAll('.word-tag')).map(w => w.textContent.toLowerCase()).join(' ');
  
      const matches = name.includes(filter) || position.includes(filter) || words.includes(filter);
  
      card.style.display = matches ? 'flex' : 'none';
    });
  }
  
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

        // ✅ Clear the form fields after successful submit
        nameInput.value = '';
        positionInput.value = '';

        loadPoliticians();
        loadPoliticiansGrid(); // if you're using the card grid
    } catch (err) {
        console.error('Error adding politician:', err);
        showMessage(err.message || "Something went wrong");
    }
}


async function loadPoliticiansGrid() {
    const grid = document.getElementById('politician-grid');
    if (!grid) return;
    
    grid.innerHTML = ''; // ✅ Clear existing cards
    
    const res = await fetch('/politicians');
    const politicians = await res.json();
    
    politicians.forEach(p => {
        const card = document.createElement('div');
        card.className = 'politician-card';
        card.onclick = () => window.location.href = `/politician/${p.politician_id}`;
    
        card.innerHTML = `
        <div class="politician-bubble">${p.vote_count || 0}</div>
        <div class="politician-name">${p.name}</div>
        <div class="politician-position">${p.position}</div>
        <div class="politician-top-words">
        ${p.top_words && p.top_words.length
            ? p.top_words.map(word => `<span class="word-tag">${word}</span>`).join(' ')
            : '<span class="word-tag muted">No words yet</span>'}
        </div>
    `;
    
        grid.appendChild(card);
    });
    }
    
// Load initial data based on the page
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
      loadPoliticiansGrid(); // you're on the homepage with bubbles
    } else {
      loadPoliticians(); // fallback if you're using a table
    }
  };

function showMessage(msg) {
    const el = document.createElement('div');
    el.innerText = msg;
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
  
    setTimeout(() => {
      el.remove();
    }, 5000);
  }

