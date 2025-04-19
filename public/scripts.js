// Copyright 2025 Blake Rayvid <https://github.com/brayvid>

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

            renderTable();
        })
        .catch(error => {
            console.error('Error loading politicians:', error);
        });
}

function renderTable(filteredData = null) {
    const politicianList = document.getElementById('politician-list');
    const tableHead = document.querySelector('#politicians-table thead tr');
    const dataToRender = filteredData || politiciansData;

    politicianList.innerHTML = '';
    tableHead.innerHTML = `
        <th>Name <span class="sort-arrow" onclick="sortTable(0)">⇅</span></th>
        <th>Position <span class="sort-arrow" onclick="sortTable(1)">⇅</span></th>
    `;

    if (dataToRender.length > 0) {
        const wordKeys = currentColumnOrder;

        wordKeys.forEach((word, index) => {
            const th = document.createElement('th');
            th.innerHTML = `${word.charAt(0).toUpperCase() + word.slice(1)} <span class="sort-arrow" onclick="sortTable(${index + 2})">⇅</span>`;
            tableHead.appendChild(th);
        });

        dataToRender.forEach(politician => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <span class="sort-handle" onclick="sortWordColumns(${politician.politician_id})">⇆</span>
                    <a href="/politician.html?id=${politician.politician_id}">${politician.name}</a>
                </td>
                <td>${politician.position}</td>`;

            wordKeys.forEach(word => {
                const cell = document.createElement('td');
                cell.textContent = politician.votesForPolitician[word] || 0;
                row.appendChild(cell);
            });

            politicianList.appendChild(row);
        });
    }
}

function sortTable(columnIndex) {
    if (currentSortColumn !== columnIndex) {
        currentSortColumn = columnIndex;
        sortDirection = 'desc';
    } else {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    }

    politiciansData.sort((a, b) => {
        let valueA, valueB;

        if (columnIndex === 0) {
            valueA = a.name.toLowerCase();
            valueB = b.name.toLowerCase();
        } else if (columnIndex === 1) {
            valueA = a.position.toLowerCase();
            valueB = b.position.toLowerCase();
        } else {
            const wordKey = currentColumnOrder[columnIndex - 2];
            valueA = a.votesForPolitician[wordKey] || 0;
            valueB = b.votesForPolitician[wordKey] || 0;
        }

        if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
        if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    renderTable();
}

function sortWordColumns(politicianId) {
    const politician = politiciansData.find(p => String(p.politician_id) === String(politicianId));
    if (politician) {
        const sortedWords = Object.entries(politician.votesForPolitician).sort((a, b) => b[1] - a[1]);
        currentColumnOrder = sortedWords.map(entry => entry[0]);
        renderTable();
    }
}

function filterTable() {
    const filter = document.getElementById('filter-input').value.toLowerCase();
    const filteredData = politiciansData.filter(politician =>
        politician.name.toLowerCase().includes(filter) ||
        politician.position.toLowerCase().includes(filter)
    );
    renderTable(filteredData);
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
        alert('Error submitting vote');
    });
}
  

async function submitNewPolitician(event) {
    event.preventDefault();
    const name = document.getElementById('name').value;
    const position = document.getElementById('position').value;

    try {
        const response = await fetch('/politicians', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, position })
        });

        if (!response.ok) throw new Error(await response.text());
        const newPol = await response.json();
        console.log('Added:', newPol);
        loadPoliticians();
    } catch (err) {
        console.error('Error adding politician:', err);
        alert('Failed to add politician: ' + err.message);
    }
}

// Load initial data based on the page
window.onload = () => {
    const politicianNameElement = document.getElementById('politician-name');
    const politicianListElement = document.getElementById('politician-list');

    if (politicianNameElement && window.location.search.includes('id=')) {
        loadPoliticianData();

        const addWordForm = document.getElementById('add-word-form');
        if (addWordForm) {
            addWordForm.addEventListener('submit', submitNewWord);
        }
    } else if (politicianListElement) {
        loadPoliticians();

        const addPoliticianForm = document.getElementById('add-politician-form');
        if (addPoliticianForm) {
            addPoliticianForm.addEventListener('submit', submitNewPolitician);
        }
    }
};
