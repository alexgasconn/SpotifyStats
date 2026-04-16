// js/tabs/overview.js — Overview tab: KPIs, top lists, timeline

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
    grid.innerHTML = `
        <div class="kpi-card"><div class="kpi-icon">⏱</div><h4>Total Hours</h4><div class="kpi-value">${fmt(k.totalHours)}</div><div class="kpi-sub">${fmt(k.totalDays)} full days</div></div>
        <div class="kpi-card"><div class="kpi-icon">▶</div><h4>Total Plays</h4><div class="kpi-value">${fmt(k.totalPlays)}</div><div class="kpi-sub">${fmt(k.totalMinutes)} minutes</div></div>
        <div class="kpi-card"><div class="kpi-icon">🎵</div><h4>Unique Tracks</h4><div class="kpi-value">${fmt(k.uniqueTracks)}</div><div class="kpi-sub">across ${fmt(k.uniqueAlbums)} albums</div></div>
        <div class="kpi-card"><div class="kpi-icon">🎤</div><h4>Unique Artists</h4><div class="kpi-value">${fmt(k.uniqueArtists)}</div><div class="kpi-sub">artists discovered</div></div>
        <div class="kpi-card"><div class="kpi-icon">📅</div><h4>Active Days</h4><div class="kpi-value">${fmt(k.activeDays)}</div><div class="kpi-sub">${fmt(k.avgPerDay)} min/day avg</div></div>
        <div class="kpi-card"><div class="kpi-icon">⏭</div><h4>Skip Rate</h4><div class="kpi-value">${k.skipRate}%</div><div class="kpi-sub">${fmt(k.skipped)} skipped plays</div></div>
        <div class="kpi-card"><div class="kpi-icon">🏆</div><h4>Best Day Ever</h4><div class="kpi-value">${fmt(k.maxDayMinutes)}</div><div class="kpi-sub">min on ${k.maxDay || '—'}</div></div>
        <div class="kpi-card"><div class="kpi-icon">📆</div><h4>Time Span</h4><div class="kpi-value">${k.years ? k.years.length : '?'}</div><div class="kpi-sub">years of data</div></div>
    `;
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
