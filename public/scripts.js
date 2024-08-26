let chartInstance = null;  // Store the chart instance

// Function to fetch and display all politicians on the homepage
function loadPoliticians() {
    fetch('/politicians')
        .then(response => response.json())
        .then(politicians => {
            const politicianList = document.getElementById('politician-list');
            if (politicianList) {
                politicianList.innerHTML = ''; // Clear existing list

                if (politicians.length === 0) {
                    const noOption = document.createElement('li');
                    noOption.textContent = 'No politicians available';
                    politicianList.appendChild(noOption);
                } else {
                    politicians.forEach(politician => {
                        const li = document.createElement('li');
                        const a = document.createElement('a');
                        a.href = `/politician.html?id=${politician.politician_id}`;
                        a.textContent = `${politician.name} (${politician.position})`;
                        li.appendChild(a);
                        politicianList.appendChild(li);
                    });
                }
            }
        })
        .catch(error => {
            console.error('Error loading politicians:', error);
            alert('Error loading politicians');
        });
}

// Function to handle the submission of a new politician
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
    .then(response => response.text())
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
            console.log('Fetched Politician Data:', data);  // Log the fetched data for debugging

            if (!data || !data.politician || !data.votesForPolitician) {
                console.error('Incomplete data received:', data);
                return;
            }

            document.getElementById('politician-name').textContent = data.politician.name;
            document.getElementById('politician-position').textContent = data.politician.position;

            // Destroy existing chart instance if it exists
            if (chartInstance) {
                chartInstance.destroy();
            }

            const ctxPolitician = document.getElementById('votesChart').getContext('2d');
            const labelsPolitician = Object.keys(data.votesForPolitician);
            const votesPolitician = Object.values(data.votesForPolitician);

            console.log('Chart Labels:', labelsPolitician);
            console.log('Chart Data:', votesPolitician);

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
                            beginAtZero: true
                        }
                    }
                }
            });

            const wordsList = document.getElementById('words');
            if (wordsList) {
                wordsList.innerHTML = '';

                labelsPolitician.forEach((word, index) => {
                    const li = document.createElement('li');
                    const button = document.createElement('button');
                    button.textContent = `Vote (${votesPolitician[index]})`;
                    button.onclick = () => submitVoteForWord(word, politicianId);
                    li.textContent = word + ' ';
                    li.appendChild(button);
                    wordsList.appendChild(li);
                });
            }
        })
        .catch(error => {
            console.error('Error fetching politician data:', error);
            alert('Error loading politician data');
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
    .then(response => response.text())
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
