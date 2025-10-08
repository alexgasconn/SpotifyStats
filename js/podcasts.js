// js/podcasts.js

let topShowsChart = null;
let topEpisodesChart = null;
let podcastTimelineChart = null;

export function analyzePodcasts(fullData) {
    console.log('[Podcasts] Total entries received:', fullData.length);

    const rawPodcastData = fullData.filter(d => {
        return d.episodeName != null &&
               d.episodeName !== '' &&
               d.episodeShowName != null &&
               d.episodeShowName !== '';
    });

    console.log('[Podcasts] Entries identified as podcasts:', rawPodcastData.length);

    if (rawPodcastData.length === 0) {
        return { topShows: [], topEpisodes: [], podcastData: [] };
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
            date: isValidDate ? tsDate.toISOString().split('T')[0] : null,
            ts: isValidDate ? tsDate.toISOString() : null
        };
    }).filter(d => d.durationMin > 0 && d.date);

    const showMap = {};
    podcastData.forEach(d => {
        const show = d.episodeShowName || 'Unknown Show';
        const minutes = d.durationMin;

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
    });

    const topShows = Object.entries(showMap)
        .map(([name, info]) => ({
            name,
            minutes: info.minutes,
            episodeCount: info.episodeCount,
            episodes: info.episodes
        }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 10);

    console.log('[Podcasts] Top Shows:', topShows);

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

    console.log('[Podcasts] Top Episodes:', topEpisodes);

    return { topShows, topEpisodes, podcastData };
}

// --- Opciones comunes para texto blanco ---
const whiteTextOptions = {
    color: '#fff',
    title: { color: '#fff' },
    ticks: { color: '#fff' },
    grid: { color: 'rgba(255,255,255,0.2)' }
};

export function renderTopShowsChart(topShows) {
    const canvas = document.getElementById('topShowsChart');
    if (!canvas) return console.error('[Podcasts] Canvas element "topShowsChart" not found');

    const ctx = canvas.getContext('2d');
    if (topShowsChart) topShowsChart.destroy();

    if (topShows.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '16px Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('No podcast data available', canvas.width / 2, canvas.height / 2);
        return;
    }

    const labels = topShows.map(s => {
        const name = s.name.length > 30 ? s.name.substring(0, 30) + '...' : s.name;
        return `${name} (${s.episodeCount} eps)`;
    });

    topShowsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Minutes Listened',
                data: topShows.map(s => Math.round(s.minutes)),
                backgroundColor: 'rgba(30, 215, 96, 0.8)',
                borderColor: 'rgba(30, 215, 96, 1)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false, labels: { color: '#fff' } },
                tooltip: {
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        label: function(context) {
                            const show = topShows[context.dataIndex];
                            const hours = Math.floor(show.minutes / 60);
                            const mins = Math.round(show.minutes % 60);
                            return [`Time: ${hours}h ${mins}m`, `Episodes: ${show.episodeCount}`];
                        }
                    }
                }
            },
            scales: {
                x: { ...whiteTextOptions, title: { ...whiteTextOptions.title, text: 'Minutes' } },
                y: { ...whiteTextOptions }
            }
        }
    });
}

export function renderTopEpisodesChart(topEpisodes) {
    const canvas = document.getElementById('topEpisodesChart');
    if (!canvas) return console.error('[Podcasts] Canvas element "topEpisodesChart" not found');

    const ctx = canvas.getContext('2d');
    if (topEpisodesChart) topEpisodesChart.destroy();

    if (topEpisodes.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '16px Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('No episode data available', canvas.width / 2, canvas.height / 2);
        return;
    }

    const labels = topEpisodes.map(e => {
        const epName = e.name.length > 40 ? e.name.substring(0, 40) + '...' : e.name;
        const showName = e.show.length > 20 ? e.show.substring(0, 20) + '...' : e.show;
        return `${epName} (${showName})`;
    });

    topEpisodesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Minutes Listened',
                data: topEpisodes.map(e => Math.round(e.minutes)),
                backgroundColor: 'rgba(29, 185, 84, 0.8)',
                borderColor: 'rgba(29, 185, 84, 1)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false, labels: { color: '#fff' } },
                tooltip: {
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        label: function(context) {
                            const episode = topEpisodes[context.dataIndex];
                            const hours = Math.floor(episode.minutes / 60);
                            const mins = Math.round(episode.minutes % 60);
                            return [`Time: ${hours}h ${mins}m`, `Show: ${episode.show}`];
                        }
                    }
                }
            },
            scales: {
                x: { ...whiteTextOptions, title: { ...whiteTextOptions.title, text: 'Minutes' } },
                y: { ...whiteTextOptions }
            }
        }
    });
}

