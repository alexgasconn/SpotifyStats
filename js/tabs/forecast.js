import { getConfig, getForecastData } from '../store.js';
import { esc } from '../utils.js';
import { openDetail } from '../detail.js';
import { forecastPlaySeries } from '../forecast.js';
import { forecastPlaysChartConfig } from '../charts.js';

let worker = null, sourceData = null, result = null;
let requestId = 0, selectedYear = null;
const probabilityLimit = 5;
let entity = 'artists', metric = 'minutes', scope = 'annual';
let fanChart = null, volumeChart = null;
const format = value => Math.round(value).toLocaleString();
const percent = value => `${(value * 100).toFixed(1)}%`;
const range = value => `${format(value.p10)}–${format(value.p90)}`;

export function resetForecast() {
    worker?.terminate();
    worker = null; sourceData = null; result = null; selectedYear = null; requestId++;
    fanChart?.destroy(); volumeChart?.destroy(); fanChart = null; volumeChart = null;
    const container = document.getElementById('forecast-content');
    if (container) container.innerHTML = '';
}

export function renderForecastTab() {
    const container = document.getElementById('forecast-content');
    if (!container) return;
    const source = getForecastData().length ? getForecastData() : window.spotifyData.full;
    if (!source.length) { container.innerHTML = '<p>No listening data available.</p>'; return; }
    if (sourceData !== source) {
        resetForecast(); sourceData = source;
        worker = new Worker(new URL('../forecast-worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = handleMessage;
        worker.onerror = event => showError(event.message || 'Forecast worker failed.');
        worker.postMessage({ type: 'init', data: source.map(entry => ({ ts: entry.ts, trackName: entry.trackName, artistName: entry.artistName, msPlayed: entry.msPlayed, durationMin: entry.durationMin, skipped: entry.skipped, isPodcast: entry.isPodcast })) });
    }
    if (result && result.entity === entity && result.metric === metric && result.minutesWeight === getConfig().f1MinutesWeight) { renderShell(); renderResult(); }
    else requestForecast();
}

function renderShell() {
    const years = result?.periods.map(period => period.year) || [];
    const options = (items, selected) => items.map(([value, label]) => `<option value="${value}" ${String(value) === String(selected) ? 'selected' : ''}>${label}</option>`).join('');
    document.getElementById('forecast-content').innerHTML = `<div class="forecast-controls">
        <label for="forecast-entity">Ranking<select id="forecast-entity">${options([['artists', 'Artists'], ['tracks', 'Songs']], entity)}</select></label>
        <label for="forecast-metric">Metric<select id="forecast-metric">${options([['minutes', 'Minutes'], ['plays', 'Plays'], ['points', 'F1 points']], metric)}</select></label>
        <label for="forecast-year">Year<select id="forecast-year">${options(years.map(year => [year, year]), selectedYear)}</select></label>
        <label for="forecast-scope">Totals<select id="forecast-scope">${options([['annual', 'Selected year only'], ['allTime', 'All time to year end']], scope)}</select></label>
    </div><div id="forecast-status" class="forecast-status" role="status" aria-live="polite"></div><div id="forecast-results"></div>`;
    document.getElementById('forecast-entity').addEventListener('change', event => { entity = event.target.value; requestForecast(); });
    document.getElementById('forecast-metric').addEventListener('change', event => { metric = event.target.value; requestForecast(); });
    document.getElementById('forecast-year').addEventListener('change', event => { selectedYear = Number(event.target.value); renderResult(); });
    document.getElementById('forecast-scope').addEventListener('change', event => { scope = event.target.value; renderResult(); });
}

function requestForecast() {
    result = null;
    renderShell();
    document.querySelectorAll('#forecast-content .forecast-controls select').forEach(control => { control.disabled = true; });
    document.getElementById('forecast-status').innerHTML = '<span>Preparing weekly history and backtesting…</span><progress aria-label="Forecast computation"></progress>';
    worker.postMessage({ type: 'forecast', id: ++requestId, options: { entity, metric, simulations: 5000, yearsAhead: 3, minutesWeight: getConfig().f1MinutesWeight, seed: 1729 } });
}

function handleMessage(event) {
    const message = event.data;
    if (message.id !== requestId) return;
    if (message.type === 'progress') {
        const status = document.getElementById('forecast-status');
        if (status) status.innerHTML = `<span>${esc(message.status)}${message.fraction === undefined ? '' : ` · ${Math.round(message.fraction * 100)}%`}</span><progress aria-label="Forecast computation" ${message.fraction === undefined ? '' : `max="1" value="${message.fraction}"`}></progress>`;
    } else if (message.type === 'result') {
        result = message.result;
        if (!result) { showError('No valid music history available for Forecast.'); return; }
        if (!result.periods.some(period => period.year === selectedYear)) selectedYear = result.periods[0].year;
        renderShell(); renderResult();
        if (message.cached) document.getElementById('forecast-status').textContent += ' · Cached';
    } else if (message.type === 'error') showError(message.message);
}

function showError(message) {
    const status = document.getElementById('forecast-status');
    if (status) status.innerHTML = `<span role="alert">${esc(message)}</span><button type="button" id="forecast-retry" class="secondary-btn">Retry</button>`;
    document.getElementById('forecast-retry')?.addEventListener('click', requestForecast);
    document.querySelectorAll('#forecast-content .forecast-controls select').forEach(control => { control.disabled = false; });
}

function renderResult() {
    if (!result) return;
    const period = result.periods.find(item => item.year === selectedYear);
    const volume = scope === 'annual' ? period.minutes : period.allMinutes;
    const plays = scope === 'annual' ? period.plays : period.allPlays;
    const hybrid = result.validation.selected === 'hybrid';
    const unit = metric === 'points' ? 'pts' : metric === 'plays' ? 'plays' : 'min';
    document.getElementById('forecast-status').textContent = `As of ${result.asOf} · ${format(result.simulations)} simulations · ${hybrid ? 'Validated hybrid' : 'Fixed-ranking baseline'}`;
    const ranking = period[scope].filter(row => row.p50 > 0).slice(0, 10);
    document.getElementById('forecast-results').innerHTML = `<div class="forecast-kpis">
        <div><span>${selectedYear} ${scope === 'annual' ? 'minutes' : 'all-time minutes'}</span><strong>${format(volume.p50)}</strong><small>P10–P90: ${range(volume)}</small></div>
        <div><span>${selectedYear} ${scope === 'annual' ? 'plays' : 'all-time plays'}</span><strong>${format(plays.p50)}</strong><small>P10–P90: ${range(plays)}</small></div>
        <div><span>Remaining minutes · ${result.periods[0].year}</span><strong>${format(result.remainingMinutes.p50)}</strong><small>P10–P90: ${range(result.remainingMinutes)}</small></div>
        <div><span>Historical Q4 newcomers in top 10</span><strong>${percent(result.discoveryPrior.top10Share)}</strong><small>${result.discoveryPrior.years} prior years</small></div>
    </div><div class="forecast-chart-grid">
        <section class="forecast-section"><h3>Cumulative plays · ${scope === 'annual' ? selectedYear : 'all time'}</h3><div class="forecast-canvas"><canvas id="forecast-fan-chart" role="img" aria-label="Actual and predicted cumulative plays"></canvas></div></section>
        <section class="forecast-section"><h3>Monthly plays · ${scope === 'annual' ? selectedYear : 'all time'}</h3><div class="forecast-canvas"><canvas id="forecast-volume-chart" role="img" aria-label="Actual and predicted monthly plays"></canvas></div></section>
    </div><section class="forecast-section"><div class="forecast-section-heading"><h3>Predicted top 10 ${entity === 'artists' ? 'artists' : 'songs'} · ${selectedYear}</h3><span>${scope === 'annual' ? 'Annual' : 'All time'} · ${unit}${metric === 'points' ? ` · ${result.minutesWeight}% minutes / ${100 - result.minutesWeight}% plays` : ''}</span></div>
        ${hybrid ? '' : '<p class="forecast-caveat">Hybrid did not beat the validated baseline. Ranking is held fixed; position probabilities are unavailable, not 100% certainty.</p>'}
        <ol class="forecast-ranking">${ranking.map((row, index) => {
        const probability = row.positions ? row.positions.slice(0, probabilityLimit).reduce((sum, value) => sum + value, 0) : null;
        return `<li><div class="forecast-rank-line"><span class="forecast-rank">${index + 1}</span>${row.unknown ? `<strong>${esc(row.name)}</strong>` : `<button type="button" class="forecast-detail" data-forecast-key="${esc(row.key)}">${esc(row.name)}${row.artist ? `<small>${esc(row.artist)}</small>` : ''}</button>`}<span class="forecast-range">${format(row.p50)} ${unit}<small>${range(row)} ${unit}</small></span></div>${probability === null ? '' : `<div class="forecast-probability"><span>${percent(probability)} to finish top ${probabilityLimit}</span><span>Top 10: ${percent(row.top10)}</span><div class="forecast-probability-track"><div style="width:${probability * 100}%"></div></div></div><details class="forecast-positions"><summary>Position probabilities</summary><div>${row.positions.map((value, position) => `<span>P${position + 1}<strong>${percent(value)}</strong></span>`).join('')}<span>Outside top 10<strong>${percent(1 - row.top10)}</strong></span></div></details>`}</li>`;
    }).join('')}</ol></section>
        <section class="forecast-section"><h3>Four-year outlook</h3><div class="forecast-table-wrap"><table class="df-table"><thead><tr><th>Year</th><th>Annual minutes</th><th>Annual P10–P90</th><th>All-time minutes</th><th>All-time P10–P90</th><th>Annual plays</th></tr></thead><tbody>${result.periods.map(item => `<tr><td>${item.year}</td><td>${format(item.minutes.p50)}</td><td>${range(item.minutes)}</td><td>${format(item.allMinutes.p50)}</td><td>${range(item.allMinutes)}</td><td>${format(item.plays.p50)}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="forecast-section"><h3>Backtesting · October 1 → December 31</h3><p class="forecast-caveat">${esc(result.validation.reason)} Spearman: union of both top-10 lists, tied ranks for missing entries.</p><div class="forecast-table-wrap"><table class="df-table"><thead><tr><th>Year</th><th>Hybrid top 3</th><th>Baseline top 3</th><th>Hybrid top 10</th><th>Baseline top 10</th><th>Hybrid ρ</th><th>Baseline ρ</th></tr></thead><tbody>${result.validation.rows.map(row => row.available ? `<tr><td>${row.year}</td><td>${percent(row.hybrid.top3)}</td><td>${percent(row.baseline.top3)}</td><td>${percent(row.hybrid.top10)}</td><td>${percent(row.baseline.top10)}</td><td>${row.hybrid.spearman.toFixed(3)}</td><td>${row.baseline.spearman.toFixed(3)}</td></tr>` : `<tr><td>${row.year}</td><td colspan="6">${esc(row.reason)}</td></tr>`).join('')}</tbody></table></div>
        ${result.validation.rows.filter(row => row.available).map(row => `<details class="forecast-validation-detail"><summary>${row.year} predicted vs actual top 10</summary><div class="forecast-table-wrap"><table class="df-table"><thead><tr><th>#</th><th>Hybrid</th><th>Baseline</th><th>Actual</th></tr></thead><tbody>${Array.from({ length: Math.max(row.actualTop10.length, row.predictedTop10.length) }, (_, index) => `<tr><td>${index + 1}</td>${[row.predictedTop10, row.baselineTop10, row.actualTop10].map(keys => `<td>${esc((keys[index] || '—').split('|||').join(' · '))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`).join('')}</section>
        <details class="forecast-method"><summary>Model & data</summary><p>Monday–Sunday weeks. Plays include short listens; minutes exclude plays under 30 seconds. Import privacy/podcast/offline settings still apply. Full imported history, not dashboard filters.</p><p>Volume: last 8 complete weeks × historical monthly seasonality. Entity EWMA half-life: 4 weeks; short-lived peaks decay over 8–10 weeks. Simulations include historical variance, obsession spikes and anonymous Q4 newcomers.</p><p>${result.candidateCount} known candidates from ${format(result.knownEntities)} entities: annual/all-time leaders and recent movers. Remaining entities contribute to the volume tail, not individual position probabilities. P10–P90 ranges are conditional simulations, not calibrated confidence guarantees. F1 uses the current weight and a historical-session proxy for future fastest laps.</p><p>Monthly allocations at week boundaries are approximate; the latest observed month may be partial. Annual F1 attribution follows the week's Monday; year-end snapshots include the then-observed partial week. The hybrid must improve average validation without reducing top-3 or top-10 overlap. Long-horizon accuracy is not validated by the October backtest.</p></details>`;
    document.querySelectorAll('[data-forecast-key]').forEach(button => button.addEventListener('click', () => {
        const row = ranking.find(item => item.key === button.dataset.forecastKey);
        openDetail(row.name, entity === 'artists' ? 'artist' : 'track', row.artist, sourceData);
    }));
    drawCharts(period);
}

function drawCharts(period) {
    fanChart?.destroy(); volumeChart?.destroy();
    const makeChart = (id, cumulative) => {
        const series = forecastPlaySeries(result, { year: period.year, scope, cumulative });
        return new Chart(document.getElementById(id), forecastPlaysChartConfig(series, { cumulative }));
    };
    fanChart = makeChart('forecast-fan-chart', true);
    volumeChart = makeChart('forecast-volume-chart', false);
}