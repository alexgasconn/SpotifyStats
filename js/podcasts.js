// js/podcasts.js
import { createOrUpdateChart, chartColors } from './charts.js';

export function analyzePodcasts(fullData) {
    // Filtrar solo podcasts
    const podcastData = fullData.filter(d => d.episode_name);

    if (podcastData.length === 0) return null;

    // Agregar datos por show
    const showMap = {};
    podcastData.forEach(d => {
        const show = d.episode_show_name || 'Unknown Show';
        if (!showMap[show]) showMap[show] = { minutes: 0, episodes: {} };
        showMap[show].minutes += d.ms_played / 60000; // ms → min
        const ep = d.episode_name || 'Unknown Episode';
        if (!showMap[show].episodes[ep]) showMap[show].episodes[ep] = 0;
        showMap[show].episodes[ep] += d.ms_played / 60000;
    });

    // Top shows
    const topShows = Object.entries(showMap)
        .map(([name, info]) => ({ name, minutes: info.minutes, episodes: info.episodes }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 10);

    // Top episodes
    let allEpisodes = [];
    topShows.forEach(show => {
        Object.entries(show.episodes).forEach(([epName, minutes]) => {
            allEpisodes.push({ show: show.name, name: epName, minutes });
        });
    });
    const topEpisodes = allEpisodes.sort((a, b) => b.minutes - a.minutes).slice(0, 10);

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
            indexAxis: 'y', // horizontal bar
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
    const dailyMap = {};
    podcastData.forEach(d => {
        const day = d.ts.split('T')[0];
        dailyMap[day] = (dailyMap[day] || 0) + d.ms_played / 60000;
    });

    const labels = Object.keys(dailyMap).sort();
    const data = labels.map(l => dailyMap[l]);

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
