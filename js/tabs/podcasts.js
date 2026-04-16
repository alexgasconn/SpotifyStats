// js/podcasts.js

import { openDetail } from '../detail.js';

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

const escapeAttr = (str) => String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const formatLocalDate = (dateObj) => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const parseLocalDate = (dateStr) => {
    const [year, month, day] = String(dateStr).split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
};

// --- DATA ANALYSIS ---
export function analyzePodcasts(fullData) {
    const rawPodcastData = fullData.filter(d => d.isPodcast || (d.episodeName && d.episodeShowName));

    if (rawPodcastData.length === 0) {
        return {
            topShows: [], topEpisodes: [], podcastData: [], hourlyDistribution: [],
            weekdayDistribution: Array(7).fill(0), repeatEpisodes: [], bingeDays: [],
            summary: null
        };
    }

    const podcastData = rawPodcastData.map(d => {
        const tsDate = d.ts instanceof Date ? d.ts : new Date(d.ts || d.endTime || d.timestamp || null);
        const isValidDate = tsDate && !isNaN(tsDate.getTime());
        const durationMin = Number(d.durationMin ?? (d.msPlayed ?? d.durationMs ?? 0) / 60000);

        return {
            ...d,
            durationMin,
            year: isValidDate ? tsDate.getFullYear() : null,
            month: isValidDate ? tsDate.getMonth() : null,
            hour: isValidDate ? tsDate.getHours() : null,
            weekday: isValidDate ? ((tsDate.getDay() + 6) % 7) : null,
            date: isValidDate ? formatLocalDate(tsDate) : null,
            ts: isValidDate ? tsDate.toISOString() : null
        };
    }).filter(d => d.durationMin > 0.5 && d.date);

    const showMap = {};
    const episodeMap = {};
    const hourlyMap = new Array(24).fill(0);
    const weekdayMap = new Array(7).fill(0);
    const dayMap = {};
    const dateSet = new Set();

    let totalMinutes = 0;
    let skipped = 0;

    podcastData.forEach(d => {
        const show = d.episodeShowName || 'Unknown Show';
        const ep = d.episodeName || 'Unknown Episode';
        const minutes = d.durationMin;
        const wasSkipped = !!d.skipped;

        totalMinutes += minutes;
        if (wasSkipped) skipped += 1;

        dateSet.add(d.date);
        dayMap[d.date] = (dayMap[d.date] || 0) + minutes;
        if (d.hour !== null) hourlyMap[d.hour] += minutes;
        if (d.weekday !== null) weekdayMap[d.weekday] += minutes;

        if (!showMap[show]) {
            showMap[show] = { minutes: 0, plays: 0, skipped: 0, episodes: {} };
        }
        showMap[show].minutes += minutes;
        showMap[show].plays += 1;
        if (wasSkipped) showMap[show].skipped += 1;

        if (!showMap[show].episodes[ep]) {
            showMap[show].episodes[ep] = { minutes: 0, plays: 0 };
        }
        showMap[show].episodes[ep].minutes += minutes;
        showMap[show].episodes[ep].plays += 1;

        const epKey = `${show}|||${ep}`;
        if (!episodeMap[epKey]) {
            episodeMap[epKey] = { show, name: ep, minutes: 0, plays: 0, skipped: 0 };
        }
        episodeMap[epKey].minutes += minutes;
        episodeMap[epKey].plays += 1;
        if (wasSkipped) episodeMap[epKey].skipped += 1;
    });

    const topShows = Object.entries(showMap)
        .map(([name, info]) => ({
            name,
            minutes: info.minutes,
            plays: info.plays,
            episodeCount: Object.keys(info.episodes).length,
            completionRate: +((1 - (info.skipped / (info.plays || 1))) * 100).toFixed(1),
            episodes: info.episodes
        }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 12);

    const topEpisodes = Object.values(episodeMap)
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 12);

    const repeatEpisodes = Object.values(episodeMap)
        .filter(e => e.plays >= 3)
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 10)
        .map(e => ({ ...e, completionRate: +((1 - (e.skipped / e.plays)) * 100).toFixed(1) }));

    const bingeDays = Object.entries(dayMap)
        .map(([date, minutes]) => ({ date, minutes: Math.round(minutes) }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 8);

    const dates = [...dateSet].sort();
    let longestStreak = dates.length ? 1 : 0;
    let currentStreak = dates.length ? 1 : 0;
    for (let i = 1; i < dates.length; i++) {
        const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000;
        if (diff === 1) {
            currentStreak += 1;
            if (currentStreak > longestStreak) longestStreak = currentStreak;
        } else {
            currentStreak = 1;
        }
    }

    const topHourIdx = hourlyMap.indexOf(Math.max(...hourlyMap));
    const topWeekdayIdx = weekdayMap.indexOf(Math.max(...weekdayMap));
    const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const summary = {
        totalMinutes: Math.round(totalMinutes),
        totalPlays: podcastData.length,
        uniqueShows: Object.keys(showMap).length,
        uniqueEpisodes: Object.keys(episodeMap).length,
        avgMinutes: +(totalMinutes / (podcastData.length || 1)).toFixed(1),
        completionRate: +((1 - (skipped / (podcastData.length || 1))) * 100).toFixed(1),
        longestStreak,
        topHour: `${topHourIdx}:00`,
        topWeekday: weekdayNames[topWeekdayIdx],
        topDay: bingeDays[0] || null
    };

    return {
        topShows,
        topEpisodes,
        podcastData,
        hourlyDistribution: hourlyMap,
        weekdayDistribution: weekdayMap,
        repeatEpisodes,
        bingeDays,
        summary
    };
}

