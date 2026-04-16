// js/tabs/explorer.js — Enhanced Explorer tab with sessions, stats & advanced table

import * as store from '../store.js';
import { esc } from '../utils.js';
import { openDetail } from '../detail.js';

let explorerData = [];
let currentPage = 0;
const PAGE_SIZE = 200;
let currentQuery = '';
let currentSort = 'date-desc';
let currentTypeFilter = 'all';

export function renderExplorerTab(data) {
    explorerData = [...data].filter(d => !d.isPodcast && d.trackName);
    const container = document.getElementById('explorer-tab');
    if (!container) return;

    const sessions = store.calculateListeningSessions(data, 30);
    const stats = computeExplorerStats(explorerData, sessions);

    // Build new enhanced HTML for explorer container
    const explorerContent = container.querySelector('.charts-grid');
    if (!explorerContent) return;

    explorerContent.innerHTML = `
        <!-- Stats Summary -->
        <div class="chart-container full-width">
            <h3>📊 Explorer Summary</h3>
            <div class="explorer-summary-grid">
                <div class="explorer-stat"><div class="es-val">${stats.totalPlays.toLocaleString()}</div><div class="es-label">Total Plays</div></div>
                <div class="explorer-stat"><div class="es-val">${stats.totalHours.toLocaleString()}</div><div class="es-label">Total Hours</div></div>
                <div class="explorer-stat"><div class="es-val">${stats.uniqueTracks.toLocaleString()}</div><div class="es-label">Unique Tracks</div></div>
                <div class="explorer-stat"><div class="es-val">${stats.uniqueArtists.toLocaleString()}</div><div class="es-label">Unique Artists</div></div>
                <div class="explorer-stat"><div class="es-val">${stats.uniqueAlbums.toLocaleString()}</div><div class="es-label">Unique Albums</div></div>
                <div class="explorer-stat"><div class="es-val">${stats.avgMinPerPlay}</div><div class="es-label">Avg Min/Play</div></div>
                <div class="explorer-stat"><div class="es-val">${stats.totalSessions.toLocaleString()}</div><div class="es-label">Sessions</div></div>
                <div class="explorer-stat"><div class="es-val">${stats.avgTracksPerSession}</div><div class="es-label">Avg Tracks/Session</div></div>
            </div>
        </div>

        <!-- Word Cloud -->
        <div class="chart-container">
            <h3>☁️ Track Word Cloud</h3>
            <div id="word-cloud-container" class="word-cloud-container"><canvas id="word-cloud-canvas"></canvas></div>
        </div>

        <!-- Top First Plays by Year -->
        <div class="chart-container">
            <h3>🆕 Discovery Timeline</h3>
            <p style="color:var(--text-muted);font-size:0.82rem;margin-bottom:0.75rem">First time you listened to new tracks, by year.</p>
            <div id="explorer-discovery-list" class="explorer-discovery-list">
                ${buildDiscoveryList(explorerData)}
            </div>
        </div>

        <!-- Listening Sessions -->
        <div class="chart-container full-width">
            <h3>📱 Recent Listening Sessions</h3>
            <p style="color:var(--text-muted);font-size:0.82rem;margin-bottom:0.75rem">Your listening grouped into sessions (gap &lt; 30 min between plays).</p>
            <div id="explorer-sessions" class="explorer-sessions">
                ${buildSessionList(sessions.slice(-20).reverse())}
            </div>
        </div>

        <!-- Full Streaming History -->
        <div class="chart-container full-width">
            <h3>📜 Full Streaming History</h3>
            <div class="explorer-controls">
                <input type="text" id="table-search" placeholder="Search tracks, artists, albums..." class="search-input">
                <select id="table-sort">
                    <option value="date-desc">Newest first</option>
                    <option value="date-asc">Oldest first</option>
                    <option value="minutes-desc">Longest plays</option>
                    <option value="artist-asc">Artist A-Z</option>
                    <option value="track-asc">Track A-Z</option>
                </select>
                <select id="table-type-filter">
                    <option value="all">All types</option>
                    <option value="completed">Completed only</option>
                    <option value="skipped">Skipped only</option>
                </select>
                <span id="table-row-count" class="row-count"></span>
                <button id="table-export-btn" class="secondary-btn" style="margin-left:auto;font-size:0.8rem">Export CSV</button>
            </div>
            <div class="table-container"><table id="data-table" class="df-table"></table></div>
            <div class="explorer-pagination" id="table-pagination"></div>
        </div>
    `;

    renderWordCloud(data);
    currentPage = 0;
    currentQuery = '';
    currentSort = 'date-desc';
    currentTypeFilter = 'all';
    renderDataTable();

    // Wire up controls
    const searchInput = document.getElementById('table-search');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            currentQuery = e.target.value;
            currentPage = 0;
            renderDataTable();
        });
    }

    const sortSel = document.getElementById('table-sort');
    if (sortSel) {
        sortSel.addEventListener('change', e => {
            currentSort = e.target.value;
            currentPage = 0;
            renderDataTable();
        });
    }

    const typeSel = document.getElementById('table-type-filter');
    if (typeSel) {
        typeSel.addEventListener('change', e => {
            currentTypeFilter = e.target.value;
            currentPage = 0;
            renderDataTable();
        });
    }

    const exportBtn = document.getElementById('table-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => exportCSV());
    }

    // Wire session track clicks
    container.querySelectorAll('[data-detail-type]').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
            openDetail(el.dataset.detailName, el.dataset.detailType, el.dataset.detailExtra || '', window.spotifyData.full);
        });
    });
}

