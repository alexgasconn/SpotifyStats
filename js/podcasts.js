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

    // Mostrar las primeras 10 entradas completas
    console.log('[Podcasts] First 10 entries:', fullData.slice(0, 10));
    
    // Buscar entradas que podrían ser podcasts
    const samplesWithPodcastKeys = fullData.slice(0, 1000).filter(d => {
        const keys = Object.keys(d);
        const podcastRelatedKeys = keys.filter(k => 
            k.toLowerCase().includes('episode') || 
            k.toLowerCase().includes('show') ||
            k.toLowerCase().includes('podcast')
        );
        return podcastRelatedKeys.length > 0;
    });
    
    console.log('[Podcasts] Samples with podcast-related keys:', samplesWithPodcastKeys.slice(0, 5));
    
    // Mostrar todas las keys únicas en los primeros 100 elementos
    const allKeys = new Set();
    fullData.slice(0, 100).forEach(d => {
        Object.keys(d).forEach(k => allKeys.add(k));
    });
    console.log('[Podcasts] All unique keys found in first 100 entries:', Array.from(allKeys).sort());
    
    // Buscar alguna entrada que no sea null en campos de episodio
    const episodeTests = fullData.slice(0, 1000).map((d, idx) => ({
        index: idx,
        hasEpisodeName: d.episodeName !== null && d.episodeName !== undefined,
        hasEpisodeShowName: d.episodeShowName !== null && d.episodeShowName !== undefined,
        episodeName: d.episodeName,
        episodeShowName: d.episodeShowName,
        // Probar otras posibles variaciones
        episode_name: d.episode_name,
        episode_show_name: d.episode_show_name,
        keys: Object.keys(d).filter(k => k.includes('episode') || k.includes('show'))
    })).filter(t => t.hasEpisodeName || t.hasEpisodeShowName || t.episode_name || t.episode_show_name);
    
    console.log('[Podcasts] Episode field tests (first 10 with any episode data):', episodeTests.slice(0, 10));

    // Filtrar solo los podcasts
    const podcastData = fullData.filter(d => {
        return d.episodeName != null && 
               d.episodeName !== '' && 
               d.episodeShowName != null && 
               d.episodeShowName !== '';
    });

    console.log('[Podcasts] Entries identified as podcasts:', podcastData.length);
    
    if (podcastData.length > 0) {
        console.log('[Podcasts] First podcast found:', podcastData[0]);
    }

    if (podcastData.length === 0)
        return { topShows: [], topEpisodes: [], podcastData: [] };

    // --- Agrupar por show ---
    const showMap = {};
    podcastData.forEach(d => {
        const show = d.episodeShowName || 'Unknown Show';
        const minutes = Number(d.msPlayed ?? 0) / 60000;
        
        if (!showMap[show]) {
            showMap[show] = { minutes: 0, episodes: {} };
        }
        showMap[show].minutes += minutes;

        const ep = d.episodeName || 'Unknown Episode';
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
