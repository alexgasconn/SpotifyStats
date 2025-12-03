// js/podcasts.js

Chart.register(ChartDataLabels);

// Chart Instances
let topShowsChart = null;
let topEpisodesChart = null;
let podcastTimelineChart = null;
let podcastHourlyChart = null; // NEW

let currentPodcastTimelineUnit = 'week';

// --- HELPERS (Refactored for reusability) ---
const formatMinutesToTime = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
};

const truncateString = (str, len) => {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
};

// --- DATA ANALYSIS ---
export function analyzePodcasts(fullData) {
    console.log('[Podcasts] Total entries received:', fullData.length);

    const rawPodcastData = fullData.filter(d => {
        return d.episodeName && d.episodeShowName; // Simplified check
    });

    if (rawPodcastData.length === 0) {
        return { topShows: [], topEpisodes: [], podcastData: [], hourlyDistribution: [] };
    }

    const podcastData = rawPodcastData.map(d => {
        const tsStr = d.ts || d.endTime || d.timestamp || null;
        const tsDate = tsStr ? new Date(tsStr) : null;
        const isValidDate = tsDate && !isNaN(tsDate.getTime());
        const durationMin = Number(d.msPlayed ?? d.durationMs ?? 0) / 60000;

        return {
            ...d,
            durationMin,
            year: isValidDate ? tsDate.getFullYear() : null,
            month: isValidDate ? tsDate.getMonth() : null,
            hour: isValidDate ? tsDate.getHours() : null, // Captured Hour
            date: isValidDate ? tsDate.toISOString().split('T')[0] : null,
            ts: isValidDate ? tsDate.toISOString() : null
        };
    }).filter(d => d.durationMin > 1 && d.date); // IMPROVEMENT: Filter out < 1 minute listens (noise)

    console.log('[Podcasts] Valid >1min entries:', podcastData.length);

    // Aggregation Maps
    const showMap = {};
    const hourlyMap = new Array(24).fill(0);

    podcastData.forEach(d => {
        const show = d.episodeShowName || 'Unknown Show';
        const minutes = d.durationMin;

        // Populate Show Map
        if (!showMap[show]) {
            showMap[show] = { minutes: 0, episodes: {}, episodeCount: 0 };
        }
        showMap[show].minutes += minutes;

        const ep = d.episodeName || 'Unknown Episode';
        if (!showMap[show].episodes[ep]) {
            showMap[show].episodes[ep] = 0;
            showMap[show].episodeCount++;
        }
        showMap[show].episodes[ep] += minutes;

        // Populate Hourly Map
        if (d.hour !== null) {
            hourlyMap[d.hour] += minutes;
        }
    });

    // Process Top Shows
    const topShows = Object.entries(showMap)
        .map(([name, info]) => ({
            name,
            minutes: info.minutes,
            episodeCount: info.episodeCount,
            episodes: info.episodes
        }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 10);

    // Process Top Episodes
    const allEpisodes = [];
    Object.entries(showMap).forEach(([showName, info]) => {
        Object.entries(info.episodes).forEach(([epName, minutes]) => {
            allEpisodes.push({
                show: showName,
                name: epName,
                minutes
            });
        });
    });
    const topEpisodes = allEpisodes
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 10);

    return { topShows, topEpisodes, podcastData, hourlyDistribution: hourlyMap };
}

// --- COMMON STYLES ---
const whiteTextOptions = {
    color: '#b3b3b3', // Changed to Spotify Light Grey for better contrast
    title: { color: '#fff' },
    ticks: { color: '#b3b3b3' },
    grid: { color: '#282828' } // Darker grid lines
};

// --- CHART RENDERERS ---

export function renderTopShowsChart(topShows) {
    const canvas = document.getElementById('topShowsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (topShowsChart) topShowsChart.destroy();

    const labels = topShows.map(s => `${truncateString(s.name, 25)} (${s.episodeCount} eps)`);

    topShowsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Minutes',
                data: topShows.map(s => Math.round(s.minutes)),
                backgroundColor: 'rgba(30, 215, 96, 0.8)',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => formatMinutesToTime(ctx.raw),
                        title: (ctxItems) => topShows[ctxItems[0].dataIndex].name // Full name on hover
                    }
                }
            },
            scales: {
                x: { ...whiteTextOptions },
                y: { ...whiteTextOptions }
            }
        }
    });
}

export function renderTopEpisodesChart(topEpisodes) {
    const canvas = document.getElementById('topEpisodesChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (topEpisodesChart) topEpisodesChart.destroy();

    const labels = topEpisodes.map(e => truncateString(e.name, 30));

    topEpisodesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Minutes',
                data: topEpisodes.map(e => Math.round(e.minutes)),
                backgroundColor: 'rgba(29, 185, 84, 0.8)',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => formatMinutesToTime(ctx.raw),
                        afterLabel: (ctx) => `Show: ${topEpisodes[ctx.dataIndex].show}`,
                        title: (ctxItems) => topEpisodes[ctxItems[0].dataIndex].name // Full name
                    }
                }
            },
            scales: {
                x: { ...whiteTextOptions },
                y: { ...whiteTextOptions }
            }
        }
    });
}

