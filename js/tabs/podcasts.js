// js/tabs/podcasts.js — Enhanced Podcasts tab

import { openDetail } from '../detail.js';

if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);

// Chart instances
let topShowsChart = null;
let topEpisodesChart = null;
let podcastTimelineChart = null;
let podcastHourlyChart = null;
let podcastWeekdayChart = null;

let currentPodcastTimelineUnit = 'week';

// ── Helpers ──────────────────────────────────
const fmt = n => Number(n).toLocaleString();
const fmtTime = (totalMinutes) => {
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const trunc = (str, len) => (!str ? '' : str.length > len ? str.substring(0, len) + '...' : str);
const esc = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escAttr = (str) => String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtLocalDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parseLocalDate = (s) => { const [y,m,d] = String(s).split('-').map(Number); return new Date(y, (m||1)-1, d||1); };

const chartTextOpts = { color: '#b3b3b3', title: { color: '#fff' }, ticks: { color: '#b3b3b3' }, grid: { color: '#282828' } };

// ── Data Analysis ────────────────────────────
function analyzePodcasts(fullData) {
    const raw = fullData.filter(d => d.isPodcast || (d.episodeName && d.episodeShowName));
    if (!raw.length) return { topShows: [], topEpisodes: [], podcastData: [], hourly: Array(24).fill(0), weekday: Array(7).fill(0), repeatEpisodes: [], bingeDays: [], summary: null, yearlyGrowth: [], showTimeline: [] };

    const podcastData = raw.map(d => {
        const ts = d.ts instanceof Date ? d.ts : new Date(d.ts || d.endTime || null);
        const ok = ts && !isNaN(ts.getTime());
        const dur = Number(d.durationMin ?? (d.msPlayed ?? d.durationMs ?? 0) / 60000);
        return { ...d, durationMin: dur, year: ok ? ts.getFullYear() : null, month: ok ? ts.getMonth() : null, hour: ok ? ts.getHours() : null, weekday: ok ? ((ts.getDay()+6)%7) : null, date: ok ? fmtLocalDate(ts) : null, ts: ok ? ts : null };
    }).filter(d => d.durationMin > 0.5 && d.date);

    const showMap = {}, episodeMap = {}, dayMap = {}, hourly = Array(24).fill(0), weekday = Array(7).fill(0), yearMap = {};
    const dateSet = new Set();
    let totalMin = 0, skipped = 0;

    podcastData.forEach(d => {
        const show = d.episodeShowName || 'Unknown Show';
        const ep = d.episodeName || 'Unknown Episode';
        const min = d.durationMin;
        totalMin += min;
        if (d.skipped) skipped++;
        dateSet.add(d.date);
        dayMap[d.date] = (dayMap[d.date] || 0) + min;
        if (d.hour !== null) hourly[d.hour] += min;
        if (d.weekday !== null) weekday[d.weekday] += min;
        if (d.year) yearMap[d.year] = (yearMap[d.year] || 0) + min;

        if (!showMap[show]) showMap[show] = { minutes: 0, plays: 0, skipped: 0, episodes: new Set(), firstDate: d.date };
        showMap[show].minutes += min; showMap[show].plays++; if (d.skipped) showMap[show].skipped++;
        showMap[show].episodes.add(ep);
        if (d.date < showMap[show].firstDate) showMap[show].firstDate = d.date;

        const epKey = `${show}|||${ep}`;
        if (!episodeMap[epKey]) episodeMap[epKey] = { show, name: ep, minutes: 0, plays: 0, skipped: 0 };
        episodeMap[epKey].minutes += min; episodeMap[epKey].plays++; if (d.skipped) episodeMap[epKey].skipped++;
    });

    const topShows = Object.entries(showMap).map(([name, s]) => ({
        name, minutes: s.minutes, plays: s.plays, episodeCount: s.episodes.size,
        completionRate: +((1 - s.skipped / (s.plays || 1)) * 100).toFixed(1),
        firstDate: s.firstDate
    })).sort((a,b) => b.minutes - a.minutes).slice(0, 15);

    const topEpisodes = Object.values(episodeMap).sort((a,b) => b.minutes - a.minutes).slice(0, 15);
    const repeatEpisodes = Object.values(episodeMap).filter(e => e.plays >= 3).sort((a,b) => b.plays - a.plays).slice(0, 10).map(e => ({ ...e, completionRate: +((1 - e.skipped/e.plays)*100).toFixed(1) }));
    const bingeDays = Object.entries(dayMap).map(([date, min]) => ({ date, minutes: Math.round(min) })).sort((a,b) => b.minutes - a.minutes).slice(0, 10);

    // Streaks
    const dates = [...dateSet].sort();
    let longestStreak = dates.length ? 1 : 0, curStreak = dates.length ? 1 : 0;
    for (let i = 1; i < dates.length; i++) {
        const diff = (new Date(dates[i]) - new Date(dates[i-1])) / 86400000;
        if (diff === 1) { curStreak++; if (curStreak > longestStreak) longestStreak = curStreak; } else curStreak = 1;
    }

    const topHour = hourly.indexOf(Math.max(...hourly));
    const topDayIdx = weekday.indexOf(Math.max(...weekday));
    const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

    const yearlyGrowth = Object.entries(yearMap).sort((a,b) => a[0]-b[0]).map(([y, min]) => ({ year: y, minutes: Math.round(min) }));

    // Show discovery timeline (first dates)
    const showTimeline = Object.entries(showMap).map(([name, s]) => ({ name, firstDate: s.firstDate, minutes: Math.round(s.minutes) })).sort((a,b) => a.firstDate.localeCompare(b.firstDate));

    const summary = {
        totalMinutes: Math.round(totalMin), totalPlays: podcastData.length,
        uniqueShows: Object.keys(showMap).length, uniqueEpisodes: Object.keys(episodeMap).length,
        avgMinutes: +(totalMin / (podcastData.length || 1)).toFixed(1),
        completionRate: +((1 - skipped / (podcastData.length || 1)) * 100).toFixed(1),
        longestStreak, topHour: `${topHour}:00`, topWeekday: dayNames[topDayIdx],
        topDay: bingeDays[0] || null, activeDays: dateSet.size
    };

    return { topShows, topEpisodes, podcastData, hourly, weekday, repeatEpisodes, bingeDays, summary, yearlyGrowth, showTimeline };
}

// ── Main render ──────────────────────────────
export function renderPodcastUI(dataToRender) {
    const container = document.getElementById('podcast-content');
    if (!container) return;

    const a = analyzePodcasts(dataToRender);
    if (!a.summary) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:2rem;text-align:center">No podcast data found. Your Spotify data might not contain podcast activity.</p>';
        return;
    }
    const s = a.summary;

    // Build yearly growth bars
    const maxYear = Math.max(...a.yearlyGrowth.map(y => y.minutes), 1);
    const yearBarsHtml = a.yearlyGrowth.map(y => `
        <div class="discovery-row"><span class="disc-year">${y.year}</span>
        <div class="disc-bar-wrap"><div class="disc-bar" style="width:${Math.round(y.minutes/maxYear*100)}%"></div></div>
        <span class="disc-val">${fmtTime(y.minutes)}</span></div>`).join('');

    // Build binge days
    const bingeHtml = a.bingeDays.map((d,i) => `<li><span class="il-rank">${i+1}</span><span class="il-name">${d.date}</span><span class="il-val">${fmtTime(d.minutes)}</span></li>`).join('');

    // Build repeat episodes
    const repeatHtml = a.repeatEpisodes.map((e,i) => `<li data-podcast-show="${escAttr(e.show)}" style="cursor:pointer">
        <span class="il-rank">${i+1}</span><span class="il-name">${esc(trunc(e.name,40))}<br><small style="color:var(--text-muted)">${esc(trunc(e.show,35))}</small></span>
        <span class="il-val">${e.plays}x</span></li>`).join('');

    // Build top shows list for the text-based card
    const showListHtml = a.topShows.slice(0, 10).map((sh,i) => `<li data-podcast-show="${escAttr(sh.name)}" style="cursor:pointer">
        <span class="il-rank">${i+1}</span><span class="il-name">${esc(trunc(sh.name,40))}<br><small style="color:var(--text-muted)">${sh.episodeCount} episodes · ${sh.completionRate}% completion</small></span>
        <span class="il-val">${fmtTime(sh.minutes)}</span></li>`).join('');

    // Discovery timeline
    const recentDiscoveries = a.showTimeline.slice(-12).reverse();
    const discoverHtml = recentDiscoveries.map((sh,i) => `<li data-podcast-show="${escAttr(sh.name)}" style="cursor:pointer">
        <span class="il-rank">${i+1}</span><span class="il-name">${esc(trunc(sh.name,40))}<br><small style="color:var(--text-muted)">First: ${sh.firstDate}</small></span>
        <span class="il-val">${fmtTime(sh.minutes)}</span></li>`).join('');

    container.innerHTML = `
        <!-- KPI Grid -->
        <div class="podcast-kpi-grid">
            <div class="podcast-kpi"><div class="pk-icon">⏱</div><div class="pk-val">${fmtTime(s.totalMinutes)}</div><div class="pk-label">Total Listening</div></div>
            <div class="podcast-kpi"><div class="pk-icon">▶️</div><div class="pk-val">${fmt(s.totalPlays)}</div><div class="pk-label">Total Plays</div></div>
            <div class="podcast-kpi"><div class="pk-icon">🎙️</div><div class="pk-val">${fmt(s.uniqueShows)}</div><div class="pk-label">Shows</div></div>
            <div class="podcast-kpi"><div class="pk-icon">📋</div><div class="pk-val">${fmt(s.uniqueEpisodes)}</div><div class="pk-label">Episodes</div></div>
            <div class="podcast-kpi"><div class="pk-icon">⏰</div><div class="pk-val">${s.avgMinutes}m</div><div class="pk-label">Avg per Play</div></div>
            <div class="podcast-kpi"><div class="pk-icon">✅</div><div class="pk-val">${s.completionRate}%</div><div class="pk-label">Completion Rate</div></div>
            <div class="podcast-kpi"><div class="pk-icon">🔥</div><div class="pk-val">${s.longestStreak}d</div><div class="pk-label">Listening Streak</div></div>
            <div class="podcast-kpi"><div class="pk-icon">📅</div><div class="pk-val">${fmt(s.activeDays)}</div><div class="pk-label">Active Days</div></div>
        </div>

        <!-- Listening Habits Summary -->
        <div class="podcast-habits">
            <div class="ph-item"><span class="ph-emoji">🕐</span> You prefer listening at <strong>${s.topHour}</strong></div>
            <div class="ph-item"><span class="ph-emoji">📆</span> Your top podcast day is <strong>${s.topWeekday}</strong></div>
            ${s.topDay ? `<div class="ph-item"><span class="ph-emoji">🎉</span> Biggest binge: <strong>${fmtTime(s.topDay.minutes)}</strong> on ${s.topDay.date}</div>` : ''}
        </div>

        <div class="charts-grid">
            <!-- Top Shows Chart -->
            <div class="chart-container full-width">
                <h3>🎙️ Top Podcast Shows <span class="click-hint">click to explore</span></h3>
                <div class="chart-wrapper" style="height:${Math.max(280, a.topShows.length * 32)}px"><canvas id="topShowsChart"></canvas></div>
            </div>

            <!-- Top Episodes Chart -->
            <div class="chart-container full-width">
                <h3>📋 Top Episodes <span class="click-hint">click to explore</span></h3>
                <div class="chart-wrapper" style="height:${Math.max(280, a.topEpisodes.length * 30)}px"><canvas id="topEpisodesChart"></canvas></div>
            </div>

            <!-- Timeline -->
            <div class="chart-container full-width">
                <h3>📈 Podcast Timeline</h3>
                <div id="podcastTimelineControls" class="timeline-controls"></div>
                <div class="chart-wrapper"><canvas id="podcastTimelineChart"></canvas></div>
            </div>

            <!-- Hourly & Weekday side by side -->
            <div class="chart-container">
                <h3>🕐 Listening by Hour</h3>
                <div class="chart-wrapper"><canvas id="podcastHourlyChart"></canvas></div>
            </div>
            <div class="chart-container">
                <h3>📆 Listening by Weekday</h3>
                <div class="chart-wrapper"><canvas id="podcastWeekdayChart"></canvas></div>
            </div>

            <!-- Yearly Growth -->
            <div class="chart-container">
                <h3>📊 Yearly Growth</h3>
                <div class="explorer-discovery-list">${yearBarsHtml || '<p style="color:var(--text-muted)">Not enough data</p>'}</div>
            </div>

            <!-- Show Ranking -->
            <div class="chart-container">
                <h3>🏆 Show Ranking</h3>
                <ul class="insight-list podcast-clickable-list">${showListHtml || '<li>No shows yet</li>'}</ul>
            </div>

            <!-- Binge Days -->
            <div class="chart-container">
                <h3>🎉 Top Binge Days</h3>
                <ul class="insight-list">${bingeHtml || '<li>No binge days</li>'}</ul>
            </div>

            <!-- Repeat Episodes -->
            <div class="chart-container">
                <h3>🔁 Most Replayed Episodes</h3>
                <ul class="insight-list podcast-clickable-list">${repeatHtml || '<li>No repeats yet</li>'}</ul>
            </div>

            <!-- Recent Discoveries -->
            <div class="chart-container">
                <h3>🆕 Recently Discovered Shows</h3>
                <ul class="insight-list podcast-clickable-list">${discoverHtml || '<li>No data</li>'}</ul>
            </div>
        </div>`;

    // Wire click handlers
    container.querySelectorAll('[data-podcast-show]').forEach(el => {
        el.addEventListener('click', () => {
            const show = el.getAttribute('data-podcast-show');
            if (show) openDetail(show, 'podcast', '', window.spotifyData.full);
        });
    });

    // Render charts
    renderTopShowsChart(a.topShows);
    renderTopEpisodesChart(a.topEpisodes);
    renderHourlyChart(a.hourly);
    renderWeekdayChart(a.weekday);
    setupTimelineControls(a.podcastData);
    renderTimeline(a.podcastData);
}

