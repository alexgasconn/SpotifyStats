// js/tabs/f1.js — F1 Championship tab logic

import * as store from '../store.js';
import * as charts from '../charts.js';
import { esc } from '../utils.js';

let f1Mode = 'artists';
let f1Year = null;
let f1WeekIndex = -1;
let f1EvolutionUnit = 'month';
let f1StandingsSort = { key: 'points', dir: 'desc' };
let f1AllTimeSort = { key: 'totalPoints', dir: 'desc' };
let f1WeekSort = { key: 'rank', dir: 'asc' };

export function renderF1Tab() {
    const container = document.getElementById('f1-content');
    if (!container) return;
    const stats = store.calculateF1Championship(window.spotifyData.filtered, f1Mode, f1Year, 25);
    if (!stats) { container.innerHTML = '<p style="color:var(--text-muted);padding:1rem">No data available for F1 championship.</p>'; return; }
    f1Year = stats.selectedYear;

    const val = (row, key) => { if (key === 'name') return String(row.name || '').toLowerCase(); return Number(row[key] ?? 0); };
    const sortRows = (rows, sortState) => {
        const list = [...rows];
        const dir = sortState.dir === 'asc' ? 1 : -1;
        return list.sort((a, b) => { const av = val(a, sortState.key); const bv = val(b, sortState.key); if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * dir; return (av - bv) * dir; });
    };

    const sortedStandings = sortRows(stats.standings, f1StandingsSort);
    const sortedAllTime = sortRows(stats.allTimeList, f1AllTimeSort);
    const yearlyPodiumRows = stats.yearlyTop3.slice().sort((a, b) => a.year - b.year).map(y => ({ year: y.year, gold: y.top3[0] || null, silver: y.top3[1] || null, bronze: y.top3[2] || null }));

    const leader = stats.standings[0];
    const second = stats.standings[1];
    const gap = leader && second ? leader.points - second.points : 0;
    const totalMinutes = stats.standings.reduce((s, r) => s + r.minutes, 0);
    const weeks = stats.weekly.slice().reverse().map((w, idx) => ({ weekStart: w.weekStart, label: `Week ${stats.weekly.length - idx}`, idx: stats.weekly.length - idx - 1 }));
    if (f1WeekIndex >= stats.weekly.length) f1WeekIndex = -1;
    if (f1WeekIndex < -1) f1WeekIndex = -1;
    const activeWeekIndex = resolveF1WeekIndex(stats.weekly.length, f1WeekIndex);
    const sortMark = (state, key) => state.key === key ? (state.dir === 'asc' ? ' ▲' : ' ▼') : '';

    container.innerHTML = `
        <div class="f1-controls">
            <div><label for="f1-mode">Championship</label><select id="f1-mode">
                <option value="artists" ${stats.mode === 'artists' ? 'selected' : ''}>Artists</option>
                <option value="tracks" ${stats.mode === 'tracks' ? 'selected' : ''}>Tracks</option>
                <option value="albums" ${stats.mode === 'albums' ? 'selected' : ''}>Albums</option>
            </select></div>
            <div><label for="f1-year">Season</label><select id="f1-year">
                ${stats.years.map(y => `<option value="${y}" ${y === stats.selectedYear ? 'selected' : ''}>${y}</option>`).join('')}
            </select></div>
        </div>
        <details class="f1-help"><summary>How this F1 mode works (quick glossary)</summary><div>
            Weekly ranking: every Monday-Sunday week, the Top 10 by mixed score gets F1 points (25-18-15-12-10-8-6-4-2-1).<br>
            Mixed score: 50% normalized minutes + 50% normalized plays (within that week).<br>
            Fast Lap (⚡): +1 bonus point for the biggest single listening session of that week (only if that entry is in the Top 10).<br>
            Wins: number of weeks finishing P1. Podiums: Top 3. Streak Top 10: best consecutive weeks in Top 10.
        </div></details>
        <div class="f1-hero">
            <div class="f1-pill"><div class="k">🏆 Leader</div><div class="v">${leader ? esc(leader.name) : '—'}</div><div class="k">${leader?.points || 0} pts</div></div>
            <div class="f1-pill"><div class="k">📊 Gap to P2</div><div class="v">${gap}</div><div class="k">${leader?.weeksWon || 0} wins · ${leader?.fastestLaps || 0} ⚡</div></div>
            <div class="f1-pill"><div class="k">📈 Total Minutes</div><div class="v">${Math.round(totalMinutes)}</div><div class="k">${Math.round(totalMinutes / stats.standings.length)} avg</div></div>
        </div>
        <div class="f1-grid">
            <div class="f1-card" style="grid-column:1/-1"><h3>📅 Evolution</h3>
                <div class="timeline-controls" id="f1EvolutionControls">
                    <button class="timeline-btn ${f1EvolutionUnit === 'month' ? 'active' : ''}" data-unit="month">Month</button>
                    <button class="timeline-btn ${f1EvolutionUnit === 'week' ? 'active' : ''}" data-unit="week">Week</button>
                </div><div style="height:310px"><canvas id="f1-evolution-chart"></canvas></div></div>
            <div class="f1-card" style="grid-column:1/-1"><h3>🏁 ${stats.selectedYear} Final Standings</h3><div style="overflow:auto;">
                <table class="f1-standings f1-standings-detailed f1-podium-highlight"><thead><tr>
                    <th>#</th>
                    <th class="f1-sortable-th" data-f1-table="standings" data-sort-key="name">Name${sortMark(f1StandingsSort, 'name')}</th>
                    <th class="f1-sortable-th" data-f1-table="standings" data-sort-key="weeksWon">Wins${sortMark(f1StandingsSort, 'weeksWon')}</th>
                    <th class="f1-sortable-th" data-f1-table="standings" data-sort-key="podiums">Podiums${sortMark(f1StandingsSort, 'podiums')}</th>
                    <th class="f1-sortable-th" data-f1-table="standings" data-sort-key="bestWinStreak">Racha Top 10${sortMark(f1StandingsSort, 'bestWinStreak')}</th>
                    <th class="f1-sortable-th" data-f1-table="standings" data-sort-key="fastestLaps">⚡${sortMark(f1StandingsSort, 'fastestLaps')}</th>
                    <th class="f1-sortable-th" data-f1-table="standings" data-sort-key="minutes">Minutes${sortMark(f1StandingsSort, 'minutes')}</th>
                    <th class="f1-sortable-th" data-f1-table="standings" data-sort-key="points">Points${sortMark(f1StandingsSort, 'points')}</th>
                </tr></thead><tbody>
                    ${sortedStandings.slice(0, 15).map((r, i) => { const p = ((r.minutes / totalMinutes) * 100).toFixed(1); return `<tr><td><strong>${i + 1}</strong></td><td>${esc(r.name)}${r.subtitle ? `<div style="font-size:0.7rem;color:var(--text-muted)">${esc(r.subtitle)}</div>` : ''}</td><td><strong>${r.weeksWon}</strong></td><td>${r.podiums}</td><td>${r.bestWinStreak || 0}</td><td>${r.fastestLaps || 0}</td><td>${Math.round(r.minutes)}<span style="color:var(--text-muted);font-size:0.8rem"> (${p}%)</span></td><td><strong style="color:var(--green)">${r.points}</strong></td></tr>`; }).join('')}
                </tbody></table></div></div>
            <div class="f1-card" style="grid-column:1/-1"><h3>📋 Top 10 By Week</h3>
                <div style="margin-bottom:1rem;padding:0.8rem;background:rgba(29,185,84,0.08);border-radius:var(--radius);border-left:3px solid var(--green);">
                    <div style="display:flex;gap:0.6rem;align-items:center;flex-wrap:wrap;">
                        <label for="f1-week-selector" style="font-size:0.8rem;color:var(--green);font-weight:600;">SELECT WEEK:</label>
                        <select id="f1-week-selector" style="padding:0.5rem 0.8rem;background:var(--gray);color:var(--text);border:1px solid rgba(29,185,84,0.3);border-radius:var(--radius);font-size:0.9rem;cursor:pointer;">
                            <option value="-1" ${f1WeekIndex === -1 ? 'selected' : ''}>Latest Week</option>
                            ${weeks.map(w => `<option value="${w.idx}" ${f1WeekIndex === w.idx ? 'selected' : ''}>${w.label} (${w.weekStart})</option>`).join('')}
                        </select>
                        <button id="f1-week-prev" class="secondary-btn" ${activeWeekIndex <= 0 ? 'disabled' : ''}>◀ Prev</button>
                        <button id="f1-week-next" class="secondary-btn" ${activeWeekIndex >= (stats.weekly.length - 1) ? 'disabled' : ''}>Next ▶</button>
                        <span style="font-size:0.8rem;color:var(--text-muted);">Week ${activeWeekIndex + 1} / ${stats.weekly.length}</span>
                    </div></div>
                <div id="f1-week-details" style="overflow:auto;"></div></div>
            <div class="f1-card" style="grid-column:1/-1"><h3>🏆 All-Time Championship Records</h3>
                <table class="f1-standings"><thead><tr>
                    <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="name">Name${sortMark(f1AllTimeSort, 'name')}</th>
                    <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="golds">Oros${sortMark(f1AllTimeSort, 'golds')}</th>
                    <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="silvers">Platas${sortMark(f1AllTimeSort, 'silvers')}</th>
                    <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="bronzes">Bronces${sortMark(f1AllTimeSort, 'bronzes')}</th>
                    <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="totalWins">Wins${sortMark(f1AllTimeSort, 'totalWins')}</th>
                    <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="totalPodiums">Podiums${sortMark(f1AllTimeSort, 'totalPodiums')}</th>
                    <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="bestWinStreak">Racha Top 10${sortMark(f1AllTimeSort, 'bestWinStreak')}</th>
                    <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="totalFastestLaps">⚡${sortMark(f1AllTimeSort, 'totalFastestLaps')}</th>
                    <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="totalPoints">Points${sortMark(f1AllTimeSort, 'totalPoints')}</th>
                </tr></thead><tbody>
                    ${sortedAllTime.slice(0, 20).map(r => `<tr><td>${esc(r.name)}${r.subtitle ? `<div style="font-size:0.7rem;color:var(--text-muted);">${esc(r.subtitle)}</div>` : ''}</td><td>${r.golds}</td><td>${r.silvers}</td><td>${r.bronzes}</td><td>${r.totalWins}</td><td>${r.totalPodiums}</td><td>${r.bestWinStreak || 0}</td><td>${r.totalFastestLaps}</td><td><strong style="color:var(--green)">${r.totalPoints}</strong></td></tr>`).join('')}
                </tbody></table></div>
            <div class="f1-card" style="grid-column:1/-1"><h3>Year-by-Year Top 3</h3>
                <table class="f1-standings"><thead><tr><th>Año</th><th>Oro</th><th>Plata</th><th>Bronce</th></tr></thead><tbody>
                    ${yearlyPodiumRows.map(row => `<tr><td><strong>${row.year}</strong></td><td>${row.gold ? `${esc(row.gold.name)}${row.gold.subtitle ? `<div style="font-size:0.7rem;color:var(--text-muted);">${esc(row.gold.subtitle)}</div>` : ''}` : '—'}</td><td>${row.silver ? `${esc(row.silver.name)}${row.silver.subtitle ? `<div style="font-size:0.7rem;color:var(--text-muted);">${esc(row.silver.subtitle)}</div>` : ''}` : '—'}</td><td>${row.bronze ? `${esc(row.bronze.name)}${row.bronze.subtitle ? `<div style="font-size:0.7rem;color:var(--text-muted);">${esc(row.bronze.subtitle)}</div>` : ''}` : '—'}</td></tr>`).join('')}
                </tbody></table></div>
        </div>`;

    renderF1WeekDetails(stats, f1WeekIndex, f1WeekSort);
    renderF1Evolution(stats);

    document.getElementById('f1-mode')?.addEventListener('change', (e) => { f1Mode = e.target.value; renderF1Tab(); });
    document.getElementById('f1-year')?.addEventListener('change', (e) => { f1Year = parseInt(e.target.value, 10); renderF1Tab(); });
    document.getElementById('f1-week-selector')?.addEventListener('change', (e) => { f1WeekIndex = parseInt(e.target.value, 10); renderF1Tab(); });
    document.getElementById('f1-week-prev')?.addEventListener('click', () => { const r = resolveF1WeekIndex(stats.weekly.length, f1WeekIndex); if (r <= 0) return; f1WeekIndex = r - 1; renderF1Tab(); });
    document.getElementById('f1-week-next')?.addEventListener('click', () => { const r = resolveF1WeekIndex(stats.weekly.length, f1WeekIndex); if (r >= stats.weekly.length - 1) return; const next = r + 1; f1WeekIndex = next === stats.weekly.length - 1 ? -1 : next; renderF1Tab(); });

    container.querySelectorAll('#f1EvolutionControls .timeline-btn').forEach(btn => {
        btn.addEventListener('click', () => { f1EvolutionUnit = btn.dataset.unit || 'month'; container.querySelectorAll('#f1EvolutionControls .timeline-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); renderF1Evolution(stats); });
    });

    container.querySelectorAll('.f1-sortable-th').forEach(th => {
        th.addEventListener('click', () => {
            const table = th.dataset.f1Table, key = th.dataset.sortKey;
            const toggle = (state, nextKey) => ({ key: nextKey, dir: state.key === nextKey ? (state.dir === 'asc' ? 'desc' : 'asc') : 'desc' });
            if (table === 'standings') { f1StandingsSort = toggle(f1StandingsSort, key); renderF1Tab(); }
            else if (table === 'alltime') { f1AllTimeSort = toggle(f1AllTimeSort, key); renderF1Tab(); }
            else if (table === 'week') { f1WeekSort = { key, dir: f1WeekSort.key === key ? (f1WeekSort.dir === 'asc' ? 'desc' : 'asc') : 'desc' }; renderF1WeekDetails(stats, f1WeekIndex, f1WeekSort); }
        });
    });
}

function renderF1Evolution(stats) {
    const evolution = stats?.evolution?.[f1EvolutionUnit] || stats?.evolution?.month;
    if (!evolution) return;
    charts.renderF1EvolutionChart(evolution.labels, evolution.series);
}

function resolveF1WeekIndex(totalWeeks, weekIdx) {
    if (!totalWeeks) return -1;
    if (weekIdx === -1) return totalWeeks - 1;
    return Math.max(0, Math.min(totalWeeks - 1, weekIdx));
}

function renderF1WeekDetails(stats, weekIdx, sortState = { key: 'rank', dir: 'asc' }) {
    const container = document.getElementById('f1-week-details');
    if (!container) return;
    const resolvedWeekIdx = resolveF1WeekIndex(stats.weekly.length, weekIdx);
    const targetWeek = stats.weekly[resolvedWeekIdx];
    if (!targetWeek) return;

    const weekLabel = resolvedWeekIdx === stats.weekly.length - 1 ? '(Latest)' : `(Week ${resolvedWeekIdx + 1})`;
    const rows = [...targetWeek.topWeek.slice(0, 10)].sort((a, b) => {
        const dir = sortState.dir === 'asc' ? 1 : -1;
        const av = sortState.key === 'name' ? String(a.name || '').toLowerCase() : Number(a[sortState.key] ?? 0);
        const bv = sortState.key === 'name' ? String(b.name || '').toLowerCase() : Number(b[sortState.key] ?? 0);
        if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * dir;
        return (av - bv) * dir;
    });

    const weekSortMark = (key) => sortState.key === key ? (sortState.dir === 'asc' ? ' ▲' : ' ▼') : '';

    container.innerHTML = `
        <div style="padding:0.8rem;margin-bottom:1rem;background:rgba(29,185,84,0.08);border-radius:var(--radius);text-align:center;">
            <div style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Week of <strong style="color:var(--green);font-size:1rem">${targetWeek.weekStart}</strong> ${weekLabel}</div>
        </div>
        <table class="f1-standings f1-standings-week"><thead><tr>
            <th class="f1-sortable-th" data-f1-table="week" data-sort-key="rank">#${weekSortMark('rank')}</th>
            <th class="f1-sortable-th" data-f1-table="week" data-sort-key="name">Name${weekSortMark('name')}</th>
            <th class="f1-sortable-th" data-f1-table="week" data-sort-key="minutes">Minutes${weekSortMark('minutes')}</th>
            <th class="f1-sortable-th" data-f1-table="week" data-sort-key="plays">Plays${weekSortMark('plays')}</th>
            <th class="f1-sortable-th" data-f1-table="week" data-sort-key="weightedScore">50/50 Score${weekSortMark('weightedScore')}</th>
            <th class="f1-sortable-th" data-f1-table="week" data-sort-key="basePoints">Base Pts${weekSortMark('basePoints')}</th>
            <th class="f1-sortable-th" data-f1-table="week" data-sort-key="bonusPoints">⚡ Bonus${weekSortMark('bonusPoints')}</th>
            <th class="f1-sortable-th" data-f1-table="week" data-sort-key="points">Total${weekSortMark('points')}</th>
        </tr></thead><tbody>
            ${rows.map(r => `<tr><td><strong>${r.rank}</strong></td><td>${r.fastestLap ? '⚡ ' : ''}${esc(r.name)}${r.subtitle ? `<div style="font-size:0.7rem;color:var(--text-muted)">${esc(r.subtitle)}</div>` : ''}</td><td>${r.minutes}</td><td>${r.plays}</td><td>${r.weightedScore.toFixed(3)}</td><td>${r.basePoints}</td><td class="${r.bonusPoints > 0 ? 'f1-bonus' : ''}">${r.bonusPoints > 0 ? '+' + r.bonusPoints : '—'}</td><td><strong style="color:var(--green)">${r.points}</strong></td></tr>`).join('')}
        </tbody></table>`;
}
