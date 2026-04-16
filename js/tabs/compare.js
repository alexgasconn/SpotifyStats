// js/tabs/compare.js — Compare tab (artist vs artist)

import * as store from '../store.js';
import * as charts from '../charts.js';
import { esc } from '../utils.js';

let compareArtistA = '';
let compareArtistB = '';
let compareRaceMetric = 'minutes';
let compareStrictMode = false;
let compareWeights = {};

export function renderCompareTab() {
    const container = document.getElementById('compare-content');
    if (!container) return;
    const data = (window.spotifyData?.filtered || []).filter(d => !d.isPodcast && d.trackName);
    if (!data.length) { container.innerHTML = '<p style="color:var(--text-muted);padding:1rem">No music data available.</p>'; return; }

    const artistCounts = {};
    data.forEach(d => { if (d.artistName) artistCounts[d.artistName] = (artistCounts[d.artistName] || 0) + 1; });
    const artists = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]).map(([name]) => name);

    if (!compareArtistA || !artists.includes(compareArtistA)) compareArtistA = artists[0] || '';
    if (!compareArtistB || !artists.includes(compareArtistB) || compareArtistB === compareArtistA) compareArtistB = artists.find(a => a !== compareArtistA) || artists[0] || '';
    if (!compareArtistA || !compareArtistB || compareArtistA === compareArtistB) { container.innerHTML = '<p style="color:var(--text-muted);padding:1rem">Need at least two artists.</p>'; return; }

    const cmp = store.calculateArtistComparison(data, compareArtistA, compareArtistB, { strictWinnerMode: compareStrictMode, weights: compareWeights });
    if (!cmp) { container.innerHTML = '<p style="color:var(--text-muted);padding:1rem">Comparison could not be generated.</p>'; return; }
    if (!Object.keys(compareWeights).length) cmp.scorecard.forEach(row => { compareWeights[row.key] = row.weight; });

    const winnerLabel = cmp.winner === 'A' ? cmp.artistA : cmp.winner === 'B' ? cmp.artistB : 'Tie';
    const winnerClass = cmp.winner === 'A' ? 'compare-winner-a' : cmp.winner === 'B' ? 'compare-winner-b' : 'compare-winner-tie';
    const weightedWinnerLabel = cmp.weightedWinner === 'A' ? cmp.artistA : cmp.weightedWinner === 'B' ? cmp.artistB : 'Tie';
    const weightedWinnerClass = cmp.weightedWinner === 'A' ? 'compare-winner-a' : cmp.weightedWinner === 'B' ? 'compare-winner-b' : 'compare-winner-tie';
    const optionHtml = artists.slice(0, 300).map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');

    const scoreRows = cmp.scorecard.map(row => {
        const aVal = typeof row.a === 'number' ? row.a.toLocaleString() : row.a;
        const bVal = typeof row.b === 'number' ? row.b.toLocaleString() : row.b;
        const verdict = row.winner === 'A' ? cmp.artistA : row.winner === 'B' ? cmp.artistB : 'Draw';
        const cls = row.winner === 'A' ? 'compare-row-win-a' : row.winner === 'B' ? 'compare-row-win-b' : 'compare-row-draw';
        return `<tr class="${cls}"><td>${esc(row.label)}</td><td>${aVal}</td><td>${bVal}</td><td>${row.weight}</td><td>${esc(verdict)}</td></tr>`;
    }).join('');

    const weightRows = cmp.scorecard.map(row => `<div class="compare-weight-row"><span>${esc(row.label)}</span><input type="number" min="0" step="0.25" data-weight-key="${row.key}" value="${Number(compareWeights[row.key] ?? row.weight)}"></div>`).join('');

    const weeklyRows = cmp.duel.weekly.slice().reverse().slice(0, 24).map(w => `<tr><td>${w.week}</td><td>${w.aMinutes}</td><td>${w.bMinutes}</td><td>${w.winner === 'A' ? esc(cmp.artistA) : w.winner === 'B' ? esc(cmp.artistB) : 'Tie'}</td></tr>`).join('');

    // Compute shared tracks/albums overlap
    const aData = data.filter(d => d.artistName === compareArtistA);
    const bData = data.filter(d => d.artistName === compareArtistB);
    const aAlbums = new Set(aData.map(d => d.albumName).filter(Boolean));
    const bAlbums = new Set(bData.map(d => d.albumName).filter(Boolean));
    const sharedAlbums = [...aAlbums].filter(a => bAlbums.has(a));

    // Platform breakdown for each artist
    const aPlatMap = {}, bPlatMap = {};
    aData.forEach(d => { if (d.platform) aPlatMap[d.platform] = (aPlatMap[d.platform] || 0) + 1; });
    bData.forEach(d => { if (d.platform) bPlatMap[d.platform] = (bPlatMap[d.platform] || 0) + 1; });
    const allPlats = [...new Set([...Object.keys(aPlatMap), ...Object.keys(bPlatMap)])].sort((a, b) => ((bPlatMap[b] || 0) + (aPlatMap[b] || 0)) - ((bPlatMap[a] || 0) + (aPlatMap[a] || 0))).slice(0, 6);
    const platformRows = allPlats.map(p => `<tr><td>${esc(p)}</td><td>${aPlatMap[p] || 0}</td><td>${bPlatMap[p] || 0}</td></tr>`).join('');

    // First & last listen dates
    const aFirst = aData.length ? aData[0].date : '—';
    const aLast = aData.length ? aData[aData.length - 1].date : '—';
    const bFirst = bData.length ? bData[0].date : '—';
    const bLast = bData.length ? bData[bData.length - 1].date : '—';

    const overlapSection = `
        <div class="chart-container full-width">
            <h3>📋 Additional Comparison</h3>
            <div class="compare-extra-grid">
                <div class="compare-extra-card">
                    <h4>📅 Timeline</h4>
                    <div class="ce-row"><span>${esc(cmp.artistA)}</span><strong>${aFirst} → ${aLast}</strong></div>
                    <div class="ce-row"><span>${esc(cmp.artistB)}</span><strong>${bFirst} → ${bLast}</strong></div>
                </div>
                <div class="compare-extra-card">
                    <h4>💿 Shared Albums (${sharedAlbums.length})</h4>
                    ${sharedAlbums.length ? `<div class="ce-list">${sharedAlbums.slice(0, 10).map(a => `<span class="ce-tag">${esc(a)}</span>`).join('')}${sharedAlbums.length > 10 ? `<span class="ce-more">+${sharedAlbums.length - 10} more</span>` : ''}</div>` : '<p style="color:var(--text-muted);font-size:0.82rem">No shared albums</p>'}
                </div>
                <div class="compare-extra-card">
                    <h4>💻 Platform Breakdown</h4>
                    ${allPlats.length ? `<table class="compare-table compare-table-compact"><thead><tr><th>Platform</th><th>${esc(cmp.artistA)}</th><th>${esc(cmp.artistB)}</th></tr></thead><tbody>${platformRows}</tbody></table>` : '<p style="color:var(--text-muted);font-size:0.82rem">No platform data</p>'}
                </div>
            </div>
        </div>`;

    const buildKpi = (name, s, pts, wins) => `<div class="compare-kpi-card"><h4>${esc(name)}</h4><div class="compare-kpi-list"><div><span>Minutes</span><strong>${s.totalMinutes.toLocaleString()}</strong></div><div><span>Plays</span><strong>${s.plays.toLocaleString()}</strong></div><div><span>Duel Pts</span><strong>${pts}</strong></div><div><span>Weekly Wins</span><strong>${wins}</strong></div><div><span>Streak</span><strong>${s.longestStreak}d</strong></div><div><span>Unique Tracks</span><strong>${s.uniqueTracks}</strong></div><div><span>Skip Rate</span><strong>${s.skipRate}%</strong></div><div><span>Avg min/play</span><strong>${s.avgMinutesPerPlay}</strong></div></div></div>`;

    container.innerHTML = `
        <div class="compare-header">
            <div class="compare-selectors">
                <div class="compare-control"><label for="compare-artist-a">Artist A</label><select id="compare-artist-a">${optionHtml}</select></div>
                <div class="compare-control"><label for="compare-artist-b">Artist B</label><select id="compare-artist-b">${optionHtml}</select></div>
                <div class="compare-control"><label for="compare-race-metric">Race metric</label><select id="compare-race-metric"><option value="minutes" ${compareRaceMetric === 'minutes' ? 'selected' : ''}>Minutes</option><option value="plays" ${compareRaceMetric === 'plays' ? 'selected' : ''}>Plays</option><option value="points" ${compareRaceMetric === 'points' ? 'selected' : ''}>Points</option></select></div>
                <label class="compare-toggle-check"><input id="compare-strict-mode" type="checkbox" ${compareStrictMode ? 'checked' : ''}> Strict winner mode</label>
                <button id="compare-random-btn" class="secondary-btn">Random Similar</button>
                <button id="compare-swap-btn" class="secondary-btn">Swap</button>
            </div>
            <div class="compare-hero ${winnerClass}"><div class="compare-hero-title">Head-to-Head Winner</div><div class="compare-hero-value">${esc(winnerLabel)}</div><div class="compare-hero-sub">${cmp.winsByMetrics.A} won by ${esc(cmp.artistA)} · ${cmp.winsByMetrics.B} by ${esc(cmp.artistB)} · ${cmp.winsByMetrics.draws} draws</div></div>
            <div class="compare-hero ${weightedWinnerClass}"><div class="compare-hero-title">Weighted Winner</div><div class="compare-hero-value">${esc(weightedWinnerLabel)}</div><div class="compare-hero-sub">Weighted: ${cmp.artistA} ${cmp.winsByMetrics.weightedA} · ${cmp.artistB} ${cmp.winsByMetrics.weightedB}</div></div>
        </div>
        <div class="compare-kpi-grid">${buildKpi(cmp.artistA, cmp.summaryA, cmp.duel.pointsA, cmp.duel.winsA)}${buildKpi(cmp.artistB, cmp.summaryB, cmp.duel.pointsB, cmp.duel.winsB)}</div>
        <div class="chart-container full-width compare-verdict-priority"><h3>Metric-by-Metric Verdict</h3><div style="overflow:auto"><table class="compare-table"><thead><tr><th>Metric</th><th>${esc(cmp.artistA)}</th><th>${esc(cmp.artistB)}</th><th>Weight</th><th>Winner</th></tr></thead><tbody>${scoreRows}</tbody></table></div></div>
        <div class="charts-grid">
            <div class="chart-container full-width"><h3>Cumulative Race</h3><div class="chart-wrapper"><canvas id="compare-race-chart"></canvas></div></div>
            <div class="chart-container full-width"><h3>Metric Weights</h3><div class="compare-weight-grid">${weightRows}</div><div class="compare-weight-actions"><button id="compare-reset-weights" class="secondary-btn">Reset to defaults</button></div></div>
            <div class="chart-container"><h3>Monthly Trend</h3><div class="chart-wrapper"><canvas id="compare-monthly-chart"></canvas></div></div>
            <div class="chart-container"><h3>Hour of Day Profile</h3><div class="chart-wrapper"><canvas id="compare-hour-chart"></canvas></div></div>
            <div class="chart-container"><h3>Weekday Profile</h3><div class="chart-wrapper"><canvas id="compare-weekday-chart"></canvas></div></div>
            <div class="chart-container"><h3>Time of Day Segments</h3><div class="chart-wrapper"><canvas id="compare-daypart-chart"></canvas></div></div>
            <div class="chart-container full-width"><h3>Weekly Head-to-Head (recent 24 weeks)</h3><div style="overflow:auto"><table class="compare-table"><thead><tr><th>Week</th><th>${esc(cmp.artistA)} min</th><th>${esc(cmp.artistB)} min</th><th>Winner</th></tr></thead><tbody>${weeklyRows}</tbody></table></div></div>
            ${overlapSection}
        </div>`;

    const selA = container.querySelector('#compare-artist-a');
    const selB = container.querySelector('#compare-artist-b');
    if (selA) selA.value = compareArtistA;
    if (selB) selB.value = compareArtistB;

    selA?.addEventListener('change', (e) => { compareArtistA = e.target.value; if (compareArtistA === compareArtistB) compareArtistB = artists.find(a => a !== compareArtistA) || compareArtistB; renderCompareTab(); });
    selB?.addEventListener('change', (e) => { compareArtistB = e.target.value; if (compareArtistA === compareArtistB) compareArtistA = artists.find(a => a !== compareArtistB) || compareArtistA; renderCompareTab(); });
    container.querySelector('#compare-swap-btn')?.addEventListener('click', () => { const t = compareArtistA; compareArtistA = compareArtistB; compareArtistB = t; renderCompareTab(); });
    container.querySelector('#compare-race-metric')?.addEventListener('change', (e) => { compareRaceMetric = e.target.value; renderCompareTab(); });
    container.querySelector('#compare-strict-mode')?.addEventListener('change', (e) => { compareStrictMode = !!e.target.checked; renderCompareTab(); });
    container.querySelector('#compare-random-btn')?.addEventListener('click', () => { const pair = pickRandomSimilarPair(data); if (!pair) return; compareArtistA = pair[0]; compareArtistB = pair[1]; renderCompareTab(); });
    container.querySelectorAll('[data-weight-key]').forEach(input => { input.addEventListener('change', (e) => { compareWeights[e.target.dataset.weightKey] = Math.max(0, Number(e.target.value || 0)); renderCompareTab(); }); });
    container.querySelector('#compare-reset-weights')?.addEventListener('click', () => { compareWeights = {}; renderCompareTab(); });

    const raceData = cmp.raceSeries?.[compareRaceMetric] || cmp.raceSeries?.minutes;
    charts.renderCompareRaceChart('compare-race-chart', raceData?.labels || cmp.raceLabels, raceData?.a || cmp.raceA, raceData?.b || cmp.raceB, cmp.artistA, cmp.artistB, raceData?.yTitle || 'Cumulative Minutes');
    charts.renderCompareGroupedBar('compare-monthly-chart', cmp.monthlyLabels, cmp.monthlyA, cmp.monthlyB, cmp.artistA, cmp.artistB, 'Minutes');
    charts.renderCompareGroupedBar('compare-hour-chart', Array.from({ length: 24 }, (_, i) => String(i)), cmp.summaryA.hourPct, cmp.summaryB.hourPct, cmp.artistA, cmp.artistB, 'Share %');
    charts.renderCompareGroupedBar('compare-weekday-chart', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], cmp.summaryA.weekdayPct, cmp.summaryB.weekdayPct, cmp.artistA, cmp.artistB, 'Share %');
    charts.renderCompareGroupedBar('compare-daypart-chart', ['Morning', 'Afternoon', 'Evening', 'Night'], [cmp.summaryA.timeOfDayMinutes.morning, cmp.summaryA.timeOfDayMinutes.afternoon, cmp.summaryA.timeOfDayMinutes.evening, cmp.summaryA.timeOfDayMinutes.night], [cmp.summaryB.timeOfDayMinutes.morning, cmp.summaryB.timeOfDayMinutes.afternoon, cmp.summaryB.timeOfDayMinutes.evening, cmp.summaryB.timeOfDayMinutes.night], cmp.artistA, cmp.artistB, 'Minutes');
}

function pickRandomSimilarPair(data) {
    const top = store.calculateTopItems(data, 'artistName', 'minutes', 50).map(a => ({ name: a.name, minutes: a.minutes, plays: a.plays })).filter(a => a.name);
    if (top.length < 2) return null;
    const base = top[Math.floor(Math.random() * top.length)];
    const candidates = top.filter(a => a.name !== base.name).map(a => ({ ...a, score: Math.abs((a.minutes || 0) - (base.minutes || 0)) / Math.max(1, base.minutes || 1) * 0.7 + Math.abs((a.plays || 0) - (base.plays || 0)) / Math.max(1, base.plays || 1) * 0.3 })).sort((x, y) => x.score - y.score).slice(0, 10);
    if (!candidates.length) return null;
    return [base.name, candidates[Math.floor(Math.random() * candidates.length)].name];
}
