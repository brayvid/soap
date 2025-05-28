// Copyright 2024-2025 soap.fyi <https://soap.fyi>

// Handles form submission to add a new word for the current politician
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

    newWordInput.value = '';
    loadPoliticianData();
  })
  .catch(error => {
    console.error('Error submitting new word:', error);
    showMessage("Network error. Please try again.");
  });
}

// Loads politician data (name, position, votes) based on the ID in the URL
// If no votes exist, shows a message; otherwise draws the bubble chart
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
    .then(async data => {
      if (!data) return;

      const { name, position } = data.politician;
      document.getElementById('politician-name').textContent = name;
      document.getElementById('politician-position').textContent = position;

      const voteData = data.votesForPolitician || {};
      currentVoteData = voteData;         // Store globally
      currentPoliticianId = politicianId; // Store globally
      const hasValidVotes = Object.values(voteData).some(v => v.count > 0);
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
        bubbleContainer.innerHTML = '<svg id="bubble-chart" viewBox="0 0 500 500" preserveAspectRatio="xMidYMid meet"></svg>';
        await drawBubbleChart(voteData, politicianId);
      }
    })
    .catch(err => {
      console.error('Error loading data:', err);
      window.location.href = '/404.html';
    });
}

// Renders a D3 bubble chart using the politician's vote data
// Each bubble size corresponds to the word frequency
// Handles empty states, layout, and responsive sizing
async function drawBubbleChart(voteData, politicianId) {
  const container = document.getElementById('bubble-chart-container');
  const svg = d3.select("#bubble-chart");
  svg.selectAll("*").remove(); // Clear previous chart

  // Filter only votes with count > 0
  const data = voteData.filter(entry => entry.count > 0).map(entry => ({
    word: entry.word,
    value: entry.count,
    sentiment: entry.sentiment,
  }));

  if (data.length === 0) {
    svg.style("display", "none");
    if (container) { // Ensure container exists before modifying its innerHTML
        container.innerHTML = `
        <div id="no-data-message" style="text-align: center; padding: 1rem; font-size: 1rem; color: #555;">
            Be the first to add a word!
        </div>
        `;
    }
    return;
  }

  const oldMessage = document.getElementById("no-data-message");
  if (oldMessage) oldMessage.remove();
  svg.style("display", "block");

  // This dimension is for the D3 pack layout algorithm's internal coordinate system.
  const PACK_LAYOUT_DIMENSION = 500;
  // Percentage of the viewBox side to use as padding around the bubble cluster.
  // 0.0 means no padding (bubbles can touch the edge).
  // 0.05 means 5% padding on each side (top, bottom, left, right).
  const PADDING_PERCENT = 0.01;

  const root = d3.hierarchy({ children: data }).sum(d => d.value);
  const pack = d3.pack()
    .size([PACK_LAYOUT_DIMENSION, PACK_LAYOUT_DIMENSION])
    .padding(2);

  const nodes = pack(root).leaves();

  if (nodes.length === 0) {
    svg.style("display", "none");
    if (container) {
        container.innerHTML = `
        <div id="no-data-message" style="text-align: center; padding: 1rem; font-size: 1rem; color: #555;">
            No data to display in bubbles.
        </div>
        `;
    }
    return;
  }

  // Calculate the actual bounding box of all packed bubbles
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodes.forEach(d => {
    minX = Math.min(minX, d.x - d.r);
    maxX = Math.max(maxX, d.x + d.r);
    minY = Math.min(minY, d.y - d.r);
    maxY = Math.max(maxY, d.y + d.r);
  });

  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;

  // Determine the side length of the content's bounding box if it were square
  const baseViewBoxSide = Math.max(contentWidth, contentHeight);

  // Calculate the final viewBox side, including padding
  // The content (baseViewBoxSide) should occupy (1 - 2 * PADDING_PERCENT) of the finalViewBoxSide
  let finalViewBoxSide;
  if (PADDING_PERCENT < 0.5 && PADDING_PERCENT >= 0) { // Ensure PADDING_PERCENT is valid
    finalViewBoxSide = baseViewBoxSide / (1 - (2 * PADDING_PERCENT));
  } else {
    finalViewBoxSide = baseViewBoxSide; // Fallback if PADDING_PERCENT is out of sensible range
  }
  
  const paddingAmount = (finalViewBoxSide - baseViewBoxSide) / 2;

  // Calculate the top-left corner (x, y) of the viewBox.
  // This centers the content within the square viewBox and adds padding.
  const viewBoxX = minX - (baseViewBoxSide - contentWidth) / 2 - paddingAmount;
  const viewBoxY = minY - (baseViewBoxSide - contentHeight) / 2 - paddingAmount;

  svg
    .attr("viewBox", `${viewBoxX} ${viewBoxY} ${finalViewBoxSide} ${finalViewBoxSide}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const chartGroup = svg.append("g");

  // Bubbles
  const bubbleLayer = chartGroup.append("g").attr("id", "bubble-layer");
  bubbleLayer.selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", d => d.r)
    .attr("fill", d => {
      if (d.data.sentiment === 'green') return '#0080004d'; // positive
      if (d.data.sentiment === 'red') return '#f8d3d7';     // negative
      return '#eeeeee';                                     // neutral/gray
    })
    .attr("opacity", 1)
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      // Ensure voteForWord is defined and accessible in this scope
      if (typeof voteForWord === 'function') {
        voteForWord(d.data.word, politicianId);
      } else {
        console.error("voteForWord function is not defined.");
      }
    });

  // Labels
  const labelLayer = chartGroup.append("g").attr("id", "label-layer");
  labelLayer.selectAll("text")
    .data(nodes)
    .enter()
    .append("text")
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .each(function (d) {
      const text = d3.select(this);
      // Word tspan
      text.append("tspan")
        .text(d.data.word)
        .attr("x", d.x)
        .attr("dy", "-0.3em"); // Adjust vertical position for the first line

      // Value tspan
      text.append("tspan")
        .text(`${d.data.value}`)
        .attr("x", d.x)
        .attr("dy", "1em");  // Adjust vertical position for the second line, relative to the first
    })
    .attr("text-anchor", "middle")
    .attr("alignment-baseline", "middle")
    .attr("font-size", d => {
        // Ensure radius is positive to avoid issues with Math.log or Math.sqrt if r can be 0
        const baseSize = d.r > 0 ? Math.max(Math.min(d.r * 0.4, 24), 8) : 8;
        return `${baseSize}px`;
    })
    .style("fill", "#2e2e2e")
    .style("paint-order", "stroke") // Improves readability of text over varied backgrounds
    // .style("stroke", "#ffffffaa")    // Light stroke for better contrast (optional)
    .style("stroke-width", "0.08em")    // Stroke width relative to font size (optional)
    .style("stroke-linejoin", "round")
    .style("pointer-events", "none");
}

// Handles clicking on a bubble to cast a vote
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

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  const isPoliticianPage = /^\/politician\/\d+$/.test(window.location.pathname);
  if (!isPoliticianPage) return;

  loadPoliticianData();

  const form = document.getElementById('add-word-form');
  if (form) {
    form.addEventListener('submit', submitNewWord);
  }
});

// Resize handler for responsiveness
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (currentVoteData && currentPoliticianId) {
      drawBubbleChart(currentVoteData, currentPoliticianId);
    }
  }, 150);
});

// Limit input field length
document.querySelectorAll('input, textarea').forEach(el => {
  el.addEventListener('input', () => {
    if (el.value.length > 30) {
      el.value = el.value.slice(0, 30);
    }
  });
});
