// js/detail.js — Detail modal for tracks, artists, albums

import * as store from './store.js';
import { forecastPlaySeries } from './forecast.js';
import { forecastPlaysChartConfig } from './charts.js';

let detailChartInstances = {};
let detailForecastWorker = null;
let detailForecastSource = null;
let detailForecastRequest = 0;
let detailForecastContext = null;

function createDetailChart(canvasId, config) {
    if (detailChartInstances[canvasId]) detailChartInstances[canvasId].destroy();
    const ctx = document.getElementById(canvasId);
    if (ctx) detailChartInstances[canvasId] = new Chart(ctx, config);
}

export function openDetail(name, type, extra, fullData) {
    let stats;
    if (type === 'track') {
        stats = store.calculateTrackDetail(name, extra, fullData);
    } else if (type === 'artist') {
        stats = store.calculateArtistDetail(name, fullData);
    } else if (type === 'album') {
        stats = store.calculateAlbumDetail(name, extra, fullData);
    } else if (type === 'podcast') {
        stats = store.calculatePodcastDetail(name, fullData);
    }
    if (!stats) return;

    const modal = document.getElementById('detail-modal');
    const body = document.getElementById('detail-modal-body');
    detailForecastRequest++;
    detailForecastContext = null;
    for (const id of ['detail-forecast-cumulative', 'detail-forecast-monthly']) {
        detailChartInstances[id]?.destroy();
        delete detailChartInstances[id];
    }
    body.innerHTML = buildDetailHTML(stats);
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setupDetailForecast(stats, fullData);

    // Render charts after DOM update
    requestAnimationFrame(() => {
        renderDetailCharts(stats);
        setupDetailListClicks(fullData);
    });
}

