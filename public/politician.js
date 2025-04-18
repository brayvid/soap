document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const politicianId = urlParams.get('id');

    if (!politicianId) {
        alert('No politician specified');
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
            document.getElementById('politician-name').textContent = data.politician.name;
            document.getElementById('politician-position').textContent = data.politician.position;

            // Chart for votes specific to this politician
            const ctxPolitician = document.getElementById('votesChart').getContext('2d');
            const labelsPolitician = Object.keys(data.votesForPolitician);
            const votesPolitician = Object.values(data.votesForPolitician);

            new Chart(ctxPolitician, {
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
        })
        .catch(error => {
            console.error('Error fetching politician data:', error);
            alert('Error loading politician data');
        });
});

function submitAdjective() {
    const politicianId = new URLSearchParams(window.location.search).get('id');
    const adjective = document.getElementById('adjective-input').value.trim().toLowerCase();

    if (adjective) {
        fetch('/words', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ word: adjective, politician_id: politicianId }),
        })
        .then(response => response.text())
        .then(data => {
            alert('Adjective submitted and vote added');
            document.getElementById('adjective-input').value = '';
            location.reload(); // Reload the page to update the chart with the new vote
        })
        .catch(error => {
            console.error('Error submitting adjective:', error);
            alert('Error submitting adjective');
        });
    } else {
        alert('Please enter a word.');
    }
}
