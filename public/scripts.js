let politiciansData = []; // To store the fetched data for filtering and sorting
let chartInstance = null;  // Store the chart instance
let currentColumnOrder = null; // To store the current order of columns
let sortDirection = 'desc';  // Default sorting direction
let currentSortColumn = 0;  // Default sorting by Name column

// Function to load politicians and display them in the table
function loadPoliticians() {
    fetch('/politicians')
        .then(response => response.json())
        .then(async politicians => {
            // Fetch vote counts for each politician
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
            politiciansData = politicians; // Store the fetched data

            // Set default column order to alphabetical if not already set
            if (!currentColumnOrder) {
                currentColumnOrder = Object.keys(politiciansData[0].votesForPolitician || {}).sort();
            }

            renderTable(); // Render the table with the default column order
        })
        .catch(error => {
            console.error('Error loading politicians:', error);
        });
}

// Function to render the table based on current politiciansData
function renderTable(filteredData = null) {
    const politicianList = document.getElementById('politician-list');
    const tableHead = document.querySelector('#politicians-table thead tr');

    const dataToRender = filteredData || politiciansData;

    politicianList.innerHTML = ''; // Clear existing list
    tableHead.innerHTML = '<th>Name <span class="sort-arrow" onclick="sortTable(0)">⇅</span></th><th>Position <span class="sort-arrow" onclick="sortTable(1)">⇅</span></th>'; // Reset headers

    if (dataToRender.length > 0) {
        const wordKeys = currentColumnOrder;

        // Add word columns dynamically based on the sorted order
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

            // Populate cells according to the reordered word columns
            wordKeys.forEach(word => {
                const cell = document.createElement('td');
                cell.textContent = politician.votesForPolitician[word] || 0;
                row.appendChild(cell);
            });

            politicianList.appendChild(row);
        });
    }
}