// --- NEW CHART: HOURLY DISTRIBUTION ---
export function renderPodcastHourlyChart(hourlyData) {
    const canvas = document.getElementById('podcastHourlyChart');
    if (!canvas) return; // Optional: console.warn if you want to be strict

    const ctx = canvas.getContext('2d');
    if (podcastHourlyChart) podcastHourlyChart.destroy();

    podcastHourlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Array.from({length: 24}, (_, i) => i === 0 ? '12am' : i === 12 ? '12pm' : i > 12 ? (i-12)+'pm' : i+'am'),
            datasets: [{
                label: 'Listening Time',
                data: hourlyData.map(m => Math.round(m)),
                backgroundColor: 'rgba(83, 83, 83, 0.8)', // Grey bars
                hoverBackgroundColor: '#1DB954', // Green on hover
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'Listening by Hour of Day', color: '#fff' },
                tooltip: { callbacks: { label: (c) => formatMinutesToTime(c.raw) } }
            },
            scales: {
                x: { ...whiteTextOptions, grid: { display: false } },
                y: { ...whiteTextOptions }
            }
        }
    });
}

// --- TIMELINE RENDERER ---
export function renderPodcastTimeByDay(podcastData) {
    const canvas = document.getElementById('podcastTimelineChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (podcastTimelineChart) podcastTimelineChart.destroy();

    const timeMap = {};
    podcastData.forEach(d => {
        let key;
        switch(currentPodcastTimelineUnit) {
            case 'year': key = d.year ? String(d.year) : null; break;
            case 'month': key = d.year && d.month !== null ? `${d.year}-${String(d.month+1).padStart(2,'0')}` : null; break;
            case 'week': key = getStartOfWeek(new Date(d.date)); break;
            case 'day': default: key = d.date; break;
        }
        if (key) {
            timeMap[key] = (timeMap[key] || 0) + d.durationMin;
        }
    });

    const sortedData = Object.entries(timeMap)
        .sort((a,b) => a[0].localeCompare(b[0]))
        .map(([date, minutes]) => ({ date, minutes: Math.round(minutes) }));

    podcastTimelineChart = new Chart(ctx, {
        type: 'line',
        data: { 
            labels: sortedData.map(d => formatDateLabel(d.date, currentPodcastTimelineUnit)), 
            datasets:[{ 
                data: sortedData.map(d => d.minutes), 
                borderColor: '#1DB954', 
                backgroundColor: 'rgba(29, 185, 84, 0.2)', 
                borderWidth: 2, 
                fill: true, 
                tension: 0.3,
                pointRadius: 0,
                pointHitRadius: 10
            }] 
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: { label: (c) => formatMinutesToTime(c.raw) }
                }
            },
            scales: { 
                y: { ...whiteTextOptions }, 
                x: { ...whiteTextOptions, ticks: { ...whiteTextOptions.ticks, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } } 
            }
        }
    });
}

// --- STATS GRID ---
export function renderPodcastStats(podcastDataArray) {
    const container = document.getElementById('podcastStatsGrid');
    if (!container) return;
    container.innerHTML = '';

    if (!podcastDataArray || podcastDataArray.length === 0) {
        container.innerHTML = '<p class="no-data">No podcast activity found.</p>';
        return;
    }

    const totalMinutes = podcastDataArray.reduce((acc, d) => acc + d.durationMin, 0);
    const uniqueShows = new Set(podcastDataArray.map(d => d.episodeShowName)).size;
    const uniqueEpisodes = new Set(podcastDataArray.map(d => d.episodeName)).size;

    const stats = [
        { title: 'Total Time', value: formatMinutesToTime(totalMinutes) },
        { title: 'Shows', value: uniqueShows },
        { title: 'Episodes', value: uniqueEpisodes }
    ];

    stats.forEach(stat => {
        const div = document.createElement('div');
        div.className = 'stat-card'; // Ensure you have CSS for this
        div.innerHTML = `<h3>${stat.title}</h3><p>${stat.value}</p>`;
        container.appendChild(div);
    });
}

// --- UTILS ---
function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function formatDateLabel(dateStr, unit) {
    const date = new Date(dateStr);
    if(unit === 'year') return dateStr;
    const opts = unit === 'month' ? {year:'numeric', month:'short'} : {month:'short', day:'numeric'};
    return date.toLocaleDateString('en-US', opts);
}

// --- CONTROLS ---
export function setupPodcastTimelineControls(podcastData) {
    const container = document.getElementById('podcastTimelineControls');
    if (!container) return;
    container.innerHTML = '';

    ['day','week','month','year'].forEach(unit => {
        const btn = document.createElement('button');
        btn.textContent = unit.charAt(0).toUpperCase() + unit.slice(1);
        btn.className = `timeline-btn ${unit === currentPodcastTimelineUnit ? 'active' : ''}`;
        btn.onclick = () => {
            currentPodcastTimelineUnit = unit;
            document.querySelectorAll('.timeline-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderPodcastTimeByDay(podcastData);
        };
        container.appendChild(btn);
    });
}

// In podcasts.js
export function renderPodcastUI(dataToRender) {
    // Just analyze and render. Do not look for DOM inputs here.
    const { topShows, topEpisodes, podcastData, hourlyDistribution } = analyzePodcasts(dataToRender);
    
    renderPodcastStats(podcastData);
    renderTopShowsChart(topShows);
    renderTopEpisodesChart(topEpisodes);
    renderPodcastHourlyChart(hourlyDistribution);
    
    // Pass the filtered data to the timeline controls so they work on the current subset
    setupPodcastTimelineControls(podcastData);
    renderPodcastTimeByDay(podcastData);
}