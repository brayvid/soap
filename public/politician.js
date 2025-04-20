document.addEventListener('DOMContentLoaded', loadPoliticianData);

function submitNewWord(event) {
    event.preventDefault();
  
    const newWord = document.getElementById('new-word').value.trim();
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const politicianId = pathParts[pathParts.length - 1];
    
    // console.log("🧠 politicianId =", politicianId);  
  
    if (!newWord || !politicianId) {
      alert('Please enter a valid word.');
      return;
    }
  
    fetch('/words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: newWord, politician_id: Number(politicianId) }),

    })
    .then(async (response) => {
      if (response.status === 429) {
        showMessage("Rate limit exceeded for this IP");
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showMessage(data.error || "Something went wrong submitting your word.");
        return;
      }
    
      document.getElementById('new-word').value = '';
      loadPoliticianData();
    })
    .catch(error => {
      console.error('Error submitting new word:', error);
      showMessage("Network error. Please try again.");
    });
    
  }
  
  function loadPoliticianData() {
    // ✅ Extract ID from path (e.g., /politician/1)
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const politicianId = pathParts[pathParts.length - 1];
    // console.log("🧠 politicianId =", politicianId);
  
    // ✅ Guard: ensure it's a valid number
    if (!politicianId || isNaN(Number(politicianId))) {
      // console.error("❌ Invalid politician ID:", politicianId);
      window.location.href = '/404.html';
      return;
    }
  
    // ✅ Fetch data from backend
    fetch(`/politician/${politicianId}/data`)
      .then(res => {
        if (!res.ok) {
          window.location.href = '/404.html';
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (!data) return;
  
        const { name, position } = data.politician;
        document.getElementById('politician-name').textContent = name;
        document.getElementById('politician-position').textContent = position;
  
        const voteData = data.votesForPolitician || {};
        const hasValidVotes = Object.values(voteData).some(count => count > 0);
        const bubbleContainer = document.getElementById('bubble-chart-container');
  
        if (!hasValidVotes) {
          bubbleContainer.style.display = 'block';
          bubbleContainer.style.justifyContent = '';
          bubbleContainer.style.alignItems = '';
          bubbleContainer.style.height = 'auto';
  
          bubbleContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem; font-size: 1.2rem; color: #555;">
              Be the first to add a word.
            </div>
          `;
        } else {
          bubbleContainer.style.display = 'flex';
          bubbleContainer.style.justifyContent = 'center';
          bubbleContainer.style.alignItems = 'center';
          bubbleContainer.innerHTML = '<svg id="bubble-chart" width="500" height="500"></svg>';
          drawBubbleChart(voteData, politicianId);
        }
      })
      .catch(err => {
        console.error('Error loading data:', err);
        window.location.href = '/404.html';
      });
  }
  

function drawBubbleChart(voteData, politicianId) {
  const container = document.getElementById('bubble-chart-container');
  const svg = d3.select("#bubble-chart");

  // Clear existing SVG elements
  svg.selectAll("*").remove();

  const data = Object.entries(voteData)
    .filter(([_, count]) => count > 0)
    .map(([word, count]) => ({ word, value: count }));

  // 🔥 If no votes, show a clean message and collapse chart space
  if (data.length === 0) {
    svg.style("display", "none");

    // Collapse container space
    container.style.height = "auto";
    container.style.padding = "0";
    container.style.margin = "0";

    const message = document.createElement("p");
    message.textContent = "Be the first to add a word!";
    message.style.textAlign = "center";
    message.style.padding = "0.75rem 1rem";
    message.style.margin = "0";
    message.style.fontSize = "1rem";
    message.style.color = "#555";
    message.id = "no-data-message";

    if (!document.getElementById("no-data-message")) {
      container.appendChild(message);
    }

    return;
  }

  // 🧼 Remove the message and show SVG if there are votes
  const oldMessage = document.getElementById("no-data-message");
  if (oldMessage) oldMessage.remove();
  svg.style("display", "block");

  container.style.height = "100%";
  container.style.padding = "0";
  container.style.margin = "0";

  const width = container.clientWidth;
  const height = container.clientHeight;

  svg
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "100%");

  const root = d3.hierarchy({ children: data }).sum(d => d.value);

  const pack = d3.pack()
    .size([width, height])
    .padding(3); // tighter spacing

  const nodes = pack(root).leaves();

  const bubbleGroup = svg.append("g");

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
    .style("stroke", "black")
    .style("stroke-width", "1.5px")
    .style("paint-order", "stroke")
    .style("stroke-linejoin", "round")
    .style("font-size", d => {
      const label = `${d.data.word} (${d.data.value})`;
      const scaledSize = 4 * d.r / label.length;
      return `${Math.max(Math.min(scaledSize, 18), 10)}px`;
    })
    .style("pointer-events", "none");
}


function voteForWord(word, politicianId) {
    fetch('/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, politician_id: Number(politicianId) }),
    })
    .then(async (response) => {
      if (response.status === 429) {
        showMessage("Rate limit exceeded for this IP");
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showMessage(data.error || "Error voting for word.");
        return;
      }
    
      location.reload();
    })
    .catch(err => {
      console.error('Vote error:', err);
      showMessage("Network error while voting.");
    });
    
}


document.addEventListener('DOMContentLoaded', () => {
  loadPoliticianData();

  const form = document.getElementById('add-word-form');
  if (form) {
    form.addEventListener('submit', submitNewWord);
  }
});



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