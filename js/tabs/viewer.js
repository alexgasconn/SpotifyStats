// js/tabs/viewer.js — Viewer tab (animated progression charts)

import * as store from '../store.js';

let viewerChartInstance = null;
let viewerPlaybackTimer = null;
let viewerPlaybackStep = 0;
let viewerSeries = null;
let viewerColorKeyToIdx = new Map();
let viewerColorNextIdx = 0;
let viewerState = {
    entityType: 'artist', metric: 'minutes', valueMode: 'accum',
    rollingWindow: 4, granularity: 'month', chartType: 'line',
    lockCamera: true, speedMs: 450, topX: 8, fromDate: '', toDate: ''
};

const COLORS = ['#1DB954', '#17A2B8', '#FFC107', '#FD7E14', '#6F42C1', '#E83E8C', '#20C997', '#0DCAF0', '#FF6384', '#8BC34A', '#FFB74D', '#7E57C2'];
const colorOf = (idx, alpha = 1) => {
    const hex = COLORS[idx % COLORS.length];
    if (alpha === 1) return hex;
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
};
const shortLabel = (e) => { const t = e.subtitle ? `${e.name} - ${e.subtitle}` : e.name; return t.length > 36 ? t.slice(0, 35) + '...' : t; };

export function renderViewerTab() {
    const container = document.getElementById('viewer-content');
    if (!container) return;
    stopViewerPlayback();
    destroyViewerChart();

    const data = window.spotifyData.filtered.filter(d => !d.isPodcast && d.trackName);
    if (!data.length) { container.innerHTML = '<p style="color:var(--text-muted);padding:1rem">No music data available for viewer.</p>'; return; }

    const firstDate = data[0].date, lastDate = data[data.length - 1].date;
    if (!viewerState.fromDate) viewerState.fromDate = firstDate;
    if (!viewerState.toDate) viewerState.toDate = lastDate;
    viewerState.fromDate = viewerState.fromDate < firstDate ? firstDate : viewerState.fromDate;
    viewerState.toDate = viewerState.toDate > lastDate ? lastDate : viewerState.toDate;

    container.innerHTML = `
        <div class="viewer-panel">
            <div class="viewer-controls-grid">
                <div class="viewer-control"><label for="viewer-entity-type">Entity</label><select id="viewer-entity-type"><option value="artist" ${viewerState.entityType === 'artist' ? 'selected' : ''}>Artist</option><option value="album" ${viewerState.entityType === 'album' ? 'selected' : ''}>Album</option><option value="track" ${viewerState.entityType === 'track' ? 'selected' : ''}>Track</option></select></div>
                <div class="viewer-control"><label for="viewer-topx">Top</label><input id="viewer-topx" type="number" min="2" max="20" step="1" value="${viewerState.topX}"></div>
                <div class="viewer-control"><label for="viewer-metric">Metric</label><select id="viewer-metric"><option value="minutes" ${viewerState.metric === 'minutes' ? 'selected' : ''}>Minutes</option><option value="plays" ${viewerState.metric === 'plays' ? 'selected' : ''}>Plays</option><option value="points" ${viewerState.metric === 'points' ? 'selected' : ''}>Points (F1)</option></select></div>
                <div class="viewer-control"><label for="viewer-value-mode">Value mode</label><select id="viewer-value-mode"><option value="accum" ${viewerState.valueMode === 'accum' ? 'selected' : ''}>Accum</option><option value="rolling" ${viewerState.valueMode === 'rolling' ? 'selected' : ''}>Rolling mean</option><option value="period" ${viewerState.valueMode === 'period' ? 'selected' : ''}>Period data</option><option value="simple" ${viewerState.valueMode === 'simple' ? 'selected' : ''}>Simple</option></select></div>
                <div class="viewer-control" id="viewer-rolling-wrap"><label for="viewer-rolling-window">Rolling window</label><input id="viewer-rolling-window" type="number" min="2" max="24" step="1" value="${viewerState.rollingWindow}"></div>
                <div class="viewer-control"><label for="viewer-granularity">Granularity</label><select id="viewer-granularity"><option value="day" ${viewerState.granularity === 'day' ? 'selected' : ''}>Day</option><option value="week" ${viewerState.granularity === 'week' ? 'selected' : ''}>Week</option><option value="month" ${viewerState.granularity === 'month' ? 'selected' : ''}>Month</option><option value="year" ${viewerState.granularity === 'year' ? 'selected' : ''}>Year</option></select></div>
                <div class="viewer-control"><label for="viewer-chart-type">Visualization</label><select id="viewer-chart-type"><option value="line" ${viewerState.chartType === 'line' ? 'selected' : ''}>Line Race</option><option value="bar" ${viewerState.chartType === 'bar' ? 'selected' : ''}>Bar Race</option></select></div>
                <div class="viewer-control"><label for="viewer-from">From</label><input id="viewer-from" type="date" min="${firstDate}" max="${lastDate}" value="${viewerState.fromDate}"></div>
                <div class="viewer-control"><label for="viewer-to">To</label><input id="viewer-to" type="date" min="${firstDate}" max="${lastDate}" value="${viewerState.toDate}"></div>
                <div class="viewer-control viewer-speed"><label for="viewer-speed">Speed (<span id="viewer-speed-label">${viewerState.speedMs} ms</span>/step)</label><input id="viewer-speed" type="range" min="80" max="2000" step="20" value="${viewerState.speedMs}"></div>
                <div class="viewer-control viewer-check"><label><input id="viewer-lock-camera" type="checkbox" ${viewerState.lockCamera ? 'checked' : ''}> Lock camera scale</label></div>
            </div>
            <div class="viewer-actions"><button id="viewer-build-btn" class="secondary-btn">Build</button><button id="viewer-play-btn">Play</button><button id="viewer-pause-btn" class="secondary-btn">Pause</button><button id="viewer-reset-btn" class="secondary-btn">Reset</button></div>
            <div class="viewer-status" id="viewer-status">Ready to build a progression.</div>
            <div class="viewer-timeline-controls"><button id="viewer-step-back" class="secondary-btn" title="Step back">◀</button><input id="viewer-scrub" type="range" min="1" max="1" step="1" value="1"><button id="viewer-step-next" class="secondary-btn" title="Step forward">▶</button><span id="viewer-scrub-label">1/1</span></div>
            <div class="viewer-chart-wrap"><canvas id="viewer-progress-chart"></canvas></div>
        </div>`;

    const readControls = () => {
        viewerState.entityType = container.querySelector('#viewer-entity-type')?.value || 'artist';
        viewerState.topX = Math.max(2, Math.min(20, parseInt(container.querySelector('#viewer-topx')?.value || '8', 10)));
        viewerState.metric = container.querySelector('#viewer-metric')?.value || 'minutes';
        viewerState.valueMode = container.querySelector('#viewer-value-mode')?.value || 'accum';
        viewerState.rollingWindow = Math.max(2, Math.min(24, parseInt(container.querySelector('#viewer-rolling-window')?.value || '4', 10)));
        viewerState.granularity = container.querySelector('#viewer-granularity')?.value || 'month';
        viewerState.chartType = container.querySelector('#viewer-chart-type')?.value || 'line';
        viewerState.fromDate = container.querySelector('#viewer-from')?.value || firstDate;
        viewerState.toDate = container.querySelector('#viewer-to')?.value || lastDate;
        viewerState.speedMs = Math.max(80, Math.min(2000, parseInt(container.querySelector('#viewer-speed')?.value || '450', 10)));
        viewerState.lockCamera = !!container.querySelector('#viewer-lock-camera')?.checked;
    };

    const updateRollingVisibility = () => { const w = container.querySelector('#viewer-rolling-wrap'); if (w) w.style.display = viewerState.valueMode === 'rolling' ? '' : 'none'; };
    const setStatus = (text) => { const el = container.querySelector('#viewer-status'); if (el) el.textContent = text; };
    const updateScrubber = (step, maxStep) => { const s = container.querySelector('#viewer-scrub'); const l = container.querySelector('#viewer-scrub-label'); if (s) { s.min = '1'; s.max = String(Math.max(1, maxStep)); s.value = String(Math.max(1, Math.min(step, maxStep))); } if (l) l.textContent = `${Math.max(1, Math.min(step, maxStep))}/${Math.max(1, maxStep)}`; };
    const getYAxisTitle = () => { const u = viewerState.metric === 'plays' ? 'Plays' : viewerState.metric === 'points' ? 'Points' : 'Minutes'; if (viewerState.valueMode === 'accum') return `${u} (accum)`; if (viewerState.valueMode === 'rolling') return `${u} (rolling mean)`; return `${u} (per period)`; };
    const ensureStableColorKeys = (entities) => { entities.forEach(e => { if (!viewerColorKeyToIdx.has(e.key)) { viewerColorKeyToIdx.set(e.key, viewerColorNextIdx); viewerColorNextIdx += 1; } }); };

    const buildSeries = () => {
        readControls();
        if (viewerState.fromDate > viewerState.toDate) { const sw = viewerState.fromDate; viewerState.fromDate = viewerState.toDate; viewerState.toDate = sw; }
        viewerSeries = store.calculateViewerAccumulatedSeries(data, { entityType: viewerState.entityType, metric: viewerState.metric, valueMode: viewerState.valueMode, rollingWindow: viewerState.rollingWindow, granularity: viewerState.granularity, fromDate: viewerState.fromDate, toDate: viewerState.toDate, topX: viewerState.topX });
        viewerPlaybackStep = 0;
        if (!viewerSeries.labels.length || !viewerSeries.entities.length) { setStatus('No data found for current selection.'); destroyViewerChart(); return false; }
        ensureStableColorKeys(viewerSeries.entities);
        return true;
    };

    const drawViewerChart = (stepCount, full = false) => {
        if (!viewerSeries || !viewerSeries.labels.length) return;
        const maxStep = viewerSeries.labels.length;
        const upto = full ? maxStep : Math.max(1, Math.min(stepCount, maxStep));
        const labels = viewerSeries.labels.slice(0, upto);
        const unit = viewerState.metric === 'plays' ? 'plays' : viewerState.metric === 'points' ? 'pts' : 'min';
        const pct = Math.round((upto / maxStep) * 100);
        const canvas = container.querySelector('#viewer-progress-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (viewerChartInstance) viewerChartInstance.destroy();

        const ranking = viewerSeries.entities.map(e => ({ ...e, value: (viewerSeries.seriesByKey[e.key] || [0])[upto - 1] || 0 })).sort((a, b) => b.value - a.value);
        const visibleCount = Math.min(viewerState.topX, ranking.length);
        const visibleRanking = ranking.slice(0, visibleCount);
        const fixedAxisMax = viewerState.lockCamera ? (() => { const all = visibleRanking.flatMap(r => viewerSeries.seriesByKey[r.key] || [0]); return Math.max(1, Math.ceil(Math.max(...all, 1) * 1.05)); })() : undefined;
        let leaderText = '—';

        if (viewerState.chartType === 'line') {
            const datasets = visibleRanking.map((e, ri) => { const si = viewerColorKeyToIdx.get(e.key) ?? ri; return { label: `#${ri + 1} ${shortLabel(e)}`, data: (viewerSeries.seriesByKey[e.key] || []).slice(0, upto), borderColor: colorOf(si, 1), backgroundColor: colorOf(si, 0.15), borderWidth: 2, fill: false, tension: 0.25, pointRadius: 1.6, pointHoverRadius: 4 }; });
            const leader = ranking[0]; leaderText = leader ? `${shortLabel(leader)} (${Math.round(leader.value).toLocaleString()} ${unit})` : '—';
            viewerChartInstance = new Chart(ctx, { type: 'line', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 260 }, plugins: { legend: { display: true, position: 'bottom', labels: { color: '#b3b3b3', boxWidth: 10 } }, datalabels: false }, scales: { x: { ticks: { color: '#b3b3b3', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } }, y: { ticks: { color: '#b3b3b3' }, grid: { color: '#282828' }, max: fixedAxisMax, title: { display: true, text: getYAxisTitle(), color: '#b3b3b3' } } } } });
        } else {
            const barLabels = visibleRanking.map((r, i) => `#${i + 1} ${shortLabel(r)}`);
            const barValues = visibleRanking.map(r => r.value);
            const barColors = visibleRanking.map(r => colorOf(viewerColorKeyToIdx.get(r.key) ?? 0, 0.78));
            const leader = ranking[0]; leaderText = leader ? `${shortLabel(leader)} (${Math.round(leader.value).toLocaleString()} ${unit})` : '—';
            viewerChartInstance = new Chart(ctx, { type: 'bar', data: { labels: barLabels, datasets: [{ data: barValues, backgroundColor: barColors, borderColor: visibleRanking.map(r => colorOf(viewerColorKeyToIdx.get(r.key) ?? 0, 1)), borderWidth: 1, borderRadius: 4 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: Math.min(420, Math.max(120, Math.round(viewerState.speedMs * 0.7))) }, plugins: { legend: { display: false }, datalabels: false }, scales: { y: { ticks: { color: '#b3b3b3' }, grid: { display: false } }, x: { ticks: { color: '#b3b3b3' }, grid: { color: '#282828' }, max: fixedAxisMax, title: { display: true, text: getYAxisTitle(), color: '#b3b3b3' } } } } });
        }
        updateScrubber(upto, maxStep);
        setStatus(`Progress ${upto}/${maxStep} (${pct}%) · ${labels[labels.length - 1] || '-'} · Leader: ${leaderText}`);
    };

    const playViewer = () => { if (!viewerSeries || !viewerSeries.labels.length) { if (!buildSeries()) return; } if (viewerPlaybackStep >= viewerSeries.labels.length) viewerPlaybackStep = 0; stopViewerPlayback(); viewerPlaybackTimer = setInterval(() => { viewerPlaybackStep += 1; drawViewerChart(viewerPlaybackStep); if (viewerPlaybackStep >= viewerSeries.labels.length) stopViewerPlayback(); }, viewerState.speedMs); };
    const buildFull = () => { stopViewerPlayback(); if (!buildSeries()) return; viewerPlaybackStep = viewerSeries.labels.length; drawViewerChart(viewerPlaybackStep, true); };
    const resetViewer = () => { stopViewerPlayback(); if (!viewerSeries || !viewerSeries.labels.length) { if (!buildSeries()) return; } viewerPlaybackStep = 1; drawViewerChart(viewerPlaybackStep); };

    ['viewer-entity-type', 'viewer-topx', 'viewer-metric', 'viewer-granularity', 'viewer-chart-type', 'viewer-from', 'viewer-to'].forEach(id => {
        container.querySelector(`#${id}`)?.addEventListener('change', () => { readControls(); buildFull(); });
    });
    container.querySelector('#viewer-value-mode')?.addEventListener('change', () => { readControls(); updateRollingVisibility(); buildFull(); });
    container.querySelector('#viewer-rolling-window')?.addEventListener('change', () => { readControls(); buildFull(); });
    container.querySelector('#viewer-speed')?.addEventListener('input', (e) => { viewerState.speedMs = parseInt(e.target.value || '450', 10); const lbl = container.querySelector('#viewer-speed-label'); if (lbl) lbl.textContent = `${viewerState.speedMs} ms`; if (viewerPlaybackTimer) playViewer(); });
    container.querySelector('#viewer-lock-camera')?.addEventListener('change', () => { readControls(); if (!viewerSeries || !viewerSeries.labels.length) { buildFull(); return; } drawViewerChart(Math.max(1, viewerPlaybackStep || 1)); });
    container.querySelector('#viewer-build-btn')?.addEventListener('click', buildFull);
    container.querySelector('#viewer-play-btn')?.addEventListener('click', () => { readControls(); playViewer(); });
    container.querySelector('#viewer-pause-btn')?.addEventListener('click', stopViewerPlayback);
    container.querySelector('#viewer-reset-btn')?.addEventListener('click', () => { readControls(); resetViewer(); });
    container.querySelector('#viewer-scrub')?.addEventListener('input', (e) => { if (!viewerSeries || !viewerSeries.labels.length) return; stopViewerPlayback(); viewerPlaybackStep = Math.max(1, Math.min(viewerSeries.labels.length, parseInt(e.target.value || '1', 10))); drawViewerChart(viewerPlaybackStep); });
    container.querySelector('#viewer-step-back')?.addEventListener('click', () => { if (!viewerSeries || !viewerSeries.labels.length) return; stopViewerPlayback(); viewerPlaybackStep = Math.max(1, (viewerPlaybackStep || 1) - 1); drawViewerChart(viewerPlaybackStep); });
    container.querySelector('#viewer-step-next')?.addEventListener('click', () => { if (!viewerSeries || !viewerSeries.labels.length) return; stopViewerPlayback(); viewerPlaybackStep = Math.min(viewerSeries.labels.length, (viewerPlaybackStep || 0) + 1); drawViewerChart(viewerPlaybackStep); });

    updateRollingVisibility();
    buildFull();
}

function stopViewerPlayback() { if (viewerPlaybackTimer) { clearInterval(viewerPlaybackTimer); viewerPlaybackTimer = null; } }
function destroyViewerChart() { if (viewerChartInstance) { viewerChartInstance.destroy(); viewerChartInstance = null; } }