// --- COMMON STYLES ---
const whiteTextOptions = {
    color: '#b3b3b3', // Changed to Spotify Light Grey for better contrast
    title: { color: '#fff' },
    ticks: { color: '#b3b3b3' },
    grid: { color: '#282828' } // Darker grid lines
};

// --- CHART RENDERERS ---

export function renderTopShowsChart(topShows, fullData) {
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
            onClick: (_evt, elements) => {
                if (!elements?.length) return;
                const show = topShows[elements[0].index];
                if (show?.name) openDetail(show.name, 'podcast', '', fullData);
            },
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

export function renderTopEpisodesChart(topEpisodes, fullData) {
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
            onClick: (_evt, elements) => {
                if (!elements?.length) return;
                const episode = topEpisodes[elements[0].index];
                if (episode?.show) openDetail(episode.show, 'podcast', '', fullData);
            },
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
            labels: Array.from({ length: 24 }, (_, i) => i === 0 ? '12am' : i === 12 ? '12pm' : i > 12 ? (i - 12) + 'pm' : i + 'am'),
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
        switch (currentPodcastTimelineUnit) {
            case 'year': key = d.year ? String(d.year) : null; break;
            case 'month': key = d.year && d.month !== null ? `${d.year}-${String(d.month + 1).padStart(2, '0')}` : null; break;
            case 'week': key = getStartOfWeek(d.date); break;
            case 'day': default: key = d.date; break;
        }
        if (key) {
            timeMap[key] = (timeMap[key] || 0) + d.durationMin;
        }
    });

    const sortedData = Object.entries(timeMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, minutes]) => ({ date, minutes: Math.round(minutes) }));

    podcastTimelineChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedData.map(d => formatDateLabel(d.date, currentPodcastTimelineUnit)),
            datasets: [{
                data: sortedData.map(d => d.minutes),
                label: 'Listening Time',
                backgroundColor: 'rgba(29, 185, 84, 0.7)',
                borderColor: '#1DB954',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
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

    const analyzed = analyzePodcasts(podcastDataArray || []);
    const summary = analyzed.summary;

    if (!summary) {
        container.innerHTML = '<p class="no-data">No podcast activity found.</p>';
        return;
    }

    const stats = [
        { title: 'Total Time', value: formatMinutesToTime(summary.totalMinutes) },
        { title: 'Podcast Plays', value: summary.totalPlays.toLocaleString() },
        { title: 'Unique Shows', value: summary.uniqueShows },
        { title: 'Unique Episodes', value: summary.uniqueEpisodes },
        { title: 'Avg per Play', value: `${summary.avgMinutes} min` },
        { title: 'Completion Rate', value: `${summary.completionRate}%` },
        { title: 'Longest Streak', value: `${summary.longestStreak} days` },
        { title: 'Prime Moment', value: `${summary.topWeekday} at ${summary.topHour}` }
    ];

    stats.forEach(stat => {
        const div = document.createElement('div');
        div.className = 'stat-item';
        div.innerHTML = `<h3>${stat.title}</h3><p>${stat.value}</p>`;
        container.appendChild(div);
    });
}

function renderPodcastInsights(analyzed) {
    const container = document.getElementById('podcastInsightsGrid');
    if (!container) return;

    if (!analyzed.summary) {
        container.innerHTML = '';
        return;
    }

    const bingeList = analyzed.bingeDays.map((d, i) => `
        <li><span class="wc-rank">${i + 1}</span><span style="flex:1">${d.date}</span><span style="color:var(--green);font-weight:700">${d.minutes} min</span></li>
    `).join('');

    const repeatList = analyzed.repeatEpisodes.map((e, i) => `
        <li data-podcast-show="${escapeAttr(e.show)}"><span class="wc-rank">${i + 1}</span><span style="flex:1">${truncateString(e.name, 42)}<br><small style="color:var(--text-muted)">${truncateString(e.show, 36)}</small></span><span style="color:var(--green);font-weight:700">${e.plays}x</span></li>
    `).join('');

    const completionList = analyzed.topShows.slice(0, 10).map((s, i) => `
        <li data-podcast-show="${escapeAttr(s.name)}"><span class="wc-rank">${i + 1}</span><span style="flex:1">${truncateString(s.name, 42)}</span><span style="color:var(--green);font-weight:700">${s.completionRate}%</span></li>
    `).join('');

    container.innerHTML = `
        <div class="wrapped-card">
            <div class="wc-label">Top Binge Days</div>
            <ul class="wc-list">${bingeList || '<li>No data yet</li>'}</ul>
        </div>
        <div class="wrapped-card">
            <div class="wc-label">Most Replayed Episodes</div>
            <ul class="wc-list wc-clickable-list">${repeatList || '<li>No repeated episodes yet</li>'}</ul>
        </div>
        <div class="wrapped-card">
            <div class="wc-label">Show Completion Ranking</div>
            <ul class="wc-list wc-clickable-list">${completionList || '<li>No data yet</li>'}</ul>
        </div>
    `;

    container.querySelectorAll('[data-podcast-show]').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
            const showName = el.getAttribute('data-podcast-show');
            if (showName) openDetail(showName, 'podcast', '', window.spotifyData.full);
        });
    });
}

