// js/ui.js — All rendering logic

import * as store from './store.js';
import * as charts from './charts.js';
import { openDetail } from './detail.js';

let currentTimelineUnit = 'week';
let currentSkipTrendUnit = 'week';

// F1 state
let f1Mode = 'artists';
let f1Year = null;
let f1WeekIndex = -1;
let f1EvolutionUnit = 'month';
let f1StandingsSort = { key: 'points', dir: 'desc' };
let f1AllTimeSort = { key: 'totalPoints', dir: 'desc' };
let f1YearlySort = { key: 'points', dir: 'desc' };
let f1WeekSort = { key: 'rank', dir: 'asc' };

// KPI state
let topTracksN = 10;
let topArtistsN = 10;
let topAlbumsN = 10;
let tracksSortBy = 'plays';
let artistsSortBy = 'plays';
let albumsSortBy = 'plays';

// Compare tab state
let compareArtistA = '';
let compareArtistB = '';

// Viewer state
let viewerChartInstance = null;
let viewerPlaybackTimer = null;
let viewerPlaybackStep = 0;
let viewerSeries = null;
let viewerColorKeyToIdx = new Map();
let viewerColorNextIdx = 0;
let viewerState = {
    entityType: 'artist',
    metric: 'minutes',
    valueMode: 'accum',
    rollingWindow: 4,
    granularity: 'month',
    chartType: 'line',
    lockCamera: true,
    speedMs: 450,
    topX: 8,
    fromDate: '',
    toDate: '',
};

// ─────────────────────────────────────────────
//  MAIN ENTRY POINT
// ─────────────────────────────────────────────

export function renderUI() {
    const data = window.spotifyData.filtered;
    const full = window.spotifyData.full;

    renderKPIs(data);
    renderTopLists(data);
    updateTimelineChart();
    setupTimelineControls();
    setupTopNControls();

    renderTrends(data);
    renderWrappedContent();
}

// ─────────────────────────────────────────────
//  KPIs
// ─────────────────────────────────────────────

function renderKPIs(data) {
    const k = store.calculateGlobalKPIs(data);
    const grid = document.getElementById('kpi-grid');
    if (!grid) return;

    const fmt = n => Number(n).toLocaleString();

    grid.innerHTML = `
        <div class="kpi-card">
            <div class="kpi-icon">⏱</div>
            <h4>Total Hours</h4>
            <div class="kpi-value">${fmt(k.totalHours)}</div>
            <div class="kpi-sub">${fmt(k.totalDays)} full days</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-icon">▶</div>
            <h4>Total Plays</h4>
            <div class="kpi-value">${fmt(k.totalPlays)}</div>
            <div class="kpi-sub">${fmt(k.totalMinutes)} minutes</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-icon">🎵</div>
            <h4>Unique Tracks</h4>
            <div class="kpi-value">${fmt(k.uniqueTracks)}</div>
            <div class="kpi-sub">across ${fmt(k.uniqueAlbums)} albums</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-icon">🎤</div>
            <h4>Unique Artists</h4>
            <div class="kpi-value">${fmt(k.uniqueArtists)}</div>
            <div class="kpi-sub">artists discovered</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-icon">📅</div>
            <h4>Active Days</h4>
            <div class="kpi-value">${fmt(k.activeDays)}</div>
            <div class="kpi-sub">${fmt(k.avgPerDay)} min/day avg</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-icon">⏭</div>
            <h4>Skip Rate</h4>
            <div class="kpi-value">${k.skipRate}%</div>
            <div class="kpi-sub">${fmt(k.skipped)} skipped plays</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-icon">🏆</div>
            <h4>Best Day Ever</h4>
            <div class="kpi-value">${fmt(k.maxDayMinutes)}</div>
            <div class="kpi-sub">min on ${k.maxDay || '—'}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-icon">📆</div>
            <h4>Time Span</h4>
            <div class="kpi-value">${k.years ? k.years.length : '?'}</div>
            <div class="kpi-sub">years of data</div>
        </div>
    `;
}

// ─────────────────────────────────────────────
//  TOP LISTS
// ─────────────────────────────────────────────

function renderTopLists(data) {
    const tracks = store.calculateTopItems(data, 'trackName', tracksSortBy, topTracksN);
    const artists = store.calculateTopItems(data, 'artistName', artistsSortBy, topArtistsN);
    const albums = store.calculateTopItems(data, 'albumName', albumsSortBy, topAlbumsN);

    renderTopListInto('top-tracks-table', tracks, 'track', tracksSortBy);
    renderTopListInto('top-artists-table', artists, 'artist', artistsSortBy);
    renderTopListInto('top-albums-table', albums, 'album', albumsSortBy);
}