// Re-export analyzePodcasts for other modules
export { analyzePodcasts };

// ── Charts ───────────────────────────────────
function renderTopShowsChart(topShows) {
    const canvas = document.getElementById('topShowsChart');
    if (!canvas) return;
    if (topShowsChart) topShowsChart.destroy();

    topShowsChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: topShows.map(s => trunc(s.name, 25)),
            datasets: [{ label: 'Minutes', data: topShows.map(s => Math.round(s.minutes)), backgroundColor: 'rgba(30, 215, 96, 0.8)', borderRadius: 4 }]
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            onClick: (_e, els) => { if (els?.length) { const sh = topShows[els[0].index]; if (sh?.name) openDetail(sh.name, 'podcast', '', window.spotifyData.full); } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtTime(c.raw), title: cs => topShows[cs[0].dataIndex].name } } },
            scales: { x: { ...chartTextOpts }, y: { ...chartTextOpts } }
        }
    });
}

function renderTopEpisodesChart(topEpisodes) {
    const canvas = document.getElementById('topEpisodesChart');
    if (!canvas) return;
    if (topEpisodesChart) topEpisodesChart.destroy();

    topEpisodesChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: topEpisodes.map(e => trunc(e.name, 30)),
            datasets: [{ label: 'Minutes', data: topEpisodes.map(e => Math.round(e.minutes)), backgroundColor: 'rgba(29, 185, 84, 0.7)', borderRadius: 4 }]
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            onClick: (_e, els) => { if (els?.length) { const ep = topEpisodes[els[0].index]; if (ep?.show) openDetail(ep.show, 'podcast', '', window.spotifyData.full); } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtTime(c.raw), afterLabel: c => `Show: ${topEpisodes[c.dataIndex].show}`, title: cs => topEpisodes[cs[0].dataIndex].name } } },
            scales: { x: { ...chartTextOpts }, y: { ...chartTextOpts } }
        }
    });
}

