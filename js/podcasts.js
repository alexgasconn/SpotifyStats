// js/podcasts.js

// --- FUNCIONES DE CHARTS ---
function createOrUpdateChart(canvasId, config) {
    if (window.chartsMap === undefined) window.chartsMap = {};
    const existingChart = window.chartsMap[canvasId];
    if (existingChart) existingChart.destroy();
    const ctx = document.getElementById(canvasId).getContext('2d');
    const chart = new Chart(ctx, config);
    window.chartsMap[canvasId] = chart;
    return chart;
}

const chartColors = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ab'];

// --- ANALISIS DE PODCASTS ---
export function analyzePodcasts(fullData) {
    console.log('[Podcasts] Total entries received:', fullData.length);

    const podcastData = fullData.filter(d => d.episode_name !== null && d.episode_show_name !== null);
    console.log('[Podcasts] Entries identified as podcasts:', podcastData.length);

    if (podcastData.length === 0) return null;

    const showMap = {};
    podcastData.forEach(d => {
        const show = d.episode_show_name || 'Unknown Show';
        if (!showMap[show]) showMap[show] = { minutes: 0, episodes: {} };
        showMap[show].minutes += d.ms_played / 60000;
        const ep = d.episode_name || 'Unknown Episode';
        if (!showMap[show].episodes[ep]) showMap[show].episodes[ep] = 0;
        showMap[show].episodes[ep] += d.ms_played / 60000;
    });

    const topShows = Object.entries(showMap)
        .map(([name, info]) => ({ name, minutes: info.minutes, episodes: info.episodes }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 10);

    console.log('[Podcasts] Top Shows:', topShows.map(s => ({ name: s.name, minutes: s.minutes })));

    let allEpisodes = [];
    topShows.forEach(show => {
        Object.entries(show.episodes).forEach(([epName, minutes]) => {
            allEpisodes.push({ show: show.name, name: epName, minutes });
        });
    });

    const topEpisodes = allEpisodes.sort((a, b) => b.minutes - a.minutes).slice(0, 10);
    console.log('[Podcasts] Top Episodes:', topEpisodes.map(e => ({ name: e.name, minutes: e.minutes })));

    return { topShows, topEpisodes, podcastData };
}


// --- GRAFICOS ---
export function renderTopShowsChart(topShows) {
    createOrUpdateChart('podcast-shows-chart', {
        type: 'bar',
        data: {
            labels: topShows.map(s => s.name),
            datasets: [{
                label: 'Minutes Listened',
                data: topShows.map(s => s.minutes),
                backgroundColor: chartColors
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { ticks: { color: '#b3b3b3' }, grid: { color: '#282828' } },
                x: { ticks: { color: '#b3b3b3' }, grid: { display: false } }
            }
        }
    });
}

export function renderTopEpisodesChart(topEpisodes) {
    createOrUpdateChart('podcast-episodes-chart', {
        type: 'bar',
        data: {
            labels: topEpisodes.map(e => e.name),
            datasets: [{
                label: 'Minutes Listened',
                data: topEpisodes.map(e => e.minutes),
                backgroundColor: chartColors
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#b3b3b3' }, grid: { color: '#282828' } },
                y: { ticks: { color: '#b3b3b3' }, grid: { display: false } }
            }
        }
    });
}

export function renderPodcastTimeByDay(podcastData) {
    console.log('[Podcasts] Rendering daily timeline. Entries:', podcastData.length);

    const dailyMap = {};
    podcastData.forEach(d => {
        if (!d.ts) {
            console.warn('[Podcasts] Missing ts field:', d);
            return;
        }

        const tsString = typeof d.ts === 'string' ? d.ts : new Date(d.ts).toISOString();
        const day = tsString.split('T')[0];

        dailyMap[day] = (dailyMap[day] || 0) + d.ms_played / 60000;
    });

    const labels = Object.keys(dailyMap).sort();
    const data = labels.map(l => dailyMap[l]);

    console.log('[Podcasts] Daily timeline labels:', labels);
    console.log('[Podcasts] Daily timeline data:', data);

    createOrUpdateChart('podcast-daily-chart', {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Minutes Listened',
                data,
                borderColor: '#E83E8C',
                backgroundColor: 'rgba(232, 62, 140, 0.2)',
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { ticks: { color: '#b3b3b3' }, grid: { color: '#282828' } },
                x: { ticks: { color: '#b3b3b3' }, grid: { display: false } }
            }
        }
    });
}

