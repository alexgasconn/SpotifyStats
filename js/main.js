// js/main.js — Application bootstrap & filter management

import { processSpotifyZip } from './store.js';
import { showLoading, hideLoading, renderUI, renderStreaksTab, renderDeepDiveTab, renderExplorerTab, populateWrappedFilter, renderWrappedContent } from './ui.js';
import { setupGame } from './game.js';
import * as podcasts from './podcasts.js';
import { openDetail, closeDetail } from './detail.js';

document.addEventListener('DOMContentLoaded', () => {

    // ── REFERENCES ──────────────────────────────
    const uploadSection = document.getElementById('upload-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const zipInput = document.getElementById('zip-input');
    const uploadButton = document.getElementById('upload-button');

    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');
    const yearFilter = document.getElementById('year-filter');
    const seasonFilter = document.getElementById('season-filter');
    const artistFilter = document.getElementById('artist-filter');
    const albumFilter = document.getElementById('album-filter');
    const trackFilter = document.getElementById('track-filter');
    const platformFilter = document.getElementById('platform-filter');
    const countryFilter = document.getElementById('country-filter');
    const timeOfDayFilter = document.getElementById('timeofday-filter');
    const skipFilter = document.getElementById('skip-filter');

    const applyBtn = document.getElementById('apply-filter-btn');
    const resetFiltersBtn = document.getElementById('reset-filters-btn');
    const resetBtn = document.getElementById('reset-btn');

    const wrappedYearFilter = document.getElementById('wrapped-year-filter');

    window.spotifyData = { full: [], filtered: [] };

    // ── UPLOAD ──────────────────────────────────
    uploadButton.addEventListener('click', () => zipInput.click());

    zipInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showLoading('Unzipping and processing files...');
        try {
            const data = await processSpotifyZip(file);
            window.spotifyData.full = data;
            window.spotifyData.filtered = data;

            uploadSection.classList.add('hidden');
            dashboardSection.classList.remove('hidden');

            initDateFilters(data);
            populateDropdowns(data);
            setupTabNavigation();
            setupGame();
            populateWrappedFilter();
            wrappedYearFilter?.addEventListener('change', renderWrappedContent);

            renderUI();
            renderStreaksTab();
            renderDeepDiveTab();
            renderExplorerTab(data);
            podcasts.renderPodcastUI(data);

        } catch (err) {
            console.error(err);
            alert(`Error processing file: ${err.message}`);
        } finally {
            hideLoading();
        }
    });

    // ── FILTERS ─────────────────────────────────
    applyBtn.addEventListener('click', applyFilters);

    resetFiltersBtn.addEventListener('click', () => {
        const data = window.spotifyData.full;
        initDateFilters(data);
        yearFilter.value = '';
        seasonFilter.value = '';
        artistFilter.value = '';
        albumFilter.value = '';
        trackFilter.value = '';
        platformFilter.value = '';
        countryFilter.value = '';
        timeOfDayFilter.value = '';
        skipFilter.value = '';
        applyFilters();
    });

    resetBtn.addEventListener('click', () => {
        dashboardSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
        window.spotifyData = { full: [], filtered: [] };
        zipInput.value = '';
    });

    // ── DETAIL MODAL ────────────────────────────
    document.getElementById('detail-close-btn')?.addEventListener('click', closeDetail);
    document.getElementById('detail-modal-backdrop')?.addEventListener('click', closeDetail);

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeDetail();
    });

    // ── TAB NAVIGATION ──────────────────────────
    function setupTabNavigation() {
        document.querySelectorAll('.tab-link').forEach(link => {
            link.addEventListener('click', () => {
                const tabId = link.dataset.tab;
                document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                link.classList.add('active');
                document.getElementById(tabId)?.classList.add('active');

                // Lazy render tabs that are expensive
                if (tabId === 'streaks-tab') renderStreaksTab();
                if (tabId === 'deepdive-tab') renderDeepDiveTab();
                if (tabId === 'explorer-tab') renderExplorerTab(window.spotifyData.filtered);
            });
        });
    }

    // ── DATE FILTER INIT ────────────────────────
    function initDateFilters(data) {
        if (!data.length) return;
        const first = data[0].date;
        const last = data[data.length - 1].date;
        dateFrom.min = first; dateFrom.max = last; dateFrom.value = first;
        dateTo.min = first; dateTo.max = last; dateTo.value = last;
    }

    // ── POPULATE DROPDOWNS ──────────────────────
    function populateDropdowns(data) {
        const music = data.filter(d => !d.isPodcast && d.trackName);

        const years = [...new Set(music.map(d => d.year))].sort((a, b) => b - a);
        yearFilter.innerHTML = '<option value="">All Years</option>' +
            years.map(y => `<option value="${y}">${y}</option>`).join('');

        const artists = [...new Set(music.map(d => d.artistName).filter(Boolean))].sort();
        artistFilter.innerHTML = '<option value="">All Artists</option>' +
            artists.map(a => `<option value="${escOpt(a)}">${escOpt(a)}</option>`).join('');

        const albums = [...new Set(music.map(d => d.albumName).filter(Boolean))].sort();
        albumFilter.innerHTML = '<option value="">All Albums</option>' +
            albums.map(a => `<option value="${escOpt(a)}">${escOpt(a)}</option>`).join('');

        const tracks = [...new Set(music.map(d => d.trackName).filter(Boolean))].sort();
        trackFilter.innerHTML = '<option value="">All Tracks</option>' +
            tracks.map(t => `<option value="${escOpt(t)}">${escOpt(t)}</option>`).join('');

        const platforms = [...new Set(data.map(d => d.platform).filter(Boolean))].sort();
        platformFilter.innerHTML = '<option value="">All Platforms</option>' +
            platforms.map(p => `<option value="${escOpt(p)}">${escOpt(p)}</option>`).join('');

        const countries = [...new Set(data.map(d => d.country).filter(Boolean))].sort();
        countryFilter.innerHTML = '<option value="">All Countries</option>' +
            countries.map(c => `<option value="${escOpt(c)}">${escOpt(c)}</option>`).join('');
    }

    // ── APPLY FILTERS ───────────────────────────
    function applyFilters() {
        showLoading('Applying filters...');

        setTimeout(() => {
            const from = dateFrom.value;
            const to = dateTo.value;
            const year = yearFilter.value;
            const season = seasonFilter.value;
            const artist = artistFilter.value;
            const album = albumFilter.value;
            const track = trackFilter.value;
            const platform = platformFilter.value;
            const country = countryFilter.value;
            const timeOfDay = timeOfDayFilter.value;
            const skipMode = skipFilter.value;

            window.spotifyData.filtered = window.spotifyData.full.filter(d => {
                if (from && d.date < from) return false;
                if (to && d.date > to) return false;
                if (year && String(d.year) !== String(year)) return false;
                if (season && d.season !== season) return false;
                if (artist && d.artistName !== artist) return false;
                if (album && d.albumName !== album) return false;
                if (track && d.trackName !== track) return false;
                if (platform && d.platform !== platform) return false;
                if (country && d.country !== country) return false;
                if (timeOfDay && d.timeOfDay !== timeOfDay) return false;
                if (skipMode === 'completed' && d.skipped) return false;
                if (skipMode === 'skipped' && !d.skipped) return false;
                return true;
            });

            renderFilterPills({ from, to, year, season, artist, album, track, platform, country, timeOfDay, skipMode });

            renderUI();
            renderStreaksTab();
            renderDeepDiveTab();
            renderExplorerTab(window.spotifyData.filtered);
            podcasts.renderPodcastUI(window.spotifyData.filtered);

            hideLoading();
        }, 50);
    }

    // ── FILTER PILLS ────────────────────────────
    function renderFilterPills(filters) {
        const container = document.getElementById('active-filter-pills');
        if (!container) return;
        const active = Object.entries(filters).filter(([, v]) => v);
        if (!active.length) { container.innerHTML = ''; return; }

        const labelMap = {
            from: 'From', to: 'To', year: 'Year', season: 'Season',
            artist: 'Artist', album: 'Album', track: 'Track',
            platform: 'Platform', country: 'Country',
            timeOfDay: 'Time of Day', skipMode: 'Skip'
        };

        container.innerHTML = active.map(([k, v]) => `
            <span class="filter-pill">
                ${labelMap[k] || k}: <strong>${v}</strong>
                <button data-key="${k}" title="Remove filter">x</button>
            </span>
        `).join('');

        container.querySelectorAll('button[data-key]').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.key;
                const elMap = { from: dateFrom, to: dateTo, year: yearFilter, season: seasonFilter, artist: artistFilter, album: albumFilter, track: trackFilter, platform: platformFilter, country: countryFilter, timeOfDay: timeOfDayFilter, skipMode: skipFilter };
                const el = elMap[key];
                if (el) {
                    if (el.type === 'date') { const data = window.spotifyData.full; initDateFilters(data); }
                    else el.value = '';
                }
                applyFilters();
            });
        });
    }

    function escOpt(str) {
        return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
});