function renderHourlyChart(hourlyData) {
    const canvas = document.getElementById('podcastHourlyChart');
    if (!canvas) return;
    if (podcastHourlyChart) podcastHourlyChart.destroy();

    const labels = Array.from({length:24}, (_,i) => i===0?'12am':i===12?'12pm':i>12?(i-12)+'pm':i+'am');
    podcastHourlyChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Minutes', data: hourlyData.map(m => Math.round(m)), backgroundColor: 'rgba(83,83,83,0.8)', hoverBackgroundColor: '#1DB954', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtTime(c.raw) } } }, scales: { x: { ...chartTextOpts, grid: { display: false } }, y: { ...chartTextOpts } } }
    });
}

function renderWeekdayChart(weekdayData) {
    const canvas = document.getElementById('podcastWeekdayChart');
    if (!canvas) return;
    if (podcastWeekdayChart) podcastWeekdayChart.destroy();

    const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const colors = weekdayData.map((v, i) => {
        const max = Math.max(...weekdayData);
        const ratio = v / (max || 1);
        return `rgba(29, 185, 84, ${0.3 + ratio * 0.6})`;
    });

    podcastWeekdayChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Minutes', data: weekdayData.map(m => Math.round(m)), backgroundColor: colors, borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtTime(c.raw) } } }, scales: { x: { ...chartTextOpts, grid: { display: false } }, y: { ...chartTextOpts } } }
    });
}

