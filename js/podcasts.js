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

const chartColors = [
    '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
    '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ab'
];

// --- ANALISIS DE PODCASTS ---
export function analyzePodcasts(fullData) {
    console.log('[Podcasts] Total entries received:', fullData.length);
    
    // Debug: ver cómo se ven los primeros elementos
    console.log('[Podcasts] First entry sample:', fullData[0]);
    console.log('[Podcasts] First entry type:', typeof fullData[0]);
    
    // Parsear si es necesario
    const parsedData = fullData.map(d => {
        if (typeof d === 'string') {
            try {
                return JSON.parse(d);
            } catch (e) {
                console.error('[Podcasts] Error parsing entry:', e);
                return null;
            }
        }
        return d;
    }).filter(d => d !== null);

    console.log('[Podcasts] After parsing, sample entry:', parsedData[0]);
    console.log('[Podcasts] Sample entry keys:', parsedData[0] ? Object.keys(parsedData[0]) : 'no data');
    
    // Buscar podcasts - verificar diferentes posibles formatos de key
    const podcastData = parsedData.filter(d => {
        const hasEpisodeName = d.episode_name !== null && d.episode_name !== undefined && d.episode_name !== '';
        const hasShowName = d.episode_show_name !== null && d.episode_show_name !== undefined && d.episode_show_name !== '';
        
        // Debug: loguear algunos casos
        if (hasEpisodeName || hasShowName) {
            console.log('[Podcasts] Found potential podcast:', {
                episode_name: d.episode_name,
                episode_show_name: d.episode_show_name,
                hasEpisodeName,
                hasShowName
            });
        }
        
        return hasEpisodeName && hasShowName;
    });

    console.log('[Podcasts] Entries identified as podcasts:', podcastData.length);

    if (podcastData.length === 0)
        return { topShows: [], topEpisodes: [], podcastData: [] };

    // --- Agrupar por show ---
    const showMap = {};
    podcastData.forEach(d => {
        const show = d.episode_show_name || 'Unknown Show';
        const minutes = Number(d.ms_played ?? 0) / 60000;
        
        if (!showMap[show]) {
            showMap[show] = { minutes: 0, episodes: {} };
        }
        showMap[show].minutes += minutes;

        const ep = d.episode_name || 'Unknown Episode';
        if (!showMap[show].episodes[ep]) {
            showMap[show].episodes[ep] = 0;
        }
        showMap[show].episodes[ep] += minutes;
    });

    // --- Top Shows ---
    const topShows = Object.entries(showMap)
        .map(([name, info]) => ({ 
            name, 
            minutes: info.minutes, 
            episodes: info.episodes 
        }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 10);

    console.log('[Podcasts] Top Shows:', topShows);

    // --- Top Episodes ---
    let allEpisodes = [];
    topShows.forEach(show => {
        Object.entries(show.episodes).forEach(([epName, minutes]) => {
            allEpisodes.push({ 
                show: show.name, 
                name: epName, 
                minutes 
            });
        });
    });
    const topEpisodes = allEpisodes
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 10);

    console.log('[Podcasts] Top Episodes:', topEpisodes);

    return { topShows, topEpisodes, podcastData };
}



// --- GRAFICOS ---
export function renderTopShowsChart(topShows) {
    console.log('[Podcasts] Rendering Top Shows Chart with', topShows.length, 'entries');
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
    console.log('[Podcasts] Rendering Top Episodes Chart with', topEpisodes.length, 'entries');
    createOrUpdateChart('podcast-episodes-chart', {
        type: 'bar',
        indexAxis: 'y',
        data: {
            labels: topEpisodes.map(e => e.name),
            datasets: [{
                label: 'Minutes Listened',
                data: topEpisodes.map(e => e.minutes),
                backgroundColor: chartColors
            }]
        },
        options: {
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
        // Comprobar que ts sea string válido
        if (d.ts && typeof d.ts === 'string') {
            const day = d.ts.split('T')[0];
            dailyMap[day] = (dailyMap[day] || 0) + (d.ms_played ? d.ms_played / 60000 : 0);
        }
    });

    const labels = Object.keys(dailyMap).sort();
    const data = labels.map(l => dailyMap[l]);

    console.log('[Podcasts] Daily timeline labels:', labels.length > 10 ? labels.slice(0, 10) : labels);
    console.log('[Podcasts] Daily timeline data (first 10):', data.slice(0, 10));

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