function computeExplorerStats(data, sessions) {
    const totalMinutes = data.reduce((s, d) => s + d.durationMin, 0);
    return {
        totalPlays: data.length,
        totalHours: Math.round(totalMinutes / 60),
        uniqueTracks: new Set(data.map(d => d.trackName)).size,
        uniqueArtists: new Set(data.map(d => d.artistName).filter(Boolean)).size,
        uniqueAlbums: new Set(data.map(d => d.albumName).filter(Boolean)).size,
        avgMinPerPlay: data.length > 0 ? (totalMinutes / data.length).toFixed(1) : '0',
        totalSessions: sessions.length,
        avgTracksPerSession: sessions.length > 0 ? (data.length / sessions.length).toFixed(1) : '0'
    };
}

function buildDiscoveryList(data) {
    const firstPlayMap = {};
    const sorted = [...data].sort((a, b) => a.ts - b.ts);
    sorted.forEach(d => {
        const key = `${d.trackName}|||${d.artistName}`;
        if (!firstPlayMap[key]) firstPlayMap[key] = d;
    });

    const byYear = {};
    Object.values(firstPlayMap).forEach(d => {
        byYear[d.year] = (byYear[d.year] || 0) + 1;
    });

    const yearEntries = Object.entries(byYear).sort((a, b) => b[0] - a[0]);
    const maxCount = Math.max(...yearEntries.map(([, c]) => c), 1);

    return yearEntries.map(([year, count]) => `
        <div class="discovery-row">
            <span class="disc-year">${year}</span>
            <div class="disc-bar-wrap"><div class="disc-bar" style="width:${Math.round((count / maxCount) * 100)}%"></div></div>
            <span class="disc-val">${count} new tracks</span>
        </div>
    `).join('');
}

function buildSessionList(sessions) {
    if (!sessions.length) return '<p style="color:var(--text-muted)">No sessions found.</p>';

    return sessions.map(se => {
        const trackList = se.tracks.slice(0, 8).map(t =>
            `<span class="session-track" data-detail-type="track" data-detail-name="${(t.trackName || '').replace(/"/g, '&quot;')}" data-detail-extra="${(t.artistName || '').replace(/"/g, '&quot;')}">${esc(t.trackName)}</span>`
        ).join('<span class="session-arrow">→</span>');
        const more = se.tracks.length > 8 ? `<span class="session-more">+${se.tracks.length - 8} more</span>` : '';

        return `<div class="session-card">
            <div class="session-header">
                <span class="session-date">${se.startDate}</span>
                <span class="session-meta">${se.trackCount} tracks · ${Math.round(se.durationMin)} min</span>
            </div>
            <div class="session-flow">${trackList}${more}</div>
        </div>`;
    }).join('');
}

function getFilteredSorted() {
    let filtered = explorerData;

    if (currentTypeFilter === 'completed') filtered = filtered.filter(d => !d.skipped);
    else if (currentTypeFilter === 'skipped') filtered = filtered.filter(d => d.skipped);

    if (currentQuery) {
        const q = currentQuery.toLowerCase();
        filtered = filtered.filter(d =>
            (d.trackName && d.trackName.toLowerCase().includes(q)) ||
            (d.artistName && d.artistName.toLowerCase().includes(q)) ||
            (d.albumName && d.albumName.toLowerCase().includes(q))
        );
    }

    switch (currentSort) {
        case 'date-asc': filtered = [...filtered].sort((a, b) => a.ts - b.ts); break;
        case 'minutes-desc': filtered = [...filtered].sort((a, b) => b.durationMin - a.durationMin); break;
        case 'artist-asc': filtered = [...filtered].sort((a, b) => (a.artistName || '').localeCompare(b.artistName || '')); break;
        case 'track-asc': filtered = [...filtered].sort((a, b) => (a.trackName || '').localeCompare(b.trackName || '')); break;
        default: filtered = [...filtered].sort((a, b) => b.ts - a.ts);
    }

    return filtered;
}

function renderDataTable() {
    const tableEl = document.getElementById('data-table');
    const countEl = document.getElementById('table-row-count');
    const paginationEl = document.getElementById('table-pagination');
    if (!tableEl) return;

    const filtered = getFilteredSorted();
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    currentPage = Math.min(currentPage, Math.max(0, totalPages - 1));

    if (countEl) countEl.textContent = `${filtered.length.toLocaleString()} rows`;

    const start = currentPage * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);

    const headers = `<thead><tr><th>Date & Time</th><th>Track</th><th>Artist</th><th>Album</th><th>Min</th><th>Platform</th><th>Status</th></tr></thead>`;
    const rows = slice.map(d => `<tr class="${d.skipped ? 'row-skipped' : ''}">
        <td>${d.ts.toLocaleString()}</td>
        <td class="td-track explorer-clickable" data-detail-type="track" data-detail-name="${(d.trackName || '').replace(/"/g, '&quot;')}" data-detail-extra="${(d.artistName || '').replace(/"/g, '&quot;')}">${esc(d.trackName || '')}</td>
        <td class="explorer-clickable" data-detail-type="artist" data-detail-name="${(d.artistName || '').replace(/"/g, '&quot;')}">${esc(d.artistName || '')}</td>
        <td>${esc(d.albumName || '')}</td>
        <td class="td-mins">${Math.round(d.durationMin * 10) / 10}</td>
        <td>${esc(d.platform || '')}</td>
        <td>${d.skipped ? '<span class="skip-badge">skipped</span>' : '<span class="ok-badge">✓</span>'}</td>
    </tr>`).join('');

    tableEl.innerHTML = `${headers}<tbody>${rows}</tbody>`;

    // Click handlers for track/artist names
    tableEl.querySelectorAll('.explorer-clickable').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            openDetail(el.dataset.detailName, el.dataset.detailType, el.dataset.detailExtra || '', window.spotifyData.full);
        });
    });

    // Pagination
    if (paginationEl) {
        if (totalPages <= 1) {
            paginationEl.innerHTML = '';
        } else {
            paginationEl.innerHTML = `
                <button class="page-btn" ${currentPage <= 0 ? 'disabled' : ''} data-page="${currentPage - 1}">◀ Prev</button>
                <span class="page-info">Page ${currentPage + 1} of ${totalPages}</span>
                <button class="page-btn" ${currentPage >= totalPages - 1 ? 'disabled' : ''} data-page="${currentPage + 1}">Next ▶</button>
            `;
            paginationEl.querySelectorAll('.page-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const p = parseInt(btn.dataset.page);
                    if (!isNaN(p) && p >= 0 && p < totalPages) {
                        currentPage = p;
                        renderDataTable();
                        document.getElementById('data-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });
            });
        }
    }
}

function exportCSV() {
    const filtered = getFilteredSorted();
    const header = 'Date,Track,Artist,Album,Minutes,Platform,Skipped\n';
    const rows = filtered.map(d => {
        const csvEsc = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
        return [
            csvEsc(d.ts.toISOString()),
            csvEsc(d.trackName),
            csvEsc(d.artistName),
            csvEsc(d.albumName),
            (d.durationMin).toFixed(2),
            csvEsc(d.platform),
            d.skipped ? 'yes' : 'no'
        ].join(',');
    }).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spotify_history.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function renderWordCloud(data) {
    const canvas = document.getElementById('word-cloud-canvas');
    if (!canvas || typeof WordCloud === 'undefined') return;

    const stop = new Set(['the', 'and', 'feat', 'with', 'from', 'for', 'you', 'your', 'remix', 'version', 'radio', 'edit', 'live']);
    const freq = {};

    data.filter(d => !d.isPodcast).forEach(d => {
        if (d.trackName) freq[d.trackName] = (freq[d.trackName] || 0) + 4;
        if (d.artistName) freq[d.artistName] = (freq[d.artistName] || 0) + 3;
        if (d.albumName) freq[d.albumName] = (freq[d.albumName] || 0) + 2;

        const words = `${d.trackName || ''} ${d.artistName || ''}`.toLowerCase()
            .replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/)
            .filter(w => w && w.length > 2 && !stop.has(w));
        words.forEach(w => {
            const token = w.charAt(0).toUpperCase() + w.slice(1);
            freq[token] = (freq[token] || 0) + 0.8;
        });
    });

    const list = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 220)
        .map(([text, w]) => [text, Math.round(Math.pow(w, 0.72) * 9)]);

    const container = document.getElementById('word-cloud-container');
    if (container) {
        canvas.width = Math.max(680, container.clientWidth * 2);
        canvas.height = Math.max(430, container.clientHeight * 2);
    }

    if (list.length > 0) {
        WordCloud(canvas, {
            list, gridSize: 10,
            weightFactor: size => Math.max(9, size * 0.95),
            fontFamily: 'CircularSp, sans-serif',
            color: (_, weight) => weight > 40 ? '#1DB954' : weight > 28 ? '#7CE9A8' : weight > 20 ? '#B8F6D0' : '#b3b3b3',
            backgroundColor: 'transparent', rotateRatio: 0.28,
            minRotation: -Math.PI / 6, maxRotation: Math.PI / 6,
            drawOutOfBound: false, shuffle: false
        });
    }
}