function buildDetailHTML(s) {
    const iconMap = { track: '🎵', artist: '🎤', album: '💿', podcast: '🎙️' };
    const icon = iconMap[s.type] || '🎶';

    let kpiHtml = `
        <div class="detail-hero-kpis">
            <div class="detail-kpi"><div class="dk-val">${s.totalPlays.toLocaleString()}</div><div class="dk-label">Total Plays</div></div>
            <div class="detail-kpi"><div class="dk-val">${s.totalMinutes.toLocaleString()}</div><div class="dk-label">Minutes</div></div>
            <div class="detail-kpi"><div class="dk-val">${Math.round(s.totalMinutes / 60)}</div><div class="dk-label">Hours</div></div>
            <div class="detail-kpi"><div class="dk-val">${s.skipRate}%</div><div class="dk-label">Skip Rate</div></div>
            ${s.maxStreakDays ? `<div class="detail-kpi"><div class="dk-val">${s.maxStreakDays}</div><div class="dk-label">Max Streak Days</div></div>` : ''}
            ${s.uniqueTracks ? `<div class="detail-kpi"><div class="dk-val">${s.uniqueTracks}</div><div class="dk-label">Unique Tracks</div></div>` : ''}
            ${s.uniqueAlbums ? `<div class="detail-kpi"><div class="dk-val">${s.uniqueAlbums}</div><div class="dk-label">Unique Albums</div></div>` : ''}
            ${s.avgMinPerPlay ? `<div class="detail-kpi"><div class="dk-val">${s.avgMinPerPlay}</div><div class="dk-label">Avg Min/Play</div></div>` : ''}
        </div>
        <div style="display:flex;gap:2rem;flex-wrap:wrap;margin-bottom:1.5rem;font-size:0.85rem;color:var(--text-muted);">
            <span>🗓 First played: <strong>${s.firstPlay}</strong></span>
            <span>🗓 Last played: <strong>${s.lastPlay}</strong></span>
        </div>
    `;

    // Year comparison bars
    const maxYearVal = s.yearBreakdown ? Math.max(...s.yearBreakdown.map(y => y.plays || y.minutes || 0)) : 1;
    const yearHtml = s.yearBreakdown && s.yearBreakdown.length > 0 ? `
        <div class="detail-section-title">Year by Year</div>
        <div class="year-comparison">
            ${s.yearBreakdown.map(y => {
        const val = y.plays || y.minutes || 0;
        const label = y.plays ? `${y.plays} plays` : `${y.minutes} min`;
        return `<div class="yc-row">
                    <span class="yc-label">${y.year}</span>
                    <div class="yc-bar-wrap"><div class="yc-bar" style="width:${Math.round((val / maxYearVal) * 100)}%"></div></div>
                    <span class="yc-val">${label}</span>
                </div>`;
    }).join('')}
        </div>
    ` : '';

    // Charts grid
    let chartsHtml = `
        <div class="detail-charts-grid">
            <div class="detail-chart-card">
                <h4>When You Listen (Hour of Day)</h4>
                <div class="detail-chart-wrapper"><canvas id="detail-hour-chart"></canvas></div>
            </div>
            <div class="detail-chart-card">
                <h4>Day of Week</h4>
                <div class="detail-chart-wrapper"><canvas id="detail-weekday-chart"></canvas></div>
            </div>
            <div class="detail-chart-card" style="grid-column:1/-1">
                <h4>Plays Over Time</h4>
                <div class="detail-chart-wrapper" style="height:200px"><canvas id="detail-timeline-chart"></canvas></div>
            </div>
        </div>
    `;

    // Extra lists
    let extraHtml = '';

    if (s.type === 'artist') {
        extraHtml += `
            <div class="detail-section-title">Top Tracks</div>
            <ul class="detail-list" id="detail-track-list">
                ${s.topTracks.map((t, i) => `
                    <li class="detail-list-item" data-type="track" data-name="${escapeAttr(t.name)}" data-extra="${escapeAttr(s.name)}">
                        <span class="dli-rank">${i + 1}</span>
                        <span class="dli-name">${esc(t.name)}</span>
                        <span class="dli-val">${t.plays} plays</span>
                        <span class="dli-sub">${t.minutes} min</span>
                    </li>
                `).join('')}
            </ul>
            <div class="detail-section-title">Top Albums</div>
            <ul class="detail-list" id="detail-album-list">
                ${s.topAlbums.map((a, i) => `
                    <li class="detail-list-item" data-type="album" data-name="${escapeAttr(a.name)}" data-extra="${escapeAttr(s.name)}">
                        <span class="dli-rank">${i + 1}</span>
                        <span class="dli-name">${esc(a.name)}</span>
                        <span class="dli-val">${a.plays} plays</span>
                        <span class="dli-sub">${a.minutes} min</span>
                    </li>
                `).join('')}
            </ul>
        `;
    }

    if (s.type === 'album') {
        extraHtml += `
            <div class="detail-section-title">Track Breakdown</div>
            <ul class="detail-list" id="detail-track-list">
                ${s.trackList.map((t, i) => `
                    <li class="detail-list-item" data-type="track" data-name="${escapeAttr(t.name)}" data-extra="${escapeAttr(s.subtitle)}">
                        <span class="dli-rank">${i + 1}</span>
                        <span class="dli-name">${esc(t.name)}</span>
                        <span class="dli-val">${t.plays} plays</span>
                        <span class="dli-sub">${t.minutes} min · skip ${t.skipRate}%</span>
                    </li>
                `).join('')}
            </ul>
        `;
    }

    if (s.type === 'track') {
        extraHtml += `
            <div class="detail-section-title">Last 20 Plays</div>
            <div style="max-height:320px;overflow-y:auto;">
                ${s.recent.map(r => `
                    <div class="history-item">
                        <span class="hi-date">${r.date}</span>
                        <span class="hi-mins">${r.minutes} min</span>
                        ${r.skipped ? '<span class="hi-skip">skipped</span>' : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    if (s.type === 'podcast') {
        extraHtml += `
            <div class="detail-section-title">Top Episodes</div>
            <ul class="detail-list">
                ${s.topEpisodes.map((e, i) => `
                    <li class="detail-list-item">
                        <span class="dli-rank">${i + 1}</span>
                        <span class="dli-name">${esc(e.name)}</span>
                        <span class="dli-val">${e.plays} plays</span>
                        <span class="dli-sub">${e.minutes} min · skip ${e.skipRate}%</span>
                    </li>
                `).join('')}
            </ul>
        `;
    }

    return `
        <div class="detail-hero">
            <div class="detail-hero-icon ${s.type === 'album' ? 'detail-hero-album-icon' : ''}">${icon}</div>
            <div class="detail-hero-info">
                <div class="detail-type-badge">${s.type.toUpperCase()}</div>
                <div class="detail-name">${esc(s.name)}</div>
                <div class="detail-sub">${esc(s.subtitle)}</div>
            </div>
        </div>
        ${kpiHtml}
        ${chartsHtml}
        ${s.type === 'artist' || s.type === 'track' ? '<details id="detail-forecast" class="detail-forecast"><summary>Forecast · plays</summary><div id="detail-forecast-content"></div></details>' : ''}
        ${yearHtml}
        ${extraHtml}
    `;
}

function setupDetailForecast(stats, fullData) {
    const section = document.getElementById('detail-forecast');
    if (!section) return;
    const context = { entity: stats.type === 'artist' ? 'artists' : 'tracks', entityKey: stats.type === 'artist' ? stats.name.trim() : `${stats.name.trim()}|||${(stats.subtitle || '').trim()}`, result: null, year: null, scope: 'annual', requested: false };
    detailForecastContext = context;
    section.addEventListener('toggle', () => {
        if (!section.open || context !== detailForecastContext) return;
        if (!context.requested) {
            context.requested = true;
            requestDetailForecast(fullData);
        } else if (context.result) {
            detailChartInstances['detail-forecast-cumulative']?.resize();
            detailChartInstances['detail-forecast-monthly']?.resize();
        }
    });
}

function requestDetailForecast(fullData) {
    const source = store.getForecastData().length ? store.getForecastData() : fullData;
    const context = detailForecastContext;
    if (!context) return;
    if (detailForecastSource !== source || !detailForecastWorker) {
        detailForecastWorker?.terminate();
        detailForecastSource = source;
        detailForecastWorker = new Worker(new URL('./forecast-worker.js', import.meta.url), { type: 'module' });
        detailForecastWorker.onmessage = event => {
            const message = event.data;
            if (message.id !== detailForecastRequest || !detailForecastContext) return;
            const content = document.getElementById('detail-forecast-content');
            if (!content) return;
            if (message.type === 'progress') content.innerHTML = `<div class="forecast-status" role="status">${esc(message.status)}${message.fraction === undefined ? '' : ` · ${Math.round(message.fraction * 100)}%`}<progress aria-label="Entity forecast computation" ${message.fraction === undefined ? '' : `max="1" value="${message.fraction}"`}></progress></div>`;
            else if (message.type === 'result') {
                if (!message.result) { content.innerHTML = '<p>No forecast data available for this entity.</p>'; return; }
                detailForecastContext.result = message.result;
                detailForecastContext.year = message.result.periods[0].year;
                renderDetailForecast(message.cached);
            } else if (message.type === 'error') showDetailForecastError(message.message, fullData);
        };
        detailForecastWorker.onerror = event => showDetailForecastError(event.message || 'Entity forecast failed.', fullData);
        detailForecastWorker.postMessage({ type: 'init', data: source.map(entry => ({ ts: entry.ts, trackName: entry.trackName, artistName: entry.artistName, msPlayed: entry.msPlayed, durationMin: entry.durationMin, skipped: entry.skipped, isPodcast: entry.isPodcast })) });
    }
    document.getElementById('detail-forecast-content').innerHTML = '<div class="forecast-status" role="status">Preparing entity forecast…<progress aria-label="Entity forecast computation"></progress></div>';
    detailForecastWorker.postMessage({ type: 'entityForecast', id: ++detailForecastRequest, options: { entity: context.entity, entityKey: context.entityKey, simulations: 5000, yearsAhead: 3, minutesWeight: store.getConfig().f1MinutesWeight, seed: 1729 } });
}

function showDetailForecastError(message, fullData) {
    const content = document.getElementById('detail-forecast-content');
    if (!content || !detailForecastContext) return;
    content.innerHTML = `<div class="forecast-status" role="alert">${esc(message)}<button type="button" id="detail-forecast-retry" class="secondary-btn">Retry</button></div>`;
    document.getElementById('detail-forecast-retry').addEventListener('click', () => requestDetailForecast(fullData));
}

function renderDetailForecast(cached = false) {
    const context = detailForecastContext;
    const result = context.result;
    document.getElementById('detail-forecast-content').innerHTML = `<div class="forecast-status" role="status">As of ${result.asOf} · ${result.simulations.toLocaleString()} simulations · ${result.validation.selected === 'hybrid' ? 'Validated hybrid' : 'Fixed-share baseline'}${cached ? ' · Cached' : ''}</div>
        <div class="forecast-controls">
            <label for="detail-forecast-year">Year<select id="detail-forecast-year">${result.periods.map(period => `<option value="${period.year}" ${period.year === context.year ? 'selected' : ''}>${period.year}</option>`).join('')}</select></label>
            <label for="detail-forecast-scope">Totals<select id="detail-forecast-scope"><option value="annual" ${context.scope === 'annual' ? 'selected' : ''}>Selected year only</option><option value="allTime" ${context.scope === 'allTime' ? 'selected' : ''}>All time to year end</option></select></label>
        </div>
        <div class="forecast-chart-grid">
            <section class="forecast-section"><h3>Cumulative plays</h3><div class="forecast-canvas"><canvas id="detail-forecast-cumulative" role="img" aria-label="Actual and predicted cumulative plays for this entity"></canvas></div></section>
            <section class="forecast-section"><h3>Monthly plays</h3><div class="forecast-canvas"><canvas id="detail-forecast-monthly" role="img" aria-label="Actual and predicted monthly plays for this entity"></canvas></div></section>
        </div>`;
    document.getElementById('detail-forecast-year').addEventListener('change', event => { context.year = Number(event.target.value); renderDetailForecast(cached); });
    document.getElementById('detail-forecast-scope').addEventListener('change', event => { context.scope = event.target.value; renderDetailForecast(cached); });
    for (const [id, cumulative] of [['detail-forecast-cumulative', true], ['detail-forecast-monthly', false]]) {
        const series = forecastPlaySeries(result, { year: context.year, scope: context.scope, cumulative });
        createDetailChart(id, forecastPlaysChartConfig(series));
    }
}

function renderDetailCharts(s) {
    const COLORS = ['#1DB954', '#17A2B8', '#FFC107', '#FD7E14', '#6F42C1', '#E83E8C'];
    const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Hour chart
    createDetailChart('detail-hour-chart', {
        type: 'bar',
        data: {
            labels: hourLabels,
            datasets: [{ data: s.byHour, backgroundColor: '#1DB954', borderRadius: 3 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, datalabels: false },
            scales: {
                y: { ticks: { color: '#b3b3b3' }, grid: { color: '#282828' } },
                x: { ticks: { color: '#b3b3b3', maxRotation: 45 }, grid: { display: false } }
            }
        }
    });

    // Weekday chart
    createDetailChart('detail-weekday-chart', {
        type: 'bar',
        data: {
            labels: weekdayLabels,
            datasets: [{ data: s.byWeekday, backgroundColor: '#17A2B8', borderRadius: 3 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, datalabels: false },
            scales: {
                y: { ticks: { color: '#b3b3b3' }, grid: { color: '#282828' } },
                x: { ticks: { color: '#b3b3b3' }, grid: { display: false } }
            }
        }
    });

    // Timeline chart
    if (s.monthlyTimeline && s.monthlyTimeline.length > 0) {
        const valKey = s.type === 'artist' || s.type === 'album' || s.type === 'podcast' ? 'minutes' : 'plays';
        const labels = s.monthlyTimeline.map(m => m.month);
        const values = s.monthlyTimeline.map(m => m[valKey]);

        createDetailChart('detail-timeline-chart', {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: 'rgba(29,185,84,0.6)',
                    borderColor: '#1DB954',
                    borderWidth: 1,
                    borderRadius: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, datalabels: false },
                scales: {
                    y: { ticks: { color: '#b3b3b3' }, grid: { color: '#282828' } },
                    x: { ticks: { color: '#b3b3b3', maxRotation: 45, maxTicksLimit: 20 }, grid: { display: false } }
                }
            }
        });
    }
}

function setupDetailListClicks(fullData) {
    document.querySelectorAll('#detail-modal-body .detail-list-item[data-type]').forEach(el => {
        el.addEventListener('click', () => {
            const type = el.dataset.type;
            const name = el.dataset.name;
            const extra = el.dataset.extra;
            openDetail(name, type, extra, fullData);
        });
    });
}

export function closeDetail() {
    detailForecastRequest++;
    detailForecastContext = null;
    const modal = document.getElementById('detail-modal');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    Object.values(detailChartInstances).forEach(c => c.destroy());
    detailChartInstances = {};
}

function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