function renderTopListInto(containerId, items, type, sortBy) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!items.length) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem">No data</p>'; return; }

    const maxVal = items[0][sortBy] || 1;

    el.innerHTML = items.map((item, i) => {
        const mainVal = sortBy === 'minutes'
            ? `${item.minutes.toLocaleString()} min`
            : sortBy === 'points'
                ? `${item.points.toLocaleString()} pts`
                : `${item.plays.toLocaleString()} plays`;
        const subVal = sortBy === 'minutes'
            ? `${item.plays.toLocaleString()} plays · ${item.points.toLocaleString()} pts`
            : sortBy === 'points'
                ? `${item.plays.toLocaleString()} plays · ${item.minutes.toLocaleString()} min`
                : `${item.minutes.toLocaleString()} min · ${item.points.toLocaleString()} pts`;
        const pct = Math.round((item[sortBy] / maxVal) * 100);

        let sub = '';
        if (type === 'track') sub = item.artistName || '';
        if (type === 'album') sub = item.artistName || '';

        const nameAttr = item.name.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const extraAttr = (type !== 'artist' ? (item.artistName || '') : '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        return `<div class="top-item" 
                    data-type="${type}" 
                    data-name="${nameAttr}"
                    data-extra="${extraAttr}"
                    title="Click to explore ${item.name}">
            <span class="rank">${i + 1}</span>
            <div class="item-details">
                <div class="item-name">${esc(item.name)}</div>
                ${sub ? `<div class="item-sub">${esc(sub)}</div>` : ''}
            </div>
            <div class="item-bar-wrap"><div class="item-bar" style="width:${pct}%"></div></div>
            <div class="item-metrics">
                <div class="item-metric-main">${mainVal}</div>
                <div class="item-metric-sub">${subVal}</div>
            </div>
        </div>`;
    }).join('');

    // Click handlers to open detail modal
    el.querySelectorAll('.top-item').forEach(row => {
        row.addEventListener('click', () => {
            const name = row.dataset.name;
            const rowType = row.dataset.type;
            const extra = row.dataset.extra;
            openDetail(name, rowType, extra, window.spotifyData.full);
        });
    });
}

// ─────────────────────────────────────────────
//  TIMELINE
// ─────────────────────────────────────────────

function updateTimelineChart() {
    const data = store.calculateAggregatedTimeline(window.spotifyData.filtered, currentTimelineUnit);
    charts.renderTimelineChart(data, currentTimelineUnit);
}

function setupTimelineControls() {
    document.querySelectorAll('.time-agg-btn').forEach(btn => {
        const clone = btn.cloneNode(true);
        btn.replaceWith(clone);
    });
    document.querySelectorAll('.time-agg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentTimelineUnit = btn.dataset.unit;
            document.querySelectorAll('.time-agg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateTimelineChart();
        });
    });
}

// ─────────────────────────────────────────────
//  TOP-N CONTROLS
// ─────────────────────────────────────────────

function setupTopNControls() {
    setupTopNFor('top-tracks-table', 'tracks', n => { topTracksN = n; renderTopLists(window.spotifyData.filtered); });
    setupTopNFor('top-artists-table', 'artists', n => { topArtistsN = n; renderTopLists(window.spotifyData.filtered); });
    setupTopNFor('top-albums-table', 'albums', n => { topAlbumsN = n; renderTopLists(window.spotifyData.filtered); });

    // Sort-by selects
    setupSortSelect('tracks-sort-by', v => { tracksSortBy = v; renderTopLists(window.spotifyData.filtered); });
    setupSortSelect('artists-sort-by', v => { artistsSortBy = v; renderTopLists(window.spotifyData.filtered); });
    setupSortSelect('albums-sort-by', v => { albumsSortBy = v; renderTopLists(window.spotifyData.filtered); });
}

function setupTopNFor(tableId, prefix, onChange) {
    const card = document.getElementById(tableId)?.closest('.chart-container');
    if (!card) return;
    card.querySelectorAll('.top-n-btn').forEach(btn => {
        const clone = btn.cloneNode(true);
        btn.replaceWith(clone);
    });
    card.querySelectorAll('.top-n-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            card.querySelectorAll('.top-n-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            onChange(parseInt(btn.dataset.n));
        });
    });
}

function setupSortSelect(selectId, onChange) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const clone = sel.cloneNode(true);
    sel.replaceWith(clone);
    document.getElementById(selectId).addEventListener('change', e => onChange(e.target.value));
}

// ─────────────────────────────────────────────
//  TRENDS TAB
// ─────────────────────────────────────────────

function renderTrends(data) {
    charts.renderListeningClockChart(store.calculateTemporalDistribution(data, 'hour'));
    charts.renderDayOfWeekChart(store.calculateTemporalDistribution(data, 'weekday'));
    charts.renderMonthlyChart(store.calculateTemporalDistribution(data, 'month'));
    charts.renderSeasonChart(store.calculateSeasonDistribution(data));
    charts.renderDistributionChart('reason-start-chart', store.calculateDistributionPercent(data, 'reasonStart').slice(0, 8), 'Start Reason');
    charts.renderDistributionChart('reason-end-chart', store.calculateDistributionPercent(data, 'reasonEnd').slice(0, 8), 'End Reason');
    charts.renderDistributionChart('platform-chart', store.calculateDistributionPercent(data, 'platform').slice(0, 6), 'Platform');
    charts.renderBarChart('country-chart', store.calculateDistributionPercent(data, 'country').slice(0, 15), 'Country');
    charts.renderYearlyChart(store.calculateTemporalDistribution(data, 'year'));
    setupSkipRateTrendControls();
    charts.renderSkipRateTrendChart(store.calculateSkipRateTrend(data, currentSkipTrendUnit), currentSkipTrendUnit);
    charts.renderBubbleChart('weekday-hour-chart', store.calculateWeekdayHourMatrix(data));
}

function setupSkipRateTrendControls() {
    const container = document.getElementById('globalSkipTrendControls');
    if (!container) return;

    container.innerHTML = '';
    ['day', 'week', 'month', 'year'].forEach(unit => {
        const btn = document.createElement('button');
        btn.textContent = unit.charAt(0).toUpperCase() + unit.slice(1);
        btn.className = `timeline-btn ${unit === currentSkipTrendUnit ? 'active' : ''}`;
        btn.addEventListener('click', () => {
            currentSkipTrendUnit = unit;
            container.querySelectorAll('.timeline-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            charts.renderSkipRateTrendChart(
                store.calculateSkipRateTrend(window.spotifyData.filtered, currentSkipTrendUnit),
                currentSkipTrendUnit
            );
        });
        container.appendChild(btn);
    });
}

// ─────────────────────────────────────────────
//  STREAKS TAB
// ─────────────────────────────────────────────

export function renderStreaksTab() {
    const data = window.spotifyData.filtered;
    const container = document.getElementById('streaks-content');
    if (!container) return;

    const streaks = store.calculateListeningStreaks(data);
    const artistStreaks = store.calculateArtistDailyStreaks(data);
    const best = store.calculateBestPeriods(data);
    const calData = store.buildCalendarData(data);

    const heroHtml = `
        <div class="streaks-hero">
            <div class="streak-card">
                <div class="sc-icon">🔥</div>
                <div class="sc-value">${streaks.longest}</div>
                <div class="sc-label">Longest Streak</div>
                <div class="sc-dates">${streaks.longestStart || ''} → ${streaks.longestEnd || ''}</div>
            </div>
            <div class="streak-card">
                <div class="sc-icon">⚡</div>
                <div class="sc-value">${streaks.current}</div>
                <div class="sc-label">Current Streak</div>
                <div class="sc-dates">${streaks.current > 0 ? 'Keep it up!' : 'Start today!'}</div>
            </div>
            <div class="streak-card">
                <div class="sc-icon">🗓</div>
                <div class="sc-value">${best.bestDay ? best.bestDay.minutes : 0}</div>
                <div class="sc-label">Best Day (min)</div>
                <div class="sc-dates">${best.bestDay ? best.bestDay.date : '—'}</div>
            </div>
            <div class="streak-card">
                <div class="sc-icon">📅</div>
                <div class="sc-value">${best.bestWeek ? best.bestWeek.minutes : 0}</div>
                <div class="sc-label">Best Week (min)</div>
                <div class="sc-dates">${best.bestWeek ? best.bestWeek.date : '—'}</div>
            </div>
            <div class="streak-card">
                <div class="sc-icon">🌟</div>
                <div class="sc-value">${best.bestMonth ? best.bestMonth.minutes : 0}</div>
                <div class="sc-label">Best Month (min)</div>
                <div class="sc-dates">${best.bestMonth ? best.bestMonth.date : '—'}</div>
            </div>
            <div class="streak-card">
                <div class="sc-icon">🏆</div>
                <div class="sc-value">${best.bestYear ? best.bestYear.minutes : 0}</div>
                <div class="sc-label">Best Year (min)</div>
                <div class="sc-dates">${best.bestYear ? best.bestYear.year : '—'}</div>
            </div>
        </div>
    `;

    const calHtml = buildCalendarHeatmap(calData);

    const artistStreakHtml = `
        <div class="streak-list-grid">
            <div class="streak-list-card">
                <h4>🎤 Longest Artist Streaks (consecutive days)</h4>
                ${artistStreaks.slice(0, 15).map((a, i) => `
                    <div class="streak-row">
                        <span class="sr-rank">${i + 1}</span>
                        <span class="sr-name">${esc(a.artist)}</span>
                        <span class="sr-val">${a.streak} days</span>
                        <span class="sr-dates" style="font-size:0.7rem;color:var(--text-muted)">${a.from} → ${a.to}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    container.innerHTML = heroHtml + calHtml + artistStreakHtml;
}

function buildCalendarHeatmap(calData) {
    // Build a full-year calendar, most recent 52 weeks
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allDates = Object.keys(calData).sort();
    if (!allDates.length) return '<p style="color:var(--text-muted)">No data</p>';

    const firstDate = new Date(allDates[0]);
    const lastDate = new Date(allDates[allDates.length - 1]);

    // Generate week columns from firstDate to lastDate
    // Adjust to start on Monday
    const startMonday = new Date(firstDate);
    startMonday.setDate(firstDate.getDate() - ((firstDate.getDay() + 6) % 7));

    const values = Object.values(calData).filter(v => v > 0);
    const maxVal = Math.max(...values, 1);
    const p33 = maxVal * 0.2, p66 = maxVal * 0.4, p80 = maxVal * 0.65, p95 = maxVal * 0.85;

    const weeks = [];
    let current = new Date(startMonday);
    const end = new Date(lastDate);
    end.setDate(end.getDate() + (6 - (end.getDay() + 6) % 7)); // end of last week

    let currentMo = -1;
    const monthLabels = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    while (current <= end) {
        const weekDays = [];
        for (let d = 0; d < 7; d++) {
            const dateStr = current.toISOString().split('T')[0];
            const mins = calData[dateStr] || 0;
            let level = 0;
            if (mins > 0) {
                if (mins > p95) level = 5;
                else if (mins > p80) level = 4;
                else if (mins > p66) level = 3;
                else if (mins > p33) level = 2;
                else level = 1;
            }
            const tooltip = mins > 0 ? `${dateStr}: ${Math.round(mins)} min` : dateStr;
            weekDays.push(`<div class="heatmap-cell ${level > 0 ? 'l' + level : ''}" title="${tooltip}"></div>`);
            current.setDate(current.getDate() + 1);
        }

        const weekMo = new Date(current.getTime() - 86400000 * 7).getMonth();
        if (weekMo !== currentMo) {
            currentMo = weekMo;
            monthLabels.push(monthNames[weekMo]);
        } else {
            monthLabels.push('');
        }

        weeks.push(`<div class="heatmap-col">${weekDays.join('')}</div>`);
    }

    const monthRow = monthLabels.map(m => `<span style="min-width:15px;display:inline-block">${m}</span>`).join('');

    return `
        <div class="heatmap-section">
            <h3>Listening Calendar</h3>
            <div class="calendar-heatmap">
                <div class="heatmap-months">${monthRow}</div>
                <div class="heatmap-grid">${weeks.join('')}</div>
                <div class="heatmap-legend">
                    Less
                    <div class="heatmap-cell"></div>
                    <div class="heatmap-cell l1"></div>
                    <div class="heatmap-cell l2"></div>
                    <div class="heatmap-cell l3"></div>
                    <div class="heatmap-cell l4"></div>
                    <div class="heatmap-cell l5"></div>
                    More
                </div>
            </div>
        </div>
    `;
}

// ─────────────────────────────────────────────
//  DEEP DIVE TAB
// ─────────────────────────────────────────────

export function renderDeepDiveTab() {
    const data = window.spotifyData.filtered;
    const container = document.getElementById('deepdive-content');
    if (!container) return;

    const ins = store.calculateDeepInsights(data);

    const timeLabels = { morning: '🌅 Morning Person', afternoon: '☀️ Afternoon Listener', evening: '🌆 Evening Listener', night: '🌙 Night Owl' };
    const timeDesc = { morning: 'Most of your listening happens in the morning (6–12).', afternoon: 'Most of your listening happens in the afternoon (12–18).', evening: 'Most of your listening happens in the evening (18–midnight).', night: 'You listen mostly late at night (midnight–6).' };

    const totalTime = Object.values(ins.timeMap).reduce((a, b) => a + b, 0) || 1;

    container.innerHTML = `<div class="deepdive-grid">

        <!-- Personality -->
        <div class="insight-card">
            <h4><span class="ic-icon">🧠</span> Your Listening Personality</h4>
            <div class="personality-tag">${timeLabels[ins.dominantTime] || 'Music Lover'}</div>
            <p class="insight-desc">${timeDesc[ins.dominantTime] || ''}</p>
            <div style="margin-top:1rem">
                ${Object.entries(ins.timeMap).map(([t, min]) => `
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;font-size:0.82rem">
                        <span style="min-width:90px;color:var(--text-muted)">${t}</span>
                        <div style="flex:1;background:var(--gray);border-radius:3px;height:6px;overflow:hidden">
                            <div style="width:${Math.round((min / totalTime) * 100)}%;height:100%;background:var(--green);border-radius:3px"></div>
                        </div>
                        <span style="min-width:40px;text-align:right;font-weight:700">${Math.round(min / 60)}h</span>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- Loyal artists -->
        <div class="insight-card">
            <h4><span class="ic-icon">💚</span> Most Loyal Artists</h4>
            <p class="insight-desc">Artists you've listened to across the most different years.</p>
            <ul class="insight-list">
                ${ins.loyalArtists.slice(0, 10).map((a, i) => `
                    <li data-detail-type="artist" data-detail-name="${a.artist.replace(/"/g, '&quot;')}">
                        <span class="il-rank">${i + 1}</span>
                        <span class="il-name">${esc(a.artist)}</span>
                        <span class="il-val">${a.years} years</span>
                    </li>
                `).join('')}
            </ul>
        </div>

        <!-- Hidden gems -->
        <div class="insight-card">
            <h4><span class="ic-icon">💎</span> Hidden Gems</h4>
            <p class="insight-desc">Tracks you play often in short bursts — your real favourites.</p>
            <ul class="insight-list">
                ${ins.hiddenGems.slice(0, 10).map((t, i) => `
                    <li data-detail-type="track" data-detail-name="${t.name.replace(/"/g, '&quot;')}" data-detail-extra="${(t.artist || '').replace(/"/g, '&quot;')}">
                        <span class="il-rank">${i + 1}</span>
                        <span class="il-name">${esc(t.name)}</span>
                        <span class="il-val">${t.plays} plays</span>
                    </li>
                `).join('')}
            </ul>
        </div>

        <!-- Most abandoned -->
        <div class="insight-card">
            <h4><span class="ic-icon">⏭</span> Most Skipped Tracks</h4>
            <p class="insight-desc">You keep playing these but rarely finish them.</p>
            <ul class="insight-list">
                ${ins.abandonedTracks.slice(0, 10).map((t, i) => `
                    <li data-detail-type="track" data-detail-name="${t.name.replace(/"/g, '&quot;')}" data-detail-extra="${(t.artist || '').replace(/"/g, '&quot;')}">
                        <span class="il-rank">${i + 1}</span>
                        <span class="il-name">${esc(t.name)}</span>
                        <span class="il-val">${t.skipRate}% skipped</span>
                    </li>
                `).join('')}
            </ul>
        </div>

        <!-- Replay kings -->
        <div class="insight-card">
            <h4><span class="ic-icon">🔁</span> Replay Kings</h4>
            <p class="insight-desc">Songs you played 3+ times in a single day.</p>
            <ul class="insight-list">
                ${ins.replayKings.slice(0, 10).map((r, i) => `
                    <li data-detail-type="track" data-detail-name="${r.track.replace(/"/g, '&quot;')}" data-detail-extra="${(r.artist || '').replace(/"/g, '&quot;')}">
                        <span class="il-rank">${i + 1}</span>
                        <span class="il-name">${esc(r.track)}</span>
                        <span class="il-val">${r.count}x on ${r.date}</span>
                    </li>
                `).join('')}
            </ul>
        </div>

        <!-- One-hit wonders -->
        <div class="insight-card">
            <h4><span class="ic-icon">🎯</span> One-Track Artists</h4>
            <p class="insight-desc">Artists where you've only heard one track.</p>
            <ul class="insight-list">
                ${ins.oneHitWonders.slice(0, 10).map((o, i) => `
                    <li>
                        <span class="il-rank">${i + 1}</span>
                        <span class="il-name">${esc(o.artist)}</span>
                        <span class="il-val" style="font-size:0.75rem;color:var(--text-muted)">${esc(o.track)}</span>
                    </li>
                `).join('')}
            </ul>
        </div>

        <!-- Most played days -->
        <div class="insight-card">
            <h4><span class="ic-icon">🎉</span> Biggest Listening Days</h4>
            <p class="insight-desc">The days with the most track plays ever.</p>
            <ul class="insight-list">
                ${ins.topPlayDays.map((d, i) => `
                    <li>
                        <span class="il-rank">${i + 1}</span>
                        <span class="il-name">${d.date}</span>
                        <span class="il-val">${d.plays} plays</span>
                    </li>
                `).join('')}
            </ul>
        </div>

        <!-- Artist diversity over time -->
        <div class="insight-card" style="grid-column:1/-1">
            <h4><span class="ic-icon">📊</span> Artist Diversity Over Time</h4>
            <p class="insight-desc">How many unique artists you listened to each year.</p>
            <div style="margin-top:1rem">
                ${(() => {
            const max = Math.max(...ins.diversityByYear.map(d => d.uniqueArtists), 1);
            return ins.diversityByYear.map(d => `
                        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.6rem;font-size:0.85rem">
                            <span style="min-width:45px;font-weight:700;color:var(--text-muted)">${d.year}</span>
                            <div style="flex:1;background:var(--gray);border-radius:3px;height:8px;overflow:hidden">
                                <div style="width:${Math.round((d.uniqueArtists / max) * 100)}%;height:100%;background:#17A2B8;border-radius:3px"></div>
                            </div>
                            <span style="min-width:80px;font-weight:700">${d.uniqueArtists} artists</span>
                        </div>
                    `).join('');
        })()}
            </div>
        </div>

    </div>`;

    // Wire up click-to-detail
    container.querySelectorAll('[data-detail-type]').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
            const type = el.dataset.detailType;
            const name = el.dataset.detailName;
            const extra = el.dataset.detailExtra || '';
            openDetail(name, type, extra, window.spotifyData.full);
        });
    });
}

// ─────────────────────────────────────────────
//  COMPARE TAB
// ─────────────────────────────────────────────

export function renderCompareTab() {
    const container = document.getElementById('compare-content');
    if (!container) return;

    const data = (window.spotifyData?.filtered || []).filter(d => !d.isPodcast && d.trackName);
    if (!data.length) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:1rem">No music data available for comparison.</p>';
        return;
    }

    const artistCounts = {};
    data.forEach(d => {
        if (!d.artistName) return;
        artistCounts[d.artistName] = (artistCounts[d.artistName] || 0) + 1;
    });

    const artists = Object.entries(artistCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name);

    if (!compareArtistA || !artists.includes(compareArtistA)) compareArtistA = artists[0] || '';
    if (!compareArtistB || !artists.includes(compareArtistB) || compareArtistB === compareArtistA) {
        compareArtistB = artists.find(a => a !== compareArtistA) || artists[0] || '';
    }

    if (!compareArtistA || !compareArtistB || compareArtistA === compareArtistB) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:1rem">Need at least two artists with data to compare.</p>';
        return;
    }

    const cmp = store.calculateArtistComparison(data, compareArtistA, compareArtistB);
    if (!cmp) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:1rem">Comparison could not be generated with current filters.</p>';
        return;
    }

    const winnerLabel = cmp.winner === 'A' ? cmp.artistA : cmp.winner === 'B' ? cmp.artistB : 'Tie';
    const winnerClass = cmp.winner === 'A' ? 'compare-winner-a' : cmp.winner === 'B' ? 'compare-winner-b' : 'compare-winner-tie';

    const optionHtml = artists
        .slice(0, 300)
        .map(name => `<option value="${esc(name)}">${esc(name)}</option>`)
        .join('');

    const scoreRows = cmp.scorecard.map(row => {
        const aVal = typeof row.a === 'number' ? row.a.toLocaleString() : row.a;
        const bVal = typeof row.b === 'number' ? row.b.toLocaleString() : row.b;
        let verdict = 'Draw';
        if (row.a !== row.b) {
            if (row.higherWins) verdict = row.a > row.b ? cmp.artistA : cmp.artistB;
            else verdict = row.a < row.b ? cmp.artistA : cmp.artistB;
        }
        return `<tr>
            <td>${esc(row.label)}</td>
            <td>${aVal}</td>
            <td>${bVal}</td>
            <td>${esc(verdict)}</td>
        </tr>`;
    }).join('');

    const weeklyRows = cmp.duel.weekly
        .slice()
        .reverse()
        .slice(0, 24)
        .map(w => `<tr>
            <td>${w.week}</td>
            <td>${w.aMinutes}</td>
            <td>${w.bMinutes}</td>
            <td>${w.winner === 'A' ? esc(cmp.artistA) : w.winner === 'B' ? esc(cmp.artistB) : 'Tie'}</td>
        </tr>`).join('');

    container.innerHTML = `
        <div class="compare-header">
            <div class="compare-selectors">
                <div class="compare-control">
                    <label for="compare-artist-a">Artist A</label>
                    <select id="compare-artist-a">${optionHtml}</select>
                </div>
                <div class="compare-control">
                    <label for="compare-artist-b">Artist B</label>
                    <select id="compare-artist-b">${optionHtml}</select>
                </div>
                <button id="compare-swap-btn" class="secondary-btn">Swap</button>
            </div>
            <div class="compare-hero ${winnerClass}">
                <div class="compare-hero-title">Exhaustive Head-to-Head Winner</div>
                <div class="compare-hero-value">${esc(winnerLabel)}</div>
                <div class="compare-hero-sub">${cmp.winsByMetrics.A} metrics won by ${esc(cmp.artistA)} · ${cmp.winsByMetrics.B} by ${esc(cmp.artistB)} · ${cmp.winsByMetrics.draws} draws</div>
            </div>
        </div>

        <div class="compare-kpi-grid">
            ${buildCompareKpiCard(cmp.artistA, cmp.summaryA, cmp.duel.pointsA, cmp.duel.winsA)}
            ${buildCompareKpiCard(cmp.artistB, cmp.summaryB, cmp.duel.pointsB, cmp.duel.winsB)}
        </div>

        <div class="charts-grid">
            <div class="chart-container full-width">
                <h3>Cumulative Listening Race</h3>
                <div class="chart-wrapper"><canvas id="compare-race-chart"></canvas></div>
            </div>
            <div class="chart-container">
                <h3>Monthly Trend (Minutes)</h3>
                <div class="chart-wrapper"><canvas id="compare-monthly-chart"></canvas></div>
            </div>
            <div class="chart-container">
                <h3>Hour of Day Profile</h3>
                <div class="chart-wrapper"><canvas id="compare-hour-chart"></canvas></div>
            </div>
            <div class="chart-container">
                <h3>Weekday Profile</h3>
                <div class="chart-wrapper"><canvas id="compare-weekday-chart"></canvas></div>
            </div>
            <div class="chart-container">
                <h3>Time of Day Segments</h3>
                <div class="chart-wrapper"><canvas id="compare-daypart-chart"></canvas></div>
            </div>
            <div class="chart-container full-width">
                <h3>Device / Platform Comparison</h3>
                <div class="chart-wrapper"><canvas id="compare-platform-chart"></canvas></div>
            </div>
            <div class="chart-container">
                <h3>Session Distribution (Violin-like)</h3>
                <div class="chart-wrapper"><canvas id="compare-session-chart"></canvas></div>
            </div>
            <div class="chart-container">
                <h3>Catalog Overlap</h3>
                <div class="compare-overlap-grid">
                    <div class="compare-overlap-card"><span>Shared tracks</span><strong>${cmp.overlap.sharedTracks}</strong></div>
                    <div class="compare-overlap-card"><span>Shared albums</span><strong>${cmp.overlap.sharedAlbums}</strong></div>
                    <div class="compare-overlap-card"><span>Only ${esc(cmp.artistA)} tracks</span><strong>${cmp.overlap.onlyATracks}</strong></div>
                    <div class="compare-overlap-card"><span>Only ${esc(cmp.artistB)} tracks</span><strong>${cmp.overlap.onlyBTracks}</strong></div>
                    <div class="compare-overlap-card"><span>Only ${esc(cmp.artistA)} albums</span><strong>${cmp.overlap.onlyAAlbums}</strong></div>
                    <div class="compare-overlap-card"><span>Only ${esc(cmp.artistB)} albums</span><strong>${cmp.overlap.onlyBAlbums}</strong></div>
                </div>
            </div>
            <div class="chart-container full-width">
                <h3>Metric-by-Metric Verdict</h3>
                <div style="overflow:auto">
                    <table class="compare-table">
                        <thead><tr><th>Metric</th><th>${esc(cmp.artistA)}</th><th>${esc(cmp.artistB)}</th><th>Winner</th></tr></thead>
                        <tbody>${scoreRows}</tbody>
                    </table>
                </div>
            </div>
            <div class="chart-container full-width">
                <h3>Weekly Head-to-Head (recent 24 weeks)</h3>
                <div style="overflow:auto">
                    <table class="compare-table">
                        <thead><tr><th>Week</th><th>${esc(cmp.artistA)} min</th><th>${esc(cmp.artistB)} min</th><th>Winner</th></tr></thead>
                        <tbody>${weeklyRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    const selA = container.querySelector('#compare-artist-a');
    const selB = container.querySelector('#compare-artist-b');
    const swapBtn = container.querySelector('#compare-swap-btn');

    if (selA) selA.value = compareArtistA;
    if (selB) selB.value = compareArtistB;

    selA?.addEventListener('change', (e) => {
        compareArtistA = e.target.value;
        if (compareArtistA === compareArtistB) {
            compareArtistB = artists.find(a => a !== compareArtistA) || compareArtistB;
        }
        renderCompareTab();
    });

    selB?.addEventListener('change', (e) => {
        compareArtistB = e.target.value;
        if (compareArtistA === compareArtistB) {
            compareArtistA = artists.find(a => a !== compareArtistB) || compareArtistA;
        }
        renderCompareTab();
    });

    swapBtn?.addEventListener('click', () => {
        const tmp = compareArtistA;
        compareArtistA = compareArtistB;
        compareArtistB = tmp;
        renderCompareTab();
    });

    charts.renderCompareRaceChart('compare-race-chart', cmp.raceLabels, cmp.raceA, cmp.raceB, cmp.artistA, cmp.artistB);
    charts.renderCompareGroupedBar('compare-monthly-chart', cmp.monthlyLabels, cmp.monthlyA, cmp.monthlyB, cmp.artistA, cmp.artistB, 'Minutes');
    charts.renderCompareGroupedBar(
        'compare-hour-chart',
        Array.from({ length: 24 }, (_, i) => String(i)),
        cmp.summaryA.hourMinutes,
        cmp.summaryB.hourMinutes,
        cmp.artistA,
        cmp.artistB,
        'Minutes'
    );
    charts.renderCompareGroupedBar(
        'compare-weekday-chart',
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        cmp.summaryA.weekdayMinutes,
        cmp.summaryB.weekdayMinutes,
        cmp.artistA,
        cmp.artistB,
        'Minutes'
    );
    charts.renderCompareGroupedBar(
        'compare-daypart-chart',
        ['Morning', 'Afternoon', 'Evening', 'Night'],
        [
            cmp.summaryA.timeOfDayMinutes.morning,
            cmp.summaryA.timeOfDayMinutes.afternoon,
            cmp.summaryA.timeOfDayMinutes.evening,
            cmp.summaryA.timeOfDayMinutes.night
        ],
        [
            cmp.summaryB.timeOfDayMinutes.morning,
            cmp.summaryB.timeOfDayMinutes.afternoon,
            cmp.summaryB.timeOfDayMinutes.evening,
            cmp.summaryB.timeOfDayMinutes.night
        ],
        cmp.artistA,
        cmp.artistB,
        'Minutes'
    );
    charts.renderCompareGroupedBar(
        'compare-platform-chart',
        cmp.platformRows.map(r => r.platform),
        cmp.platformRows.map(r => r.aMinutes),
        cmp.platformRows.map(r => r.bMinutes),
        cmp.artistA,
        cmp.artistB,
        'Minutes'
    );
    charts.renderCompareSessionViolinLike(
        'compare-session-chart',
        cmp.artistA,
        cmp.artistB,
        cmp.sessionDistribution.A,
        cmp.sessionDistribution.B
    );
}

function buildCompareKpiCard(artistName, summary, duelPoints, weeklyWins) {
    return `
        <div class="compare-kpi-card">
            <h4>${esc(artistName)}</h4>
            <div class="compare-kpi-list">
                <div><span>Minutes</span><strong>${summary.totalMinutes.toLocaleString()}</strong></div>
                <div><span>Plays</span><strong>${summary.plays.toLocaleString()}</strong></div>
                <div><span>Duel points</span><strong>${duelPoints}</strong></div>
                <div><span>Weekly wins</span><strong>${weeklyWins}</strong></div>
                <div><span>Unique tracks</span><strong>${summary.uniqueTracks}</strong></div>
                <div><span>Unique albums</span><strong>${summary.uniqueAlbums}</strong></div>
                <div><span>Track variety %</span><strong>${summary.varietyTrackPct}%</strong></div>
                <div><span>Album variety %</span><strong>${summary.varietyAlbumPct}%</strong></div>
                <div><span>Skip rate</span><strong>${summary.skipRate}%</strong></div>
                <div><span>Avg min/play</span><strong>${summary.avgMinutesPerPlay}</strong></div>
                <div><span>Avg min/active day</span><strong>${summary.avgMinutesPerActiveDay}</strong></div>
                <div><span>Same-day repeats</span><strong>${summary.repeatedSameDayCount}</strong></div>
            </div>
        </div>
    `;
}

// ─────────────────────────────────────────────
//  F1 CHAMPIONSHIP
// ─────────────────────────────────────────────

export function renderF1Tab() {
    const container = document.getElementById('f1-content');
    if (!container) return;

    const stats = store.calculateF1Championship(window.spotifyData.filtered, f1Mode, f1Year, 25);
    if (!stats) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:1rem">No data available for F1 championship.</p>';
        return;
    }

    f1Year = stats.selectedYear;

    const val = (row, key) => {
        if (key === 'name') return String(row.name || '').toLowerCase();
        return Number(row[key] ?? 0);
    };

    const sortRows = (rows, sortState) => {
        const list = [...rows];
        const dir = sortState.dir === 'asc' ? 1 : -1;
        return list.sort((a, b) => {
            const av = val(a, sortState.key);
            const bv = val(b, sortState.key);
            if (typeof av === 'string' || typeof bv === 'string') {
                return String(av).localeCompare(String(bv)) * dir;
            }
            return (av - bv) * dir;
        });
    };

    const sortedStandings = sortRows(stats.standings, f1StandingsSort);
    const sortedAllTime = sortRows(stats.allTimeList, f1AllTimeSort);
    const yearlyTop3Rows = sortRows(
        stats.yearlyTop3.flatMap(y => y.top3.map((row, idx) => ({ ...row, year: y.year, yearRank: idx + 1 }))),
        f1YearlySort
    );

    const leader = stats.standings[0];
    const second = stats.standings[1];
    const gap = leader && second ? leader.points - second.points : 0;
    const totalMinutes = stats.standings.reduce((s, r) => s + r.minutes, 0);

    // Selector de semana
    const weeks = stats.weekly.slice().reverse().map((w, idx) => ({
        weekStart: w.weekStart,
        label: `Week ${stats.weekly.length - idx}`,
        idx: stats.weekly.length - idx - 1
    }));

    if (f1WeekIndex >= stats.weekly.length) f1WeekIndex = -1;

    const sortMark = (state, key) => state.key === key ? (state.dir === 'asc' ? ' ▲' : ' ▼') : '';

    container.innerHTML = `
        <div class="f1-controls">
            <div>
                <label for="f1-mode">Championship</label>
                <select id="f1-mode">
                    <option value="artists" ${stats.mode === 'artists' ? 'selected' : ''}>Artists</option>
                    <option value="tracks" ${stats.mode === 'tracks' ? 'selected' : ''}>Tracks</option>
                    <option value="albums" ${stats.mode === 'albums' ? 'selected' : ''}>Albums</option>
                </select>
            </div>
            <div>
                <label for="f1-year">Season</label>
                <select id="f1-year">
                    ${stats.years.map(y => `<option value="${y}" ${y === stats.selectedYear ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
            </div>
        </div>

        <details class="f1-help">
            <summary>How this F1 mode works (quick glossary)</summary>
            <div>
                Weekly ranking: every Monday-Sunday week, the Top 10 by listening minutes gets F1 points (25-18-15-12-10-8-6-4-2-1).<br>
                Fast Lap (⚡): +1 bonus point for the biggest single listening session of that week (only if that entry is in the Top 10).<br>
                Wins: number of weeks finishing P1 (1st place).<br>
                Podiums: number of weeks finishing in Top 3.<br>
                Streak Top 10: best run of consecutive weeks appearing in the Top 10.<br>
                Points: base points + Fast Lap bonus.
            </div>
        </details>

        <div class="f1-hero">
            <div class="f1-pill">
                <div class="k">🏆 Leader</div>
                <div class="v">${leader ? esc(leader.name) : '—'}</div>
                <div class="k">${leader?.points || 0} pts</div>
            </div>
            <div class="f1-pill">
                <div class="k">📊 Gap to P2</div>
                <div class="v">${gap}</div>
                <div class="k">${leader?.weeksWon || 0} wins · ${leader?.fastestLaps || 0} ⚡</div>
            </div>
            <div class="f1-pill">
                <div class="k">📈 Total Minutes</div>
                <div class="v">${Math.round(totalMinutes)}</div>
                <div class="k">${Math.round(totalMinutes / stats.standings.length)} avg</div>
            </div>
        </div>

        <div class="f1-grid">
            <div class="f1-card" style="grid-column:1/-1">
                <h3>📅 Evolution</h3>
                <div class="timeline-controls" id="f1EvolutionControls">
                    <button class="timeline-btn ${f1EvolutionUnit === 'month' ? 'active' : ''}" data-unit="month">Month</button>
                    <button class="timeline-btn ${f1EvolutionUnit === 'week' ? 'active' : ''}" data-unit="week">Week</button>
                </div>
                <div style="height:310px"><canvas id="f1-evolution-chart"></canvas></div>
            </div>

            <div class="f1-card" style="grid-column:1/-1">
                <h3>🏁 ${stats.selectedYear} Final Standings</h3>
                <div style="overflow:auto;">
                    <table class="f1-standings f1-standings-detailed f1-podium-highlight">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th class="f1-sortable-th" data-f1-table="standings" data-sort-key="name">Name${sortMark(f1StandingsSort, 'name')}</th>
                                <th class="f1-sortable-th" data-f1-table="standings" data-sort-key="weeksWon">Wins${sortMark(f1StandingsSort, 'weeksWon')}</th>
                                <th class="f1-sortable-th" data-f1-table="standings" data-sort-key="podiums">Podiums${sortMark(f1StandingsSort, 'podiums')}</th>
                                <th class="f1-sortable-th" data-f1-table="standings" data-sort-key="bestWinStreak">Racha Top 10${sortMark(f1StandingsSort, 'bestWinStreak')}</th>
                                <th class="f1-sortable-th" data-f1-table="standings" data-sort-key="fastestLaps">⚡ Fast Laps${sortMark(f1StandingsSort, 'fastestLaps')}</th>
                                <th class="f1-sortable-th" data-f1-table="standings" data-sort-key="minutes">Minutes${sortMark(f1StandingsSort, 'minutes')}</th>
                                <th class="f1-sortable-th" data-f1-table="standings" data-sort-key="points">Points${sortMark(f1StandingsSort, 'points')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedStandings.slice(0, 15).map((r, i) => {
        const pctMin = ((r.minutes / totalMinutes) * 100).toFixed(1);
        return `<tr>
                                    <td><strong>${i + 1}</strong></td>
                                    <td>${esc(r.name)}${r.subtitle ? `<div style="font-size:0.7rem;color:var(--text-muted)">${esc(r.subtitle)}</div>` : ''}</td>
                                    <td><strong>${r.weeksWon}</strong></td>
                                    <td>${r.podiums}</td>
                                    <td>${r.bestWinStreak || 0}</td>
                                    <td>${r.fastestLaps || 0}</td>
                                    <td>${Math.round(r.minutes)}<span style="color:var(--text-muted);font-size:0.8rem"> (${pctMin}%)</span></td>
                                    <td><strong style="color:var(--green)">${r.points}</strong></td>
                                </tr>`;
    }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="f1-card" style="grid-column:1/-1">
                <h3>📋 Top 10 By Week</h3>
                <div style="margin-bottom:1rem;padding:0.8rem;background:rgba(29,185,84,0.08);border-radius:var(--radius);border-left:3px solid var(--green);">
                    <label for="f1-week-selector" style="font-size:0.8rem;color:var(--green);font-weight:600;margin-right:0.5rem;">SELECT WEEK:</label>
                    <select id="f1-week-selector" style="padding:0.5rem 0.8rem;background:var(--gray);color:var(--text);border:1px solid rgba(29,185,84,0.3);border-radius:var(--radius);font-size:0.9rem;cursor:pointer;">
                        <option value="-1">Latest Week</option>
                        ${weeks.map(w => `<option value="${w.idx}">${w.label} (${w.weekStart})</option>`).join('')}
                    </select>
                </div>
                <div id="f1-week-details" style="overflow:auto;">
                    <!-- Populated by JS -->
                </div>
            </div>

            <div class="f1-card" style="grid-column:1/-1">
                <h3>🏆 All-Time Championship Records</h3>
                <table class="f1-standings">
                    <thead>
                        <tr>
                            <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="name">Name${sortMark(f1AllTimeSort, 'name')}</th>
                            <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="golds">Oros${sortMark(f1AllTimeSort, 'golds')}</th>
                            <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="silvers">Platas${sortMark(f1AllTimeSort, 'silvers')}</th>
                            <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="bronzes">Bronces${sortMark(f1AllTimeSort, 'bronzes')}</th>
                            <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="totalWins">Wins${sortMark(f1AllTimeSort, 'totalWins')}</th>
                            <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="totalPodiums">Podiums${sortMark(f1AllTimeSort, 'totalPodiums')}</th>
                            <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="bestWinStreak">Racha Top 10${sortMark(f1AllTimeSort, 'bestWinStreak')}</th>
                            <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="totalFastestLaps">⚡ Fast Laps${sortMark(f1AllTimeSort, 'totalFastestLaps')}</th>
                            <th class="f1-sortable-th" data-f1-table="alltime" data-sort-key="totalPoints">Points${sortMark(f1AllTimeSort, 'totalPoints')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedAllTime.slice(0, 20).map(r => `<tr><td>${esc(r.name)}${r.subtitle ? `<div style="font-size:0.7rem;color:var(--text-muted);">${esc(r.subtitle)}</div>` : ''}</td><td>${r.golds}</td><td>${r.silvers}</td><td>${r.bronzes}</td><td>${r.totalWins}</td><td>${r.totalPodiums}</td><td>${r.bestWinStreak || 0}</td><td>${r.totalFastestLaps}</td><td><strong style="color:var(--green)">${r.totalPoints}</strong></td></tr>`).join('')}
                    </tbody>
                </table>
            </div>

            <div class="f1-card" style="grid-column:1/-1">
                <h3>Year-by-Year Top 3</h3>
                <table class="f1-standings">
                    <thead>
                        <tr>
                            <th class="f1-sortable-th" data-f1-table="yearly" data-sort-key="year">Year${sortMark(f1YearlySort, 'year')}</th>
                            <th class="f1-sortable-th" data-f1-table="yearly" data-sort-key="yearRank">Pos${sortMark(f1YearlySort, 'yearRank')}</th>
                            <th class="f1-sortable-th" data-f1-table="yearly" data-sort-key="name">Name${sortMark(f1YearlySort, 'name')}</th>
                            <th class="f1-sortable-th" data-f1-table="yearly" data-sort-key="weeksWon">Wins${sortMark(f1YearlySort, 'weeksWon')}</th>
                            <th class="f1-sortable-th" data-f1-table="yearly" data-sort-key="podiums">Podiums${sortMark(f1YearlySort, 'podiums')}</th>
                            <th class="f1-sortable-th" data-f1-table="yearly" data-sort-key="bestWinStreak">Racha Top 10${sortMark(f1YearlySort, 'bestWinStreak')}</th>
                            <th class="f1-sortable-th" data-f1-table="yearly" data-sort-key="fastestLaps">⚡ Fast Laps${sortMark(f1YearlySort, 'fastestLaps')}</th>
                            <th class="f1-sortable-th" data-f1-table="yearly" data-sort-key="points">Points${sortMark(f1YearlySort, 'points')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${yearlyTop3Rows.map(row => `<tr><td>${row.year}</td><td>${row.yearRank}</td><td>${esc(row.name)}${row.subtitle ? `<div style="font-size:0.7rem;color:var(--text-muted);">${esc(row.subtitle)}</div>` : ''}</td><td>${row.weeksWon}</td><td>${row.podiums}</td><td>${row.bestWinStreak || 0}</td><td>${row.fastestLaps || 0}</td><td><strong>${row.points}</strong></td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Render week table with selected state
    renderF1WeekDetails(stats, f1WeekIndex, f1WeekSort);
    renderF1Evolution(stats);

    document.getElementById('f1-mode')?.addEventListener('change', (e) => {
        f1Mode = e.target.value;
        renderF1Tab();
    });

    document.getElementById('f1-year')?.addEventListener('change', (e) => {
        f1Year = parseInt(e.target.value, 10);
        renderF1Tab();
    });

    document.getElementById('f1-week-selector')?.addEventListener('change', (e) => {
        f1WeekIndex = parseInt(e.target.value, 10);
        renderF1WeekDetails(stats, f1WeekIndex, f1WeekSort);
    });

    container.querySelectorAll('#f1EvolutionControls .timeline-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            f1EvolutionUnit = btn.dataset.unit || 'month';
            container.querySelectorAll('#f1EvolutionControls .timeline-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderF1Evolution(stats);
        });
    });

    container.querySelectorAll('.f1-sortable-th').forEach(th => {
        th.addEventListener('click', () => {
            const table = th.dataset.f1Table;
            const key = th.dataset.sortKey;
            const toggle = (state, nextKey) => ({
                key: nextKey,
                dir: state.key === nextKey ? (state.dir === 'asc' ? 'desc' : 'asc') : 'desc'
            });

            if (table === 'standings') {
                f1StandingsSort = toggle(f1StandingsSort, key);
                renderF1Tab();
                return;
            }
            if (table === 'alltime') {
                f1AllTimeSort = toggle(f1AllTimeSort, key);
                renderF1Tab();
                return;
            }
            if (table === 'yearly') {
                f1YearlySort = toggle(f1YearlySort, key);
                renderF1Tab();
                return;
            }
            if (table === 'week') {
                f1WeekSort = {
                    key,
                    dir: f1WeekSort.key === key ? (f1WeekSort.dir === 'asc' ? 'desc' : 'asc') : 'desc'
                };
                renderF1WeekDetails(stats, f1WeekIndex, f1WeekSort);
            }
        });
    });
}

function renderF1Evolution(stats) {
    const evolution = stats?.evolution?.[f1EvolutionUnit] || stats?.evolution?.month;
    if (!evolution) return;
    charts.renderF1EvolutionChart(evolution.labels, evolution.series);
}

function renderF1WeekDetails(stats, weekIdx, sortState = { key: 'rank', dir: 'asc' }) {
    const container = document.getElementById('f1-week-details');
    if (!container) return;

    const targetWeek = weekIdx === -1 ? stats.weekly[stats.weekly.length - 1] : stats.weekly[weekIdx];
    if (!targetWeek) return;

    const weekNumber = weekIdx === -1 ? stats.weekly.length : weekIdx + 1;
    const weekLabel = weekIdx === -1 ? '(Latest)' : `(Week ${weekNumber})`;

    const rows = [...targetWeek.topWeek.slice(0, 10)].sort((a, b) => {
        const dir = sortState.dir === 'asc' ? 1 : -1;
        const av = sortState.key === 'name' ? String(a.name || '').toLowerCase() : Number(a[sortState.key] ?? 0);
        const bv = sortState.key === 'name' ? String(b.name || '').toLowerCase() : Number(b[sortState.key] ?? 0);
        if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * dir;
        return (av - bv) * dir;
    });

    const weekSortMark = (key) => sortState.key === key ? (sortState.dir === 'asc' ? ' ▲' : ' ▼') : '';

    const table = `
        <div style="padding:0.8rem;margin-bottom:1rem;background:rgba(29,185,84,0.08);border-radius:var(--radius);text-align:center;">
            <div style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Week of <strong style="color:var(--green);font-size:1rem">${targetWeek.weekStart}</strong> ${weekLabel}</div>
        </div>
        <table class="f1-standings f1-standings-week">
            <thead>
                <tr>
                    <th class="f1-sortable-th" data-f1-table="week" data-sort-key="rank">#${weekSortMark('rank')}</th>
                    <th class="f1-sortable-th" data-f1-table="week" data-sort-key="name">Name${weekSortMark('name')}</th>
                    <th class="f1-sortable-th" data-f1-table="week" data-sort-key="minutes">Minutes${weekSortMark('minutes')}</th>
                    <th class="f1-sortable-th" data-f1-table="week" data-sort-key="basePoints">Base Pts${weekSortMark('basePoints')}</th>
                    <th class="f1-sortable-th" data-f1-table="week" data-sort-key="bonusPoints">Bonus (⚡ Fast Lap)${weekSortMark('bonusPoints')}</th>
                    <th class="f1-sortable-th" data-f1-table="week" data-sort-key="points">Total Pts${weekSortMark('points')}</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((r, idx) => `
                    <tr>
                        <td><strong>${r.rank}</strong></td>
                        <td>${r.fastestLap ? '⚡ ' : ''}${esc(r.name)}${r.subtitle ? `<div style="font-size:0.7rem;color:var(--text-muted)">${esc(r.subtitle)}</div>` : ''}</td>
                        <td>${r.minutes}</td>
                        <td>${r.basePoints}</td>
                        <td class="${r.bonusPoints > 0 ? 'f1-bonus' : ''}">${r.bonusPoints > 0 ? '+' + r.bonusPoints : '—'}</td>
                        <td><strong style="color:var(--green)">${r.points}</strong></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    container.innerHTML = table;
}

// ─────────────────────────────────────────────
//  WRAPPED
// ─────────────────────────────────────────────

export function populateWrappedFilter() {
    const years = [...new Set(window.spotifyData.full.map(d => d.year))].sort((a, b) => b - a);
    const sel = document.getElementById('wrapped-year-filter');
    if (sel) sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
}

export function renderWrappedContent() {
    const sel = document.getElementById('wrapped-year-filter');
    if (!sel) return;
    const year = parseInt(sel.value);
    const s = store.calculateWrappedStats(year, window.spotifyData.full);
    const container = document.getElementById('wrapped-content');
    if (!container) return;

    if (!s) { container.innerHTML = '<p style="color:var(--text-muted);padding:1rem">No data for this year.</p>'; return; }

    const trendPill = (label, val) => {
        if (val === null || val === undefined) return `<span class="wc-pill neutral">${label}: n/a</span>`;
        const cls = val >= 0 ? 'up' : 'down';
        const arrow = val >= 0 ? '▲' : '▼';
        return `<span class="wc-pill ${cls}">${label}: ${arrow} ${Math.abs(val)}%</span>`;
    };

    const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const maxQuarter = Math.max(...s.quarterMinutes, 1);
    const maxNewArtist = Math.max(...s.monthlyNewArtists, 1);

    const dayPartLabel = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' };
    const dayPartOrder = ['morning', 'afternoon', 'evening', 'night'];

    container.innerHTML = `
        <div class="wrapped-card wrapped-hero-card">
            <div class="wc-label">Your ${year} Story</div>
            <div class="wc-value">${s.totalMinutes.toLocaleString()}</div>
            <div class="wc-sub">minutes · ${s.totalHours.toLocaleString()} hours · ${s.totalPlays.toLocaleString()} plays</div>
            <div class="wc-pill-row">
                ${trendPill('Minutes vs prev year', s.comparePrev.minutesPct)}
                ${trendPill('Plays vs prev year', s.comparePrev.playsPct)}
                ${trendPill('Artists vs prev year', s.comparePrev.artistsPct)}
            </div>
        </div>

        <div class="wrapped-card">
            <div class="wc-label">Year Arc</div>
            <div class="wc-highlight">${s.yearArc}</div>
            <div class="wc-sub">Peak quarter: ${s.quarterPeak} · Active days: ${s.activeDays}</div>
            <div class="wc-sub">${s.playsPerActiveDay} plays/day · ${Math.round(s.minutesPerActiveDay)} min/day on active days</div>
        </div>

        <div class="wrapped-card">
            <div class="wc-label">Obsession & Loyalty</div>
            <div class="wc-sub">Top song concentration: <strong>${s.obsessionShare}%</strong> of all yearly plays</div>
            <div class="wc-sub">Top 5 artists concentration: <strong>${s.loyaltyTop5Share}%</strong> of total minutes</div>
            <div class="wc-sub">Mood profile: <strong>${esc(s.mood)}</strong></div>
        </div>

        <div class="wrapped-card">
            <div class="wc-label">Your Top Song</div>
            <div class="wc-highlight">${esc(s.topSongMain?.name || '—')}</div>
            <div class="wc-sub">${esc(s.topSongMain?.artistName || '')} · ${s.topSongMain?.plays || 0} plays</div>
        </div>

        <div class="wrapped-card">
            <div class="wc-label">Your Top Artist</div>
            <div class="wc-highlight">${esc(s.topArtistMain?.name || '—')}</div>
            <div class="wc-sub">${s.topArtistMain?.minutes || 0} min · ${s.topArtistMain?.plays || 0} plays</div>
        </div>

        <div class="wrapped-card">
            <div class="wc-label">Listening Persona</div>
            <div class="wc-value" style="font-size:2rem">${esc(s.persona)}</div>
            <div class="wc-sub">Fav hour: ${s.topHour} · Fav weekday: ${s.topWeekday} · Weekend share: ${s.weekendShare}%</div>
        </div>

        <div class="wrapped-card">
            <div class="wc-label">Peak Moment</div>
            <div class="wc-value" style="font-size:2rem">${s.peakMonth}</div>
            <div class="wc-sub">${s.peakMonthMinutes.toLocaleString()} min in your strongest month</div>
            <div class="wc-sub" style="margin-top:0.35rem">Best day: ${s.topDay ? `${s.topDay.date} (${s.topDay.minutes} min)` : '—'}</div>
        </div>

        <div class="wrapped-card">
            <div class="wc-label">Consistency & Discovery</div>
            <div class="wc-sub">Longest streak this year: <strong>${s.longestStreak} days</strong></div>
            <div class="wc-sub">${s.discoveries.tracks}% of your tracks were first-time discoveries</div>
            <div class="wc-sub">${s.discoveries.artists}% of your artists were new for you</div>
            <div class="wc-sub">Skip rate: ${s.skipRate}%</div>
        </div>

        <div class="wrapped-card wrapped-wide-card">
            <div class="wc-label">Quarter Momentum</div>
            <div class="wc-mini-bars">
                ${s.quarterMinutes.map((v, i) => `
                    <div class="wc-mini-bar-row">
                        <span>${['Q1', 'Q2', 'Q3', 'Q4'][i]}</span>
                        <div class="wc-mini-bar-wrap"><div class="wc-mini-bar" style="width:${Math.round((v / maxQuarter) * 100)}%"></div></div>
                        <strong>${v.toLocaleString()} min</strong>
                    </div>
                `).join('')}
            </div>
            <div class="wc-sub" style="margin-top:0.5rem">First half: ${s.firstHalfMinutes.toLocaleString()} min · Second half: ${s.secondHalfMinutes.toLocaleString()} min</div>
        </div>

        <div class="wrapped-card wrapped-wide-card">
            <div class="wc-label">Daypart DNA</div>
            <div class="wc-mini-bars">
                ${dayPartOrder.map(k => `
                    <div class="wc-mini-bar-row">
                        <span>${dayPartLabel[k]}</span>
                        <div class="wc-mini-bar-wrap"><div class="wc-mini-bar" style="width:${s.daypartPct[k]}%"></div></div>
                        <strong>${s.daypartPct[k]}%</strong>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="wrapped-card wrapped-wide-card">
            <div class="wc-label">Discovery Rhythm (New Artists per Month)</div>
            <div class="wc-mini-bars">
                ${s.monthlyNewArtists.map((v, i) => `
                    <div class="wc-mini-bar-row">
                        <span>${monthShort[i]}</span>
                        <div class="wc-mini-bar-wrap"><div class="wc-mini-bar" style="width:${Math.round((v / maxNewArtist) * 100)}%"></div></div>
                        <strong>${v}</strong>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="wrapped-card">
            <div class="wc-label">Monthly Breakdown</div>
            <div style="position:relative;height:180px;margin-top:0.5rem"><canvas id="wrapped-monthly-chart"></canvas></div>
        </div>

        <div class="wrapped-card">
            <div class="wc-label">Top 10 Tracks of ${year}</div>
            <ul class="wc-list wc-clickable-list">
                ${s.topSong.map((t, i) => `<li data-detail-type="track" data-detail-name="${t.name.replace(/"/g, '&quot;')}" data-detail-extra="${(t.artistName || '').replace(/"/g, '&quot;')}">
                    <span class="wc-rank">${i + 1}</span>
                    <span style="flex:1;font-weight:600">${esc(t.name)}</span>
                    <span style="color:var(--green);font-weight:700">${t.plays} plays</span>
                </li>`).join('')}
            </ul>
        </div>

        <div class="wrapped-card">
            <div class="wc-label">Top 10 Artists of ${year}</div>
            <ul class="wc-list wc-clickable-list">
                ${s.topArtist.map((a, i) => `<li data-detail-type="artist" data-detail-name="${a.name.replace(/"/g, '&quot;')}">
                    <span class="wc-rank">${i + 1}</span>
                    <span style="flex:1;font-weight:600">${esc(a.name)}</span>
                    <span style="color:var(--green);font-weight:700">${a.minutes} min</span>
                </li>`).join('')}
            </ul>
        </div>

        <div class="wrapped-card">
            <div class="wc-label">Top 10 Albums of ${year}</div>
            <ul class="wc-list wc-clickable-list">
                ${s.topAlbum.map((a, i) => `<li data-detail-type="album" data-detail-name="${a.name.replace(/"/g, '&quot;')}" data-detail-extra="${(a.artistName || '').replace(/"/g, '&quot;')}">
                    <span class="wc-rank">${i + 1}</span>
                    <span style="flex:1;font-weight:600">${esc(a.name)}</span>
                    <span style="color:var(--green);font-weight:700">${a.plays} plays</span>
                </li>`).join('')}
            </ul>
        </div>
    `;

    container.querySelectorAll('.wc-clickable-list li[data-detail-type]').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
            openDetail(el.dataset.detailName, el.dataset.detailType, el.dataset.detailExtra || '', window.spotifyData.full);
        });
    });

    setTimeout(() => charts.renderWrappedMonthlyChart(s.monthlyMinutes), 50);
}

// ─────────────────────────────────────────────
//  EXPLORER TAB
// ─────────────────────────────────────────────

let explorerData = [];

export function renderExplorerTab(data) {
    explorerData = [...data].filter(d => !d.isPodcast && d.trackName);

    renderWordCloud(data);
    renderDataTable(explorerData, '');

    // Search
    const searchInput = document.getElementById('table-search');
    if (searchInput) {
        const clone = searchInput.cloneNode(true);
        searchInput.replaceWith(clone);
        document.getElementById('table-search').addEventListener('input', e => {
            renderDataTable(explorerData, e.target.value);
        });
    }

    // Sort
    const sortSel = document.getElementById('table-sort');
    if (sortSel) {
        const clone = sortSel.cloneNode(true);
        sortSel.replaceWith(clone);
        document.getElementById('table-sort').addEventListener('change', e => {
            const q = document.getElementById('table-search')?.value || '';
            renderDataTable(explorerData, q, e.target.value);
        });
    }
}

function renderDataTable(data, query = '', sortBy = 'date-desc') {
    const tableEl = document.getElementById('data-table');
    const countEl = document.getElementById('table-row-count');
    if (!tableEl) return;

    let filtered = data;
    if (query) {
        const q = query.toLowerCase();
        filtered = data.filter(d =>
            (d.trackName && d.trackName.toLowerCase().includes(q)) ||
            (d.artistName && d.artistName.toLowerCase().includes(q)) ||
            (d.albumName && d.albumName.toLowerCase().includes(q))
        );
    }

    if (sortBy === 'date-asc') filtered = [...filtered].sort((a, b) => a.ts - b.ts);
    else if (sortBy === 'minutes-desc') filtered = [...filtered].sort((a, b) => b.durationMin - a.durationMin);
    else filtered = [...filtered].sort((a, b) => b.ts - a.ts);

    if (countEl) countEl.textContent = `${filtered.length.toLocaleString()} rows`;

    const LIMIT = 500;
    const slice = filtered.slice(0, LIMIT);

    const headers = `<thead><tr><th>Date & Time</th><th>Track</th><th>Artist</th><th>Album</th><th>Min</th><th>Platform</th><th>End</th></tr></thead>`;
    const rows = slice.map(d => `<tr>
        <td>${d.ts.toLocaleString()}</td>
        <td class="td-track">${esc(d.trackName || '')}</td>
        <td>${esc(d.artistName || '')}</td>
        <td>${esc(d.albumName || '')}</td>
        <td class="td-mins">${Math.round(d.durationMin * 10) / 10}</td>
        <td>${esc(d.platform || '')}</td>
        <td>${esc(d.reasonEnd || '')}</td>
    </tr>`).join('');

    tableEl.innerHTML = `${headers}<tbody>${rows}</tbody>`;
    if (filtered.length > LIMIT) {
        const note = document.createElement('p');
        note.style.cssText = 'color:var(--text-muted);font-size:0.8rem;padding:0.5rem';
        note.textContent = `Showing first ${LIMIT} of ${filtered.length.toLocaleString()} results.`;
        tableEl.after(note);
    }
}

function renderWordCloud(data) {
    const canvas = document.getElementById('word-cloud-canvas');
    if (!canvas) return;

    const stop = new Set(['the', 'and', 'feat', 'with', 'from', 'for', 'you', 'your', 'remix', 'version', 'radio', 'edit', 'live']);
    const freq = {};

    data.filter(d => !d.isPodcast).forEach(d => {
        if (d.trackName) freq[d.trackName] = (freq[d.trackName] || 0) + 4;
        if (d.artistName) freq[d.artistName] = (freq[d.artistName] || 0) + 3;
        if (d.albumName) freq[d.albumName] = (freq[d.albumName] || 0) + 2;

        const words = `${d.trackName || ''} ${d.artistName || ''}`.toLowerCase()
            .replace(/[^a-z0-9\s]/gi, ' ')
            .split(/\s+/)
            .filter(w => w && w.length > 2 && !stop.has(w));

        words.forEach(w => {
            const token = w.charAt(0).toUpperCase() + w.slice(1);
            freq[token] = (freq[token] || 0) + 0.8;
        });
    });

    const list = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 220)
        .map(([text, w]) => [text, Math.round(Math.pow(w, 0.72) * 9)]);

    const container = document.getElementById('word-cloud-container');
    if (container) {
        canvas.width = Math.max(680, container.clientWidth * 2);
        canvas.height = Math.max(430, container.clientHeight * 2);
    }

    if (list.length > 0) {
        WordCloud(canvas, {
            list,
            gridSize: 10,
            weightFactor: size => Math.max(9, size * 0.95),
            fontFamily: 'CircularSp, sans-serif',
            color: (_, weight) => {
                if (weight > 40) return '#1DB954';
                if (weight > 28) return '#7CE9A8';
                if (weight > 20) return '#B8F6D0';
                return '#b3b3b3';
            },
            backgroundColor: 'transparent',
            rotateRatio: 0.28,
            minRotation: -Math.PI / 6,
            maxRotation: Math.PI / 6,
            drawOutOfBound: false,
            shuffle: false
        });
    }
}

// ─────────────────────────────────────────────
//  VIEWER TAB
// ─────────────────────────────────────────────

export function renderViewerTab() {
    const container = document.getElementById('viewer-content');
    if (!container) return;

    const COLORS = ['#1DB954', '#17A2B8', '#FFC107', '#FD7E14', '#6F42C1', '#E83E8C', '#20C997', '#0DCAF0', '#FF6384', '#8BC34A', '#FFB74D', '#7E57C2'];
    const colorOf = (idx, alpha = 1) => {
        const hex = COLORS[idx % COLORS.length];
        if (alpha === 1) return hex;
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    };
    const shortEntityLabel = (e) => {
        const txt = e.subtitle ? `${e.name} - ${e.subtitle}` : e.name;
        return txt.length > 36 ? `${txt.slice(0, 35)}...` : txt;
    };

    stopViewerPlayback();
    destroyViewerChart();

    const data = window.spotifyData.filtered.filter(d => !d.isPodcast && d.trackName);
    if (!data.length) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:1rem">No music data available for viewer.</p>';
        stopViewerPlayback();
        destroyViewerChart();
        return;
    }

    const firstDate = data[0].date;
    const lastDate = data[data.length - 1].date;
    if (!viewerState.fromDate) viewerState.fromDate = firstDate;
    if (!viewerState.toDate) viewerState.toDate = lastDate;

    viewerState.fromDate = viewerState.fromDate < firstDate ? firstDate : viewerState.fromDate;
    viewerState.toDate = viewerState.toDate > lastDate ? lastDate : viewerState.toDate;

    container.innerHTML = `
        <div class="viewer-panel">
            <div class="viewer-controls-grid">
                <div class="viewer-control">
                    <label for="viewer-entity-type">Entity</label>
                    <select id="viewer-entity-type">
                        <option value="artist" ${viewerState.entityType === 'artist' ? 'selected' : ''}>Artist</option>
                        <option value="album" ${viewerState.entityType === 'album' ? 'selected' : ''}>Album</option>
                        <option value="track" ${viewerState.entityType === 'track' ? 'selected' : ''}>Track</option>
                    </select>
                </div>
                <div class="viewer-control">
                    <label for="viewer-topx">Top</label>
                    <input id="viewer-topx" type="number" min="2" max="20" step="1" value="${viewerState.topX}">
                </div>
                <div class="viewer-control">
                    <label for="viewer-metric">Metric</label>
                    <select id="viewer-metric">
                        <option value="minutes" ${viewerState.metric === 'minutes' ? 'selected' : ''}>Minutes</option>
                        <option value="plays" ${viewerState.metric === 'plays' ? 'selected' : ''}>Plays</option>
                        <option value="points" ${viewerState.metric === 'points' ? 'selected' : ''}>Points (F1)</option>
                    </select>
                </div>
                <div class="viewer-control">
                    <label for="viewer-value-mode">Value mode</label>
                    <select id="viewer-value-mode">
                        <option value="accum" ${viewerState.valueMode === 'accum' ? 'selected' : ''}>Accum (default)</option>
                        <option value="rolling" ${viewerState.valueMode === 'rolling' ? 'selected' : ''}>Rolling mean</option>
                        <option value="period" ${viewerState.valueMode === 'period' ? 'selected' : ''}>Period data</option>
                        <option value="simple" ${viewerState.valueMode === 'simple' ? 'selected' : ''}>Simple data</option>
                    </select>
                </div>
                <div class="viewer-control" id="viewer-rolling-wrap">
                    <label for="viewer-rolling-window">Rolling window</label>
                    <input id="viewer-rolling-window" type="number" min="2" max="24" step="1" value="${viewerState.rollingWindow}">
                </div>
                <div class="viewer-control">
                    <label for="viewer-granularity">Granularity</label>
                    <select id="viewer-granularity">
                        <option value="day" ${viewerState.granularity === 'day' ? 'selected' : ''}>Day</option>
                        <option value="week" ${viewerState.granularity === 'week' ? 'selected' : ''}>Week</option>
                        <option value="month" ${viewerState.granularity === 'month' ? 'selected' : ''}>Month</option>
                        <option value="year" ${viewerState.granularity === 'year' ? 'selected' : ''}>Year</option>
                    </select>
                </div>
                <div class="viewer-control">
                    <label for="viewer-chart-type">Visualization</label>
                    <select id="viewer-chart-type">
                        <option value="line" ${viewerState.chartType === 'line' ? 'selected' : ''}>Line Race</option>
                        <option value="bar" ${viewerState.chartType === 'bar' ? 'selected' : ''}>Bar Race</option>
                    </select>
                </div>
                <div class="viewer-control">
                    <label for="viewer-from">From</label>
                    <input id="viewer-from" type="date" min="${firstDate}" max="${lastDate}" value="${viewerState.fromDate}">
                </div>
                <div class="viewer-control">
                    <label for="viewer-to">To</label>
                    <input id="viewer-to" type="date" min="${firstDate}" max="${lastDate}" value="${viewerState.toDate}">
                </div>
                <div class="viewer-control viewer-speed">
                    <label for="viewer-speed">Speed (<span id="viewer-speed-label">${viewerState.speedMs} ms</span>/step)</label>
                    <input id="viewer-speed" type="range" min="80" max="2000" step="20" value="${viewerState.speedMs}">
                </div>
                <div class="viewer-control viewer-check">
                    <label>
                        <input id="viewer-lock-camera" type="checkbox" ${viewerState.lockCamera ? 'checked' : ''}>
                        Lock camera scale
                    </label>
                </div>
            </div>

            <div class="viewer-actions">
                <button id="viewer-build-btn" class="secondary-btn">Build</button>
                <button id="viewer-play-btn">Play</button>
                <button id="viewer-pause-btn" class="secondary-btn">Pause</button>
                <button id="viewer-reset-btn" class="secondary-btn">Reset</button>
            </div>

            <div class="viewer-status" id="viewer-status">Ready to build a progression.</div>

            <div class="viewer-timeline-controls">
                <button id="viewer-step-back" class="secondary-btn" title="Step back">◀</button>
                <input id="viewer-scrub" type="range" min="1" max="1" step="1" value="1">
                <button id="viewer-step-next" class="secondary-btn" title="Step forward">▶</button>
                <span id="viewer-scrub-label">1/1</span>
            </div>

            <div class="viewer-chart-wrap">
                <canvas id="viewer-progress-chart"></canvas>
            </div>
        </div>
    `;

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

    const updateRollingVisibility = () => {
        const wrap = container.querySelector('#viewer-rolling-wrap');
        if (!wrap) return;
        wrap.style.display = viewerState.valueMode === 'rolling' ? '' : 'none';
    };

    const ensureStableColorKeys = (entities) => {
        entities.forEach(e => {
            if (!viewerColorKeyToIdx.has(e.key)) {
                viewerColorKeyToIdx.set(e.key, viewerColorNextIdx);
                viewerColorNextIdx += 1;
            }
        });
    };

    const getYAxisTitle = () => {
        const unit = viewerState.metric === 'plays'
            ? 'Plays'
            : viewerState.metric === 'points'
                ? 'Points'
                : 'Minutes';
        if (viewerState.valueMode === 'accum') return `${unit} (accum)`;
        if (viewerState.valueMode === 'rolling') return `${unit} (rolling mean)`;
        if (viewerState.valueMode === 'period') return `${unit} (per period)`;
        return `${unit} (simple)`;
    };

    const setStatus = (text) => {
        const el = container.querySelector('#viewer-status');
        if (el) el.textContent = text;
    };

    const updateScrubber = (step, maxStep) => {
        const scrub = container.querySelector('#viewer-scrub');
        const label = container.querySelector('#viewer-scrub-label');
        if (scrub) {
            scrub.min = '1';
            scrub.max = String(Math.max(1, maxStep));
            scrub.value = String(Math.max(1, Math.min(step, maxStep)));
        }
        if (label) {
            label.textContent = `${Math.max(1, Math.min(step, maxStep))}/${Math.max(1, maxStep)}`;
        }
    };

    const buildSeries = () => {
        readControls();

        if (viewerState.fromDate > viewerState.toDate) {
            const swap = viewerState.fromDate;
            viewerState.fromDate = viewerState.toDate;
            viewerState.toDate = swap;
            const fromInput = container.querySelector('#viewer-from');
            const toInput = container.querySelector('#viewer-to');
            if (fromInput) fromInput.value = viewerState.fromDate;
            if (toInput) toInput.value = viewerState.toDate;
        }

        viewerSeries = store.calculateViewerAccumulatedSeries(data, {
            entityType: viewerState.entityType,
            metric: viewerState.metric,
            valueMode: viewerState.valueMode,
            rollingWindow: viewerState.rollingWindow,
            granularity: viewerState.granularity,
            fromDate: viewerState.fromDate,
            toDate: viewerState.toDate,
            topX: viewerState.topX
        });

        viewerPlaybackStep = 0;
        if (!viewerSeries.labels.length || !viewerSeries.entities.length) {
            setStatus('No data found for current selection and time range.');
            destroyViewerChart();
            return false;
        }
        ensureStableColorKeys(viewerSeries.entities);
        return true;
    };

    const drawViewerChart = (stepCount, full = false) => {
        if (!viewerSeries || !viewerSeries.labels.length) return;

        const maxStep = viewerSeries.labels.length;
        const upto = full ? maxStep : Math.max(1, Math.min(stepCount, maxStep));
        const labels = viewerSeries.labels.slice(0, upto);
        const unit = viewerState.metric === 'plays'
            ? 'plays'
            : viewerState.metric === 'points'
                ? 'pts'
                : 'min';
        const pct = Math.round((upto / maxStep) * 100);
        const currentBucket = labels[labels.length - 1] || '-';

        const canvas = container.querySelector('#viewer-progress-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (viewerChartInstance) viewerChartInstance.destroy();
        let leaderText = '—';

        const entityIndexByKey = viewerColorKeyToIdx;
        const ranking = viewerSeries.entities
            .map(e => ({
                ...e,
                value: (viewerSeries.seriesByKey[e.key] || [0])[upto - 1] || 0
            }))
            .sort((a, b) => b.value - a.value);
        const visibleCount = Math.min(viewerState.topX, ranking.length);
        const visibleRanking = ranking.slice(0, visibleCount);

        const fixedAxisMax = (() => {
            if (!viewerState.lockCamera) return undefined;
            const allVisibleValues = visibleRanking.flatMap(r => viewerSeries.seriesByKey[r.key] || [0]);
            const maxVal = Math.max(...allVisibleValues, 1);
            return Math.max(1, Math.ceil(maxVal * 1.05));
        })();

        if (viewerState.chartType === 'line') {
            const lineLabels = viewerSeries.labels.slice(0, upto);

            const datasets = visibleRanking.map((e, rankIdx) => {
                const stableIdx = entityIndexByKey.get(e.key) ?? rankIdx;
                return {
                    label: `#${rankIdx + 1} ${shortEntityLabel(e)}`,
                    data: (viewerSeries.seriesByKey[e.key] || []).slice(0, upto),
                    borderColor: colorOf(stableIdx, 1),
                    backgroundColor: colorOf(stableIdx, 0.15),
                    borderWidth: 2,
                    fill: false,
                    tension: 0.25,
                    pointRadius: 1.6,
                    pointHoverRadius: 4
                };
            });

            const leader = ranking[0];
            leaderText = leader ? `${shortEntityLabel(leader)} (${Math.round(leader.value).toLocaleString()} ${unit})` : '—';

            viewerChartInstance = new Chart(ctx, {
                type: 'line',
                data: { labels: lineLabels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 260 },
                    plugins: {
                        legend: { display: true, position: 'bottom', labels: { color: '#b3b3b3', boxWidth: 10 } },
                        datalabels: false,
                        tooltip: {
                            callbacks: {
                                title: (ctxItems) => lineLabels[ctxItems[0].dataIndex],
                                label: (ctx) => `${ctx.dataset.label}: ${Math.round(ctx.raw).toLocaleString()} ${unit}`
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { color: '#b3b3b3', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
                            grid: { display: false }
                        },
                        y: {
                            ticks: { color: '#b3b3b3' },
                            grid: { color: '#282828' },
                            max: fixedAxisMax,
                            title: {
                                display: true,
                                text: getYAxisTitle(),
                                color: '#b3b3b3'
                            }
                        }
                    }
                }
            });
        } else {
            const barLabels = visibleRanking.map((r, idx) => `#${idx + 1} ${shortEntityLabel(r)}`);
            const barValues = visibleRanking.map(r => r.value);
            const barColors = visibleRanking.map((r) => {
                const stableIdx = entityIndexByKey.get(r.key) ?? 0;
                return colorOf(stableIdx, 0.78);
            });

            const leader = ranking[0];
            leaderText = leader ? `${shortEntityLabel(leader)} (${Math.round(leader.value).toLocaleString()} ${unit})` : '—';

            viewerChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: barLabels,
                    datasets: [{
                        data: barValues,
                        backgroundColor: barColors,
                        borderColor: visibleRanking.map((r) => {
                            const stableIdx = entityIndexByKey.get(r.key) ?? 0;
                            return colorOf(stableIdx, 1);
                        }),
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: Math.min(420, Math.max(120, Math.round(viewerState.speedMs * 0.7))) },
                    plugins: {
                        legend: { display: false },
                        datalabels: false,
                        tooltip: {
                            callbacks: {
                                title: (ctxItems) => barLabels[ctxItems[0].dataIndex],
                                label: (ctx) => `${Math.round(ctx.raw).toLocaleString()} ${unit}`
                            }
                        }
                    },
                    scales: {
                        y: {
                            ticks: { color: '#b3b3b3' },
                            grid: { display: false }
                        },
                        x: {
                            ticks: { color: '#b3b3b3' },
                            grid: { color: '#282828' },
                            max: fixedAxisMax,
                            title: {
                                display: true,
                                text: getYAxisTitle(),
                                color: '#b3b3b3'
                            }
                        }
                    }
                }
            });
        }

        updateScrubber(upto, maxStep);
        setStatus(`Progress ${upto}/${maxStep} (${pct}%) · ${currentBucket} · Mode: ${viewerState.valueMode} · Visible: Top ${visibleCount} · Leader: ${leaderText}`);
    };

    const playViewer = () => {
        if (!viewerSeries || !viewerSeries.labels.length) {
            if (!buildSeries()) return;
        }

        if (viewerPlaybackStep >= viewerSeries.labels.length) viewerPlaybackStep = 0;
        stopViewerPlayback();

        viewerPlaybackTimer = setInterval(() => {
            viewerPlaybackStep += 1;
            drawViewerChart(viewerPlaybackStep);

            if (viewerPlaybackStep >= viewerSeries.labels.length) {
                stopViewerPlayback();
            }
        }, viewerState.speedMs);
    };

    const buildFull = () => {
        stopViewerPlayback();
        if (!buildSeries()) return;
        viewerPlaybackStep = viewerSeries.labels.length;
        drawViewerChart(viewerPlaybackStep, true);
    };

    const resetViewer = () => {
        stopViewerPlayback();
        if (!viewerSeries || !viewerSeries.labels.length) {
            if (!buildSeries()) return;
        }
        viewerPlaybackStep = 1;
        drawViewerChart(viewerPlaybackStep);
    };

    container.querySelector('#viewer-entity-type')?.addEventListener('change', () => {
        readControls();
        buildFull();
    });

    container.querySelector('#viewer-topx')?.addEventListener('change', () => {
        readControls();
        buildFull();
    });

    container.querySelector('#viewer-metric')?.addEventListener('change', () => {
        readControls();
        buildFull();
    });

    container.querySelector('#viewer-value-mode')?.addEventListener('change', () => {
        readControls();
        updateRollingVisibility();
        buildFull();
    });

    container.querySelector('#viewer-rolling-window')?.addEventListener('change', () => {
        readControls();
        buildFull();
    });

    container.querySelector('#viewer-granularity')?.addEventListener('change', () => {
        readControls();
        buildFull();
    });

    container.querySelector('#viewer-chart-type')?.addEventListener('change', () => {
        readControls();
        buildFull();
    });

    container.querySelector('#viewer-from')?.addEventListener('change', () => {
        readControls();
        buildFull();
    });

    container.querySelector('#viewer-to')?.addEventListener('change', () => {
        readControls();
        buildFull();
    });

    container.querySelector('#viewer-speed')?.addEventListener('input', (e) => {
        viewerState.speedMs = parseInt(e.target.value || '450', 10);
        const lbl = container.querySelector('#viewer-speed-label');
        if (lbl) lbl.textContent = `${viewerState.speedMs} ms`;
        if (viewerPlaybackTimer) {
            playViewer();
        }
    });

    container.querySelector('#viewer-lock-camera')?.addEventListener('change', () => {
        readControls();
        if (!viewerSeries || !viewerSeries.labels.length) {
            buildFull();
            return;
        }
        const step = Math.max(1, Math.min(viewerPlaybackStep || 1, viewerSeries.labels.length));
        drawViewerChart(step);
    });

    container.querySelector('#viewer-build-btn')?.addEventListener('click', buildFull);
    container.querySelector('#viewer-play-btn')?.addEventListener('click', () => {
        readControls();
        playViewer();
    });
    container.querySelector('#viewer-pause-btn')?.addEventListener('click', stopViewerPlayback);
    container.querySelector('#viewer-reset-btn')?.addEventListener('click', () => {
        readControls();
        resetViewer();
    });

    container.querySelector('#viewer-scrub')?.addEventListener('input', (e) => {
        if (!viewerSeries || !viewerSeries.labels.length) return;
        stopViewerPlayback();
        viewerPlaybackStep = Math.max(1, Math.min(viewerSeries.labels.length, parseInt(e.target.value || '1', 10)));
        drawViewerChart(viewerPlaybackStep);
    });

    container.querySelector('#viewer-step-back')?.addEventListener('click', () => {
        if (!viewerSeries || !viewerSeries.labels.length) return;
        stopViewerPlayback();
        viewerPlaybackStep = Math.max(1, (viewerPlaybackStep || 1) - 1);
        drawViewerChart(viewerPlaybackStep);
    });

    container.querySelector('#viewer-step-next')?.addEventListener('click', () => {
        if (!viewerSeries || !viewerSeries.labels.length) return;
        stopViewerPlayback();
        viewerPlaybackStep = Math.min(viewerSeries.labels.length, (viewerPlaybackStep || 0) + 1);
        drawViewerChart(viewerPlaybackStep);
    });

    updateRollingVisibility();

    // Initial preview
    buildFull();
}

function stopViewerPlayback() {
    if (viewerPlaybackTimer) {
        clearInterval(viewerPlaybackTimer);
        viewerPlaybackTimer = null;
    }
}

function destroyViewerChart() {
    if (viewerChartInstance) {
        viewerChartInstance.destroy();
        viewerChartInstance = null;
    }
}

// ─────────────────────────────────────────────
//  LOADING
// ─────────────────────────────────────────────

export function showLoading(message) {
    const el = document.getElementById('loading-message');
    if (el) el.textContent = message;
    setLoadingProgress(0);
    document.getElementById('loading-overlay')?.classList.remove('hidden');
}

export function setLoadingProgress(progress = 0, message = null) {
    const p = Math.max(0, Math.min(100, Math.round(progress)));
    const bar = document.getElementById('loading-progress-bar');
    const txt = document.getElementById('loading-progress-text');
    const msg = document.getElementById('loading-message');

    if (bar) bar.style.width = `${p}%`;
    if (txt) txt.textContent = `${p}%`;
    if (message && msg) msg.textContent = message;
}

export function hideLoading() {
    setLoadingProgress(0);
    document.getElementById('loading-overlay')?.classList.add('hidden');
}

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────

function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