export function renderPodcastTimeByDay(podcastData, aggregation = 'day') {
    const canvas = document.getElementById('podcastTimelineChart');
    if (!canvas) return console.error('[Podcasts] Canvas element "podcastTimelineChart" not found');

    const ctx = canvas.getContext('2d');
    if (podcastTimelineChart) podcastTimelineChart.destroy();

    if (podcastData.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '16px Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('No timeline data available', canvas.width / 2, canvas.height / 2);
        return;
    }

    const timeMap = {};
    podcastData.forEach(d => {
        if (!d.date) return;
        let key;

        switch (aggregation) {
            case 'year':
                key = d.year != null ? String(d.year) : null;
                break;
            case 'month':
                if (d.year != null && d.month != null) {
                    key = `${d.year}-${String(d.month + 1).padStart(2, '0')}`;
                }
                break;
            case 'week':
                key = getStartOfWeek(new Date(d.date));
                break;
            case 'day':
            default:
                key = d.date;
                break;
        }

        if (!key) return;
        if (!timeMap[key]) timeMap[key] = 0;
        timeMap[key] += d.durationMin;
    });

    const sortedData = Object.entries(timeMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, minutes]) => ({ date, minutes: Math.round(minutes) }));

    const labels = sortedData.map(d => formatDateLabel(d.date, aggregation));
    const data = sortedData.map(d => d.minutes);

    podcastTimelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Minutes',
                data,
                borderColor: 'rgba(30, 215, 96, 1)',
                backgroundColor: 'rgba(30, 215, 96, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false, labels: { color: '#fff' } },
                title: {
                    display: true,
                    text: `Podcast Listening Over Time (${aggregation})`,
                    font: { size: 16, weight: 'bold' },
                    color: '#fff'
                },
                tooltip: {
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        label: function(context) {
                            const val = context.parsed.y ?? 0;
                            const hours = Math.floor(val / 60);
                            const mins = Math.round(val % 60);
                            return `${hours}h ${mins}m`;
                        }
                    }
                }
            },
            scales: {
                y: { ...whiteTextOptions, title: { ...whiteTextOptions.title, text: 'Minutes' } },
                x: { ...whiteTextOptions, ticks: { ...whiteTextOptions.ticks, maxRotation: 45, minRotation: 45 } }
            }
        }
    });
}

function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function formatDateLabel(dateStr, aggregation) {
    const date = new Date(dateStr);
    switch (aggregation) {
        case 'year': return dateStr;
        case 'month': return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        case 'week': return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        case 'day':
        default: return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

export function setupPodcastTimelineControls(podcastData) {
    const controls = ['day', 'week', 'month', 'year'];
    const container = document.getElementById('podcastTimelineControls');
    if (!container) return console.error('[Podcasts] Timeline controls container not found');

    container.innerHTML = '';
    controls.forEach(ctrl => {
        const button = document.createElement('button');
        button.textContent = ctrl.charAt(0).toUpperCase() + ctrl.slice(1);
        button.className = 'timeline-btn';
        if (ctrl === 'day') button.classList.add('active');

        button.addEventListener('click', () => {
            container.querySelectorAll('.timeline-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            renderPodcastTimeByDay(podcastData, ctrl);
        });
        container.appendChild(button);
    });
}
