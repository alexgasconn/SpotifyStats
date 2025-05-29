let allData = [];
let charts = {};
let correct = 0;
let incorrect = 0;

function parseSpotifyJson(jsonData) {
  return jsonData.map(entry => {
    return {
      ts: new Date(entry.ts),
      ms_played: entry.ms_played || 0,
      minutes: (entry.ms_played || 0) / 60000,
      artist: entry.master_metadata_album_artist_name || "Unknown",
      album: entry.master_metadata_album_album_name || "Unknown",
      track: entry.master_metadata_track_name || "Unknown"
    };
  });
}

function groupBy(data, keyFn) {
  return data.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function sumMinutes(grouped) {
  const result = {};
  for (const key in grouped) {
    result[key] = grouped[key].reduce((sum, e) => sum + e.minutes, 0);
  }
  return result;
}

function drawBarChart(id, labels, data, label) {
  const ctx = document.getElementById(id).getContext('2d');
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: label,
        data,
        backgroundColor: 'rgba(75, 192, 192, 0.5)'
      }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true } }
    }
  });
}

function drawLineChart(id, labels, data, label) {
  const ctx = document.getElementById(id).getContext('2d');
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{ label, data, fill: false, borderColor: 'blue' }]
    },
    options: { responsive: true }
  });
}

function drawHistogram(id, values, label, bins = 24) {
  const counts = new Array(bins).fill(0);
  values.forEach(v => {
    let idx = Math.floor((v / Math.max(...values)) * bins);
    if (idx >= bins) idx = bins - 1;
    counts[idx]++;
  });
  drawBarChart(id, counts.map((_, i) => `${i}`), counts, label);
}

function generateTopStats(data) {
  const byTrack = sumMinutes(groupBy(data, d => d.track));
  const byArtist = sumMinutes(groupBy(data, d => d.artist));
  const byAlbum = sumMinutes(groupBy(data, d => d.album));

  drawBarChart("topTracksChart", Object.keys(byTrack).slice(0, 10), Object.values(byTrack).slice(0, 10), "Minutes per Track");
  drawBarChart("topArtistsChart", Object.keys(byArtist).slice(0, 10), Object.values(byArtist).slice(0, 10), "Minutes per Artist");
  drawBarChart("topAlbumsChart", Object.keys(byAlbum).slice(0, 10), Object.values(byAlbum).slice(0, 10), "Minutes per Album");
}

function generateTemporal(data) {
  const monthly = groupBy(data, d => `${d.ts.getFullYear()}-${String(d.ts.getMonth()+1).padStart(2,'0')}`);
  const weekly = groupBy(data, d => {
    const dts = new Date(d.ts);
    dts.setDate(dts.getDate() - dts.getDay());
    return dts.toISOString().split('T')[0];
  });

  drawLineChart("monthlyChart", Object.keys(monthly), Object.values(monthly).map(d => d.reduce((s,e) => s+e.minutes,0)), "Monthly Listening");
  drawLineChart("weeklyChart", Object.keys(weekly), Object.values(weekly).map(d => d.reduce((s,e) => s+e.minutes,0)), "Weekly Listening");
}

function generateDistributions(data) {
  drawHistogram("hourDist", data.map(d => d.ts.getHours()), "Hour of Day");
  drawHistogram("weekdayDist", data.map(d => d.ts.getDay()), "Day of Week", 7);
  drawHistogram("monthDist", data.map(d => d.ts.getMonth()+1), "Month", 12);
  drawHistogram("yearDist", data.map(d => d.ts.getFullYear()), "Year", 5);
  drawHistogram("durationDist", data.map(d => d.minutes), "Session Duration");
}

function updateSummary(data) {
  const totalMin = data.reduce((s, d) => s + d.minutes, 0);
  const totalHours = (totalMin / 60).toFixed(2);
  const uniqueTracks = new Set(data.map(d => d.track)).size;
  const first = new Date(Math.min(...data.map(d => d.ts)));
  const last = new Date(Math.max(...data.map(d => d.ts)));
  document.getElementById("globalStats").innerHTML = `
    <p><strong>Total minutes:</strong> ${Math.round(totalMin)}</p>
    <p><strong>Total hours:</strong> ${totalHours}</p>
    <p><strong>Unique tracks:</strong> ${uniqueTracks}</p>
    <p><strong>First date:</strong> ${first.toDateString()}</p>
    <p><strong>Last date:</strong> ${last.toDateString()}</p>
  `;
}

function setupGame(data) {
  const byArtist = Object.entries(sumMinutes(groupBy(data, d => d.artist))).sort((a, b) => b[1] - a[1]);
  const gameQuestion = document.getElementById("gameQuestion");
  const btn1 = document.getElementById("option1");
  const btn2 = document.getElementById("option2");
  const feedback = document.getElementById("gameFeedback");
  const score = document.getElementById("score");

  function next() {
    const [a, b] = [byArtist[Math.floor(Math.random()*20)], byArtist[Math.floor(Math.random()*20)]];
    if (a[0] === b[0]) return next();
    gameQuestion.textContent = "Which artist did you listen to more?";
    btn1.textContent = a[0];
    btn2.textContent = b[0];
    btn1.onclick = () => {
      if (a[1] >= b[1]) { correct++; feedback.textContent = "✅ Correct!"; } 
      else { incorrect++; feedback.textContent = "❌ Wrong!"; }
      score.textContent = `Score: ${correct} correct / ${incorrect} wrong`;
      nextBtn.style.display = "inline";
    };
    btn2.onclick = () => {
      if (b[1] >= a[1]) { correct++; feedback.textContent = "✅ Correct!"; } 
      else { incorrect++; feedback.textContent = "❌ Wrong!"; }
      score.textContent = `Score: ${correct} correct / ${incorrect} wrong`;
      nextBtn.style.display = "inline";
    };
  }

  const nextBtn = document.getElementById("nextRound");
  nextBtn.onclick = () => {
    feedback.textContent = "";
    nextBtn.style.display = "none";
    next();
  };
  next();
}

// ZIP LOADER
window.onload = function () {
  document.getElementById("zipFileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById("loading").textContent = "Processing...";
    const zip = await JSZip.loadAsync(file);
    const files = Object.keys(zip.files).filter(f => f.endsWith(".json"));
    allData = [];

    for (const name of files) {
      const text = await zip.files[name].async("string");
      const parsed = JSON.parse(text);
      allData.push(...parseSpotifyJson(parsed));
    }

    document.getElementById("loading").style.display = "none";
    document.getElementById("dashboard").style.display = "block";

    generateTopStats(allData);
    generateTemporal(allData);
    generateDistributions(allData);
    updateSummary(allData);
    setupGame(allData);
  });
};