// --- UTILS ---
function getStartOfWeek(date) {
    const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
    d.setHours(0, 0, 0, 0);
    const dayFromMonday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dayFromMonday);
    return formatLocalDate(d);
}

function formatDateLabel(dateStr, unit) {
    if (unit === 'year') return dateStr;

    if (unit === 'month') {
        const date = parseLocalDate(`${dateStr}-01`);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    }

    const date = parseLocalDate(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// --- CONTROLS ---
export function setupPodcastTimelineControls(podcastData) {
    const container = document.getElementById('podcastTimelineControls');
    if (!container) return;
    container.innerHTML = '';

    ['day', 'week', 'month', 'year'].forEach(unit => {
        const btn = document.createElement('button');
        btn.textContent = unit.charAt(0).toUpperCase() + unit.slice(1);
        btn.className = `timeline-btn ${unit === currentPodcastTimelineUnit ? 'active' : ''}`;
        btn.onclick = () => {
            currentPodcastTimelineUnit = unit;
            container.querySelectorAll('.timeline-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderPodcastTimeByDay(podcastData);
        };
        container.appendChild(btn);
    });
}

// In podcasts.js
export function renderPodcastUI(dataToRender) {
    // Just analyze and render. Do not look for DOM inputs here.
    const analyzed = analyzePodcasts(dataToRender);
    const { topShows, topEpisodes, podcastData, hourlyDistribution } = analyzed;

    renderPodcastStats(dataToRender);
    renderTopShowsChart(topShows, window.spotifyData.full);
    renderTopEpisodesChart(topEpisodes, window.spotifyData.full);
    renderPodcastHourlyChart(hourlyDistribution);
    renderPodcastInsights(analyzed);

    // Pass the filtered data to the timeline controls so they work on the current subset
    setupPodcastTimelineControls(podcastData);
    renderPodcastTimeByDay(podcastData);
}