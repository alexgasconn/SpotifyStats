// js/tabs/overview.js — Overview tab: KPIs, top lists, timeline, fun facts

import * as store from '../store.js';
import * as charts from '../charts.js';
import { esc } from '../utils.js';
import { openDetail } from '../detail.js';

let currentTimelineUnit = 'week';
let topTracksN = 10;
let topArtistsN = 10;
let topAlbumsN = 10;
let tracksSortBy = 'plays';
let artistsSortBy = 'plays';
let albumsSortBy = 'plays';

export function renderOverview() {
    const data = window.spotifyData.filtered;
    renderKPIs(data);
    renderFunFacts(data);
    renderTopLists(data);
    updateTimelineChart();
    setupTimelineControls();
    setupTopNControls();
}

function renderKPIs(data) {
    const k = store.calculateGlobalKPIs(data);
    const grid = document.getElementById('kpi-grid');
    if (!grid) return;
    const fmt = n => Number(n).toLocaleString();

    // Extra computed KPIs
    const music = data.filter(d => !d.isPodcast && d.trackName);
    const playsPerTrack = k.uniqueTracks ? (music.length / k.uniqueTracks).toFixed(1) : '0';
    const discoveryRate = k.totalPlays && k.uniqueTracks ? ((k.uniqueTracks / music.length) * 100).toFixed(1) : '0';

    grid.innerHTML = `
        <div class="kpi-card"><div class="kpi-icon">⏱</div><h4>Total Hours</h4><div class="kpi-value">${fmt(k.totalHours)}</div><div class="kpi-sub">${fmt(k.totalDays)} full days</div></div>
        <div class="kpi-card"><div class="kpi-icon">▶</div><h4>Total Plays</h4><div class="kpi-value">${fmt(k.totalPlays)}</div><div class="kpi-sub">${fmt(k.totalMinutes)} minutes</div></div>
        <div class="kpi-card"><div class="kpi-icon">🎵</div><h4>Unique Tracks</h4><div class="kpi-value">${fmt(k.uniqueTracks)}</div><div class="kpi-sub">across ${fmt(k.uniqueAlbums)} albums</div></div>
        <div class="kpi-card"><div class="kpi-icon">🎤</div><h4>Unique Artists</h4><div class="kpi-value">${fmt(k.uniqueArtists)}</div><div class="kpi-sub">artists discovered</div></div>
        <div class="kpi-card"><div class="kpi-icon">📅</div><h4>Active Days</h4><div class="kpi-value">${fmt(k.activeDays)}</div><div class="kpi-sub">${fmt(k.avgPerDay)} min/day avg</div></div>
        <div class="kpi-card"><div class="kpi-icon">⏭</div><h4>Skip Rate</h4><div class="kpi-value">${k.skipRate}%</div><div class="kpi-sub">${fmt(k.skipped)} skipped plays</div></div>
        <div class="kpi-card"><div class="kpi-icon">🏆</div><h4>Best Day Ever</h4><div class="kpi-value">${fmt(k.maxDayMinutes)}</div><div class="kpi-sub">min on ${k.maxDay || '—'}</div></div>
        <div class="kpi-card"><div class="kpi-icon">📆</div><h4>Time Span</h4><div class="kpi-value">${k.years ? k.years.length : '?'}</div><div class="kpi-sub">${k.firstDate || ''} → ${k.lastDate || ''}</div></div>
        <div class="kpi-card"><div class="kpi-icon">🔄</div><h4>Plays / Track</h4><div class="kpi-value">${playsPerTrack}</div><div class="kpi-sub">average replay rate</div></div>
        <div class="kpi-card"><div class="kpi-icon">🌱</div><h4>Discovery Rate</h4><div class="kpi-value">${discoveryRate}%</div><div class="kpi-sub">of plays are unique tracks</div></div>
    `;
}

function renderFunFacts(data) {
    let container = document.getElementById('overview-fun-facts');
    if (!container) {
        const kpiGrid = document.getElementById('kpi-grid');
        if (!kpiGrid) return;
        container = document.createElement('div');
        container.id = 'overview-fun-facts';
        container.className = 'overview-fun-facts';
        kpiGrid.insertAdjacentElement('afterend', container);
    }

    const music = data.filter(d => !d.isPodcast && d.trackName);
    if (!music.length) { container.innerHTML = ''; return; }

    // Compute fun facts from raw data
    const facts = [];

    // 1. Total minutes as real-world comparison
    const totalMin = music.reduce((s, d) => s + d.durationMin, 0);
    const flights = (totalMin / (480)).toFixed(0); // NYC-London ~8h
    facts.push({ icon: '✈️', text: `Your listening time equals <strong>${flights}</strong> New York → London flights` });

    // 2. Most played hour
    const hourMap = {};
    music.forEach(d => { const h = new Date(d.endTime).getHours(); hourMap[h] = (hourMap[h] || 0) + 1; });
    const peakHour = Object.entries(hourMap).sort((a, b) => b[1] - a[1])[0];
    if (peakHour) facts.push({ icon: '🕐', text: `Your peak hour is <strong>${peakHour[0]}:00</strong> with ${Number(peakHour[1]).toLocaleString()} plays` });

    // 3. Most listened day of week
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dowMap = {};
    music.forEach(d => { const dow = new Date(d.endTime).getDay(); dowMap[dow] = (dowMap[dow] || 0) + d.durationMin; });
    const peakDay = Object.entries(dowMap).sort((a, b) => b[1] - a[1])[0];
    if (peakDay) facts.push({ icon: '📅', text: `<strong>${dayNames[peakDay[0]]}</strong> is your most musical day (${Math.round(peakDay[1]).toLocaleString()} min total)` });

    // 4. Longest single track play
    const longest = music.reduce((best, d) => d.durationMin > best.durationMin ? d : best, music[0]);
    if (longest) facts.push({ icon: '⏰', text: `Longest play: <strong>${esc(longest.trackName)}</strong> — ${Math.round(longest.durationMin)} min` });

    // 5. One-hit wonders count
    const artistTrackMap = {};
    music.forEach(d => {
        if (!d.artistName) return;
        if (!artistTrackMap[d.artistName]) artistTrackMap[d.artistName] = new Set();
        artistTrackMap[d.artistName].add(d.trackName);
    });
    const oneHits = Object.values(artistTrackMap).filter(s => s.size === 1).length;
    const totalArtists = Object.keys(artistTrackMap).length;
    if (totalArtists) facts.push({ icon: '🎯', text: `<strong>${oneHits}</strong> of ${totalArtists} artists have only 1 track played (${((oneHits / totalArtists) * 100).toFixed(0)}%)` });

    // 6. Weekend vs weekday
    const weekendMin = music.filter(d => { const dow = new Date(d.endTime).getDay(); return dow === 0 || dow === 6; }).reduce((s, d) => s + d.durationMin, 0);
    const weekdayMin = totalMin - weekendMin;
    const weekendPct = ((weekendMin / totalMin) * 100).toFixed(0);
    facts.push({ icon: weekendMin > weekdayMin * (2 / 5) ? '🎉' : '💼', text: `Weekend listening: <strong>${weekendPct}%</strong> of total (${Math.round(weekendMin).toLocaleString()} min)` });

    container.innerHTML = `
        <h3>💡 Quick Facts</h3>
        <div class="fun-facts-grid">
            ${facts.map(f => `<div class="fun-fact-card"><span class="ff-icon">${f.icon}</span><span class="ff-text">${f.text}</span></div>`).join('')}
        </div>`;
}

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
        const mainVal = sortBy === 'minutes' ? `${item.minutes.toLocaleString()} min`
            : sortBy === 'points' ? `${item.points.toLocaleString()} pts`
                : `${item.plays.toLocaleString()} plays`;
        const subVal = sortBy === 'minutes' ? `${item.plays.toLocaleString()} plays · ${item.points.toLocaleString()} pts`
            : sortBy === 'points' ? `${item.plays.toLocaleString()} plays · ${item.minutes.toLocaleString()} min`
                : `${item.minutes.toLocaleString()} min · ${item.points.toLocaleString()} pts`;
        const pct = Math.round((item[sortBy] / maxVal) * 100);
        let sub = '';
        if (type === 'track' || type === 'album') sub = item.artistName || '';
        const nameAttr = item.name.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const extraAttr = (type !== 'artist' ? (item.artistName || '') : '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        return `<div class="top-item" data-type="${type}" data-name="${nameAttr}" data-extra="${extraAttr}" title="Click to explore ${item.name}">
            <span class="rank">${i + 1}</span>
            <div class="item-details"><div class="item-name">${esc(item.name)}</div>${sub ? `<div class="item-sub">${esc(sub)}</div>` : ''}</div>
            <div class="item-bar-wrap"><div class="item-bar" style="width:${pct}%"></div></div>
            <div class="item-metrics"><div class="item-metric-main">${mainVal}</div><div class="item-metric-sub">${subVal}</div></div>
        </div>`;
    }).join('');
    el.querySelectorAll('.top-item').forEach(row => {
        row.addEventListener('click', () => openDetail(row.dataset.name, row.dataset.type, row.dataset.extra, window.spotifyData.full));
    });
}

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

function setupTopNControls() {
    setupTopNFor('top-tracks-table', n => { topTracksN = n; renderTopLists(window.spotifyData.filtered); });
    setupTopNFor('top-artists-table', n => { topArtistsN = n; renderTopLists(window.spotifyData.filtered); });
    setupTopNFor('top-albums-table', n => { topAlbumsN = n; renderTopLists(window.spotifyData.filtered); });
    setupSortSelect('tracks-sort-by', v => { tracksSortBy = v; renderTopLists(window.spotifyData.filtered); });
    setupSortSelect('artists-sort-by', v => { artistsSortBy = v; renderTopLists(window.spotifyData.filtered); });
    setupSortSelect('albums-sort-by', v => { albumsSortBy = v; renderTopLists(window.spotifyData.filtered); });
}

function setupTopNFor(tableId, onChange) {
    const card = document.getElementById(tableId)?.closest('.chart-container');
    if (!card) return;
    card.querySelectorAll('.top-n-btn').forEach(btn => { const c = btn.cloneNode(true); btn.replaceWith(c); });
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
