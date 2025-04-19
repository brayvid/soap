document.addEventListener('DOMContentLoaded', loadPoliticianData);

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
    .then(response => {
      // Even if response is text, we still proceed on success
      if (!response.ok) throw new Error('Failed to submit word');
      return response.text();
    })
    .then(() => {
      document.getElementById('new-word').value = '';
      loadPoliticianData(); // 💥 Always re-renders the bubble chart
    })
    .catch(error => {
      console.error('Error submitting new word:', error);
      alert('Error submitting new word');
    });
  }
  
function loadPoliticianData() {
    const urlParams = new URLSearchParams(window.location.search);
    const politicianId = urlParams.get('id');
  
    if (!politicianId) return;
  
    fetch(`/politician/${politicianId}/data`)
      .then(res => res.json())
      .then(data => {
        const { name, position } = data.politician;
        document.getElementById('politician-name').textContent = name;
        document.getElementById('politician-position').textContent = position;
  
        drawBubbleChart(data.votesForPolitician, politicianId); // 💥 Refresh chart
      })
      .catch(err => {
        console.error('Error loading data:', err);
      });
  }

  

function drawBubbleChart(voteData, politicianId) {
    const width = 500;
    const height = 500;

    document.getElementById('bubble-chart-container').style.display = 'flex';

    const data = Object.entries(voteData)
        .map(([word, count]) => ({ word, value: count }));


    const svg = d3.select("#bubble-chart");
    svg.selectAll("*").remove(); // Clear previous chart

    const root = d3.hierarchy({
        children: Object.entries(voteData)
          .filter(([_, count]) => count > 0) // ✅ Only include positive vote counts
          .map(([word, count]) => ({ word, value: count }))
      }).sum(d => d.value);      

    const pack = d3.pack()
        .size([width, height])
        .padding(10);

    const nodes = pack(root).leaves();

    const bubbleGroup = svg
        .attr("viewBox", [0, 0, width, height])
        .append("g");

    const node = bubbleGroup.selectAll("g")
        .data(nodes)
        .enter()
        .append("g")
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            voteForWord(d.data.word, politicianId);
        });

    node.append("circle")
        .attr("r", d => d.r)
        .attr("fill", "steelblue")
        .attr("opacity", 0.8);

    node.append("text")
        .text(d => `${d.data.word} (${d.data.value})`)
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .style("fill", "white")
        .style("font-size", d => {
            const label = `${d.data.word} (${d.data.value})`;
            const scaledSize = 2 * d.r / label.length;
            return `${Math.max(Math.min(scaledSize, 18), 10)}px`; // min 10px, max 18px
          })
        .style("pointer-events", "none");
    
}

function voteForWord(word, politicianId) {
    fetch('/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, politician_id: politicianId }),
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to vote');
        return response.text();
    })
    .then(() => {
        // alert(`Voted for "${word}"`);
        location.reload();
    })
    .catch(err => {
        console.error('Vote error:', err);
        alert('Could not submit vote');
    });
}