// Function to sort the table by a specific column index (row sorting)
function sortTable(columnIndex) {
    // Initialize sort direction and column on the first click
    if (currentSortColumn !== columnIndex) {
        currentSortColumn = columnIndex;
        sortDirection = 'desc';  // Default to descending order
    } else {
        // Toggle the sort direction on subsequent clicks
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    }

    politiciansData.sort((a, b) => {
        let valueA, valueB;

        if (columnIndex === 0) {  // Sorting by Name
            valueA = a.name.toLowerCase();
            valueB = b.name.toLowerCase();
        } else if (columnIndex === 1) {  // Sorting by Position
            valueA = a.position.toLowerCase();
            valueB = b.position.toLowerCase();
        } else {  // Sorting by Word columns
            const wordKey = currentColumnOrder[columnIndex - 2];
            valueA = a.votesForPolitician[wordKey] || 0;
            valueB = b.votesForPolitician[wordKey] || 0;
        }

        if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
        if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    renderTable(); // Preserve the current column order and sorting
}

// Function to sort word columns by votes for a specific politician (column sorting)
function sortWordColumns(politicianId) {
    console.log(`Function sortWordColumns triggered for politician with ID: ${politicianId}`);

    // Log the entire politiciansData array to check the IDs and ensure the data is correct
    console.log('Current politiciansData:', politiciansData);

    // Log each politician's ID and name to verify what IDs are present
    politiciansData.forEach(politician => {
        console.log(`Politician ID: ${politician.politician_id}, Name: ${politician.name}`);
    });

    // Find the politician by ID, ensuring type consistency
    const politician = politiciansData.find(p => String(p.politician_id) === String(politicianId));

    if (politician) {
        const sortedWords = Object.entries(politician.votesForPolitician).sort((a, b) => b[1] - a[1]); 
        const sortedWordKeys = sortedWords.map(entry => entry[0]);

        console.log('Sorted Word Keys:', sortedWordKeys); // Log the sorted keys

        currentColumnOrder = sortedWordKeys; // Update currentColumnOrder with the new order

        renderTable(); // Re-render the table with sorted columns
    } else {
        console.error(`Politician with ID ${politicianId} not found`);
    }
}

// Function to filter the table based on the search input
function filterTable() {
    const filter = document.getElementById('filter-input').value.toLowerCase();
    
    // Filter the data
    const filteredData = politiciansData.filter(politician => 
        politician.name.toLowerCase().includes(filter) ||
        politician.position.toLowerCase().includes(filter)
    );
    
    renderTable(filteredData); // Render the filtered table without resetting the column order
}

// Function to render the filtered table
function renderFilteredTable(filteredData) {
    const politicianList = document.getElementById('politician-list');
    const tableHead = document.querySelector('#politicians-table thead tr');

    politicianList.innerHTML = ''; // Clear existing list
    tableHead.innerHTML = '<th onclick="sortTable(0)">Name <span class="sort-trigger" onclick="sortWords()">⇅</span></th><th onclick="sortTable(1)">Position</th>'; // Reset headers

    if (filteredData.length > 0) {
        const wordKeys = Object.keys(filteredData[0].votesForPolitician || {});

        // Add word columns dynamically
        wordKeys.forEach((word, index) => {
            const th = document.createElement('th');
            th.textContent = word.charAt(0).toUpperCase() + word.slice(1);
            th.onclick = () => sortTable(index + 2); // Adjust for the name and position columns
            tableHead.appendChild(th);
        });

        filteredData.forEach(politician => {
            const row = document.createElement('tr');
            row.innerHTML = `<td class="name-cell" onclick="sortWordColumns(${politician.politician_id})"><a href="/politician.html?id=${politician.politician_id}">${politician.name}</a></td><td>${politician.position}</td>`;
            
            wordKeys.forEach(word => {
                const cell = document.createElement('td');
                cell.textContent = politician.votesForPolitician[word] || 0;
                row.appendChild(cell);
            });

            politicianList.appendChild(row);
        });
    }
}

// Function to submit a new politician
function submitNewPolitician(event) {
    event.preventDefault();

    const name = document.getElementById('new-politician-name').value.trim();
    const position = document.getElementById('new-politician-position').value.trim();

    if (!name || !position) {
        alert('Please enter both a name and a position.');
        return;
    }

    fetch('/politicians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, position: position }),
    })
    .then(response => response.json())
    .then(data => {
        // alert('New politician added successfully');
        loadPoliticians();  // Reload the list to show the new politician
        document.getElementById('add-politician-form').reset();  // Clear the form
    })
    .catch(error => {
        console.error('Error adding politician:', error);
        alert('Error adding politician');
    });
}

// Function to fetch and display specific politician's data on their page
function loadPoliticianData() {
    const urlParams = new URLSearchParams(window.location.search);
    const politicianId = urlParams.get('id');

    if (!politicianId) {
        console.error('No politician specified');
        return;
    }

    fetch(`/politician/${politicianId}/data`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (!data || !data.politician || !data.votesForPolitician) {
                console.error('Incomplete data received:', data);
                return;
            }

            document.getElementById('politician-name').textContent = data.politician.name;
            document.getElementById('politician-position').textContent = data.politician.position;

            // Sort the words first by count (descending) and then alphabetically for equal counts
            const sortedWords = Object.entries(data.votesForPolitician)
                .sort((a, b) => {
                    if (b[1] === a[1]) {
                        return a[0].localeCompare(b[0]); // Alphabetical order for equal counts
                    }
                    return b[1] - a[1]; // Sort by count (descending)
                });

            const labelsPolitician = sortedWords.map(entry => entry[0]);
            const votesPolitician = sortedWords.map(entry => entry[1]);

            // Destroy existing chart instance if it exists
            if (chartInstance) {
                chartInstance.destroy();
            }

            const ctxPolitician = document.getElementById('votesChart').getContext('2d');

            chartInstance = new Chart(ctxPolitician, {
                type: 'bar',
                data: {
                    labels: labelsPolitician,
                    datasets: [{
                        label: `Votes for ${data.politician.name}`,
                        data: votesPolitician,
                        backgroundColor: 'rgba(153, 102, 255, 0.2)',
                        borderColor: 'rgba(153, 102, 255, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    scales: {
                        y: {
                            beginAtZero: true,
                            stepSize: 1, // Ensure y-axis labels are integers
                            ticks: {
                                precision: 0 // Remove decimal places from the y-axis labels
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false  // Disable the legend
                        }
                    }
                }
            });

            // Position vote buttons
            positionVoteButtons(labelsPolitician, votesPolitician, politicianId);
        })
        .catch(error => {
            console.error('Error fetching politician data:', error);
        });
}


// Function to position the vote buttons below the chart bars
function positionVoteButtons(labels, votes, politicianId) {
    const voteButtonsContainer = document.getElementById('vote-buttons-container');
    voteButtonsContainer.innerHTML = '';  // Clear existing buttons

    labels.forEach((word, index) => {
        const button = document.createElement('button');
        button.textContent = `Vote (${votes[index]})`;
        button.onclick = () => submitVoteForWord(word, politicianId);
        voteButtonsContainer.appendChild(button);
    });
}

// Function to submit a vote for an existing word
function submitVoteForWord(word, politicianId) {
    fetch('/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: word, politician_id: politicianId }),
    })
    .then(response => response.text())
    .then(data => {
        // alert('Vote added successfully');
        loadPoliticianData(); // Reload the data to update the chart and word list
    })
    .catch(error => {
        console.error('Error submitting vote:', error);
        alert('Error submitting vote');
    });
}

// Function to submit a new word for the politician
function submitNewWord(event) {
    event.preventDefault();

    const newWord = document.getElementById('new-word').value.trim();
    const urlParams = new URLSearchParams(window.location.search);
    const politicianId = urlParams.get('id');

    if (!newWord || !politicianId) {
        alert('Please enter a valid word.');
        return;
    }

    fetch('/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: newWord, politician_id: politicianId }),
    })
    .then(response => response.json())
    .then(data => {
        // alert('New word added and vote submitted successfully');
        document.getElementById('new-word').value = ''; // Clear the input field
        loadPoliticianData(); // Reload the data to update the chart and word list
    })
    .catch(error => {
        console.error('Error submitting new word:', error);
        alert('Error submitting new word');
    });
}

// Initial loading of data
window.onload = () => {
    const politicianNameElement = document.getElementById('politician-name');
    const politicianListElement = document.getElementById('politician-list');

    if (politicianNameElement && window.location.search.includes('id=')) {
        loadPoliticianData();  // Load politician data if on politician page with valid ID

        // Attach event listener for new word submission
        const addWordForm = document.getElementById('add-word-form');
        if (addWordForm) {
            addWordForm.addEventListener('submit', submitNewWord);
        }
    } else if (politicianListElement) {
        loadPoliticians();  // Load politician list if on homepage

        // Attach event listener for new politician submission
        const addPoliticianForm = document.getElementById('add-politician-form');
        if (addPoliticianForm) {
            addPoliticianForm.addEventListener('submit', submitNewPolitician);
        }
    }
};