function renderTimeline(podcastData) {
    const canvas = document.getElementById('podcastTimelineChart');
    if (!canvas) return;
    if (podcastTimelineChart) podcastTimelineChart.destroy();

    const timeMap = {};
    podcastData.forEach(d => {
        let key;
        switch (currentPodcastTimelineUnit) {
            case 'year': key = d.year ? String(d.year) : null; break;
            case 'month': key = d.year && d.month !== null ? `${d.year}-${String(d.month+1).padStart(2,'0')}` : null; break;
            case 'week': key = getWeekStart(d.date); break;
            default: key = d.date;
        }
        if (key) timeMap[key] = (timeMap[key] || 0) + d.durationMin;
    });

    const sorted = Object.entries(timeMap).sort((a,b) => a[0].localeCompare(b[0])).map(([d, m]) => ({ date: d, minutes: Math.round(m) }));

    podcastTimelineChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels: sorted.map(d => fmtLabel(d.date, currentPodcastTimelineUnit)), datasets: [{ data: sorted.map(d => d.minutes), label: 'Minutes', backgroundColor: 'rgba(29, 185, 84, 0.7)', borderColor: '#1DB954', borderWidth: 1, borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtTime(c.raw) } } }, scales: { y: { ...chartTextOpts }, x: { ...chartTextOpts, ticks: { ...chartTextOpts.ticks, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } } } }
    });
}

function setupTimelineControls(podcastData) {
    const container = document.getElementById('podcastTimelineControls');
    if (!container) return;
    container.innerHTML = '';
    ['day','week','month','year'].forEach(unit => {
        const btn = document.createElement('button');
        btn.textContent = unit.charAt(0).toUpperCase() + unit.slice(1);
        btn.className = `timeline-btn ${unit === currentPodcastTimelineUnit ? 'active' : ''}`;
        btn.onclick = () => { currentPodcastTimelineUnit = unit; container.querySelectorAll('.timeline-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); renderTimeline(podcastData); };
        container.appendChild(btn);
    });
}

function getWeekStart(date) {
    const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - ((d.getDay()+6)%7));
    return fmtLocalDate(d);
}

function fmtLabel(dateStr, unit) {
    if (unit === 'year') return dateStr;
    if (unit === 'month') return parseLocalDate(`${dateStr}-01`).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    return parseLocalDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
