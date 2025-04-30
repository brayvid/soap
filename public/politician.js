// Copyright 2024-2025 soap.fyi <https://soap.fyi>

document.addEventListener('DOMContentLoaded', loadPoliticianData);

function submitNewWord(event) {
  event.preventDefault();

  const newWordInput = document.getElementById('new-word');
  const newWord = newWordInput.value.trim();
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const politicianId = pathParts[pathParts.length - 1];

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

    // Clear input after successful submission
    newWordInput.value = '';
    loadPoliticianData();
  })
  .catch(error => {
    console.error('Error submitting new word:', error);
    showMessage("Network error. Please try again.");
  });
}

  
function loadPoliticianData() {
  // Extract ID from path (e.g., /politician/1)
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const politicianId = pathParts[pathParts.length - 1];
  // console.log("politicianId =", politicianId);

  // Guard: ensure it's a valid number
  if (!politicianId || isNaN(Number(politicianId))) {
    // console.error("Invalid politician ID:", politicianId);
    window.location.href = '/404.html';
    return;
  }

  // Fetch data from backend
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
      currentVoteData = voteData;         // Store globally
      currentPoliticianId = politicianId; // Store globally
      const hasValidVotes = Object.values(voteData).some(count => count > 0);
      const bubbleContainer = document.getElementById('bubble-chart-container');

      if (!hasValidVotes) {
        bubbleContainer.classList.add('bubble-empty');
        bubbleContainer.classList.remove('bubble-active');
        bubbleContainer.innerHTML = `
          <div style="text-align: center; padding: 1rem; font-size: 1rem; color: #555;">
            Be the first to add a word.
          </div>
        `;
      } else {
        bubbleContainer.classList.remove('bubble-empty');
        bubbleContainer.classList.add('bubble-active');
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
  svg.selectAll("*").remove(); // Clear previous chart

  const data = Object.entries(voteData)
    .filter(([_, count]) => count > 0)
    .map(([word, count]) => ({ word, value: count }));

  if (data.length === 0) {
    svg.style("display", "none");
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

  const oldMessage = document.getElementById("no-data-message");
  if (oldMessage) oldMessage.remove();
  svg.style("display", "block");

  container.style.height = "100%";
  container.style.padding = "0";
  container.style.margin = "0";

  let width = container.clientWidth;
  let height = container.clientHeight;
  
  // If in widescreen mode (very short but wide), force square
  if (height < width * 0.75) {
    height = width;
  }
  
  svg
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // Area-proportional radius scale
  const isMobile = width < 600;
  
  const radiusScale = d3.scaleSqrt()
    .domain([d3.min(data, d => d.value), d3.max(data, d => d.value)])
    .range(isMobile ? [8, 40] : [16, 60]); // smaller on mobile, clearer on desktop
  
  const root = d3.hierarchy({ children: data })
    .sum(d => d.value);

  const pack = d3.pack()
    .size([width, height])
    .padding(2); // slight padding, not too repulsive

  const nodes = pack(root).leaves();

  // Circle layer
  const bubbleLayer = svg.append("g").attr("id", "bubble-layer");
  bubbleLayer.selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", d => d.r)
    .attr("fill", "steelblue")
    .attr("opacity", 0.8)
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      voteForWord(d.data.word, politicianId);
    });

  // Label layer
  const labelLayer = svg.append("g").attr("id", "label-layer");
  labelLayer.selectAll("text")
    .data(nodes)
    .enter()
    .append("text")
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .each(function (d) {
      const text = d3.select(this);
      text.append("tspan")
        .text(d.data.word)
        .attr("x", d.x)
        .attr("dy", "-0.3em");
    
      text.append("tspan")
        .text(`${d.data.value}`)
        .attr("x", d.x)
        .attr("dy", "1em");
    })    
    .attr("text-anchor", "middle")
    .attr("alignment-baseline", "middle")
    .style("fill", "white")
    .style("stroke", "black")
    .style("stroke-width", "1px")
    .style("paint-order", "stroke")
    .style("stroke-linejoin", "round")
    .style("font-size", d => {
      const size = d.r * 0.4; // d.r scales with viewBox, so label matches bubble
      return `${Math.max(Math.min(size, 36), 10)}px`; // or even 40–48px
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
  const isPoliticianPage = /^\/politician\/\d+$/.test(window.location.pathname);
  if (!isPoliticianPage) return;

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

// Re-render on window resize
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (currentVoteData && currentPoliticianId) {
      drawBubbleChart(currentVoteData, currentPoliticianId);
    }
  }, 150);
});


document.querySelectorAll('input, textarea').forEach(el => {
  el.addEventListener('input', () => {
    if (el.value.length > 20) {
      el.value = el.value.slice(0, 20);
    }
  });
});