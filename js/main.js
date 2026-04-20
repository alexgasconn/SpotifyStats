// js/main.js — Application bootstrap & filter management

import { processSpotifyZip, setF1Weight } from './store.js';
import { showLoading, hideLoading, setLoadingProgress, renderUI, renderStreaksTab, renderDeepDiveTab, renderF1Tab, renderExplorerTab, renderViewerTab, renderCompareTab, populateWrappedFilter, renderWrappedContent } from './ui.js';
import { setupGame } from './tabs/game.js';
import * as podcasts from './tabs/podcasts.js';
import { openDetail, closeDetail } from './detail.js';
import { renderCalendarTab } from './tabs/calendar.js';

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
    const artistFilterSearch = document.getElementById('artist-filter-search');
    const albumFilterSearch = document.getElementById('album-filter-search');
    const trackFilterSearch = document.getElementById('track-filter-search');
    const artistFilterMeta = document.getElementById('artist-filter-meta');
    const albumFilterMeta = document.getElementById('album-filter-meta');
    const trackFilterMeta = document.getElementById('track-filter-meta');
    const platformFilter = document.getElementById('platform-filter');
    const countryFilter = document.getElementById('country-filter');
    const timeOfDayFilter = document.getElementById('timeofday-filter');
    const skipFilter = document.getElementById('skip-filter');

    const applyBtn = document.getElementById('apply-filter-btn');
    const resetFiltersBtn = document.getElementById('reset-filters-btn');
    const resetBtn = document.getElementById('reset-btn');
    const filtersPanel = document.querySelector('.filters-panel');
    const toggleFiltersBtn = document.getElementById('toggle-filters-btn');

    const wrappedYearFilter = document.getElementById('wrapped-year-filter');
    const multiSelectState = new Map();
    const searchableFilters = [
        { key: 'artist', select: artistFilter, search: artistFilterSearch, meta: artistFilterMeta },
        { key: 'album', select: albumFilter, search: albumFilterSearch, meta: albumFilterMeta },
        { key: 'track', select: trackFilter, search: trackFilterSearch, meta: trackFilterMeta }
    ];

    window.spotifyData = { full: [], filtered: [] };

    setupSearchableMultiSelects();

    // ── SETTINGS TOGGLE ─────────────────────────
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsGrid = document.getElementById('settings-grid');
    const cfgSkipMode = document.getElementById('cfg-skip-mode');
    const cfgSkipThresholdRow = document.getElementById('cfg-skip-threshold-row');

    settingsToggle?.addEventListener('click', () => {
        const open = settingsGrid.classList.toggle('hidden');
        settingsToggle.classList.toggle('open', !open);
    });

    // Show/hide skip threshold row depending on skip mode
    cfgSkipMode?.addEventListener('change', () => {
        cfgSkipThresholdRow.style.display = cfgSkipMode.value === 'reason' ? 'none' : '';
    });

    function readConfig() {
        return {
            minPlayMs: (parseInt(document.getElementById('cfg-min-play')?.value) || 30) * 1000,
            skipMode: document.getElementById('cfg-skip-mode')?.value || 'both',
            skipThresholdMs: (parseInt(document.getElementById('cfg-skip-threshold')?.value) || 30) * 1000,
            topN: parseInt(document.getElementById('cfg-top-n')?.value) || 10,
            streakGapDays: parseInt(document.getElementById('cfg-streak-gap')?.value) || 1,
            includePodcasts: document.getElementById('cfg-podcasts')?.checked ?? true,
            includeOffline: document.getElementById('cfg-offline')?.checked ?? true,
            includeIncognito: document.getElementById('cfg-incognito')?.checked ?? false,
            f1MinutesWeight: parseInt(document.getElementById('cfg-f1-weight')?.value) || 50,
        };
    }

    // ── F1 WEIGHT SLIDER (initial settings) ────
    const cfgF1Weight = document.getElementById('cfg-f1-weight');
    const cfgF1Plays = document.getElementById('cfg-f1-weight-plays');
    const cfgF1Minutes = document.getElementById('cfg-f1-weight-minutes');
    cfgF1Weight?.addEventListener('input', () => {
        const v = parseInt(cfgF1Weight.value) || 50;
        if (cfgF1Plays) cfgF1Plays.textContent = (100 - v) + '%';
        if (cfgF1Minutes) cfgF1Minutes.textContent = v + '%';
    });

    // ── UPLOAD ──────────────────────────────────
    uploadButton.addEventListener('click', () => zipInput.click());

    zipInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showLoading('Preparing your ZIP...');
        setLoadingProgress(2, 'Preparing your ZIP...');
        try {
            const config = readConfig();
            window.spotifyConfig = config;
            const data = await processSpotifyZip(file, config, (progress, status) => {
                setLoadingProgress(progress, status);
            });
            window.spotifyData.full = data;
            window.spotifyData.filtered = data;

            setLoadingProgress(88, 'Preparing filters and tabs...');

            uploadSection.classList.add('hidden');
            dashboardSection.classList.remove('hidden');

            initDateFilters(data);
            populateDropdowns(data);
            setupTabNavigation();
            setupGame();
            populateWrappedFilter();
            wrappedYearFilter?.addEventListener('change', renderWrappedContent);

            setLoadingProgress(93, 'Rendering overview and trends...');
            renderUI();

            setLoadingProgress(97, 'Rendering advanced tabs...');
            renderStreaksTab();
            renderDeepDiveTab();
            renderExplorerTab(data);
            renderCompareTab();
            podcasts.renderPodcastUI(data);

            setLoadingProgress(100, 'Done! Launching dashboard...');

        } catch (err) {
            console.error(err);
            alert(`Error processing file: ${err.message}`);
        } finally {
            setTimeout(() => hideLoading(), 250);
        }
    });

    // ── FILTERS ─────────────────────────────────
    applyBtn.addEventListener('click', applyFilters);

    resetFiltersBtn.addEventListener('click', () => {
        const data = window.spotifyData.full;
        initDateFilters(data);
        yearFilter.value = '';
        seasonFilter.value = '';
        clearSearchableMultiSelect(artistFilter);
        clearSearchableMultiSelect(albumFilter);
        clearSearchableMultiSelect(trackFilter);
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

    toggleFiltersBtn?.addEventListener('click', () => {
        if (!filtersPanel) return;
        const collapsed = filtersPanel.classList.toggle('filters-collapsed');
        toggleFiltersBtn.textContent = collapsed ? 'Show Filters' : 'Hide Filters';
    });

    // ── ENTITY FILTERS TOGGLE ───────────────────
    const toggleEntitiesBtn = document.getElementById('toggle-entities-btn');
    const entitiesPanel = document.getElementById('filters-entities-panel');
    toggleEntitiesBtn?.addEventListener('click', () => {
        const isCollapsed = entitiesPanel.classList.toggle('filters-entities-collapsed');
        toggleEntitiesBtn.classList.toggle('open', !isCollapsed);
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
                if (tabId === 'f1-tab') renderF1Tab();
                if (tabId === 'explorer-tab') renderExplorerTab(window.spotifyData.filtered);
                if (tabId === 'viewer-tab') renderViewerTab();
                if (tabId === 'compare-tab') renderCompareTab();
                if (tabId === 'calendar-tab') renderCalendarTab();
                if (tabId === 'podcast-tab') podcasts.renderPodcastUI(window.spotifyData.filtered);
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

        // Count play counts for each artist - ordered by play count
        const artistCounts = {};
        music.forEach(d => {
            if (d.artistName) {
                artistCounts[d.artistName] = (artistCounts[d.artistName] || 0) + 1;
            }
        });
        const artists = Object.keys(artistCounts)
            .sort((a, b) => sortByCountThenName(artistCounts, a, b));
        setSearchableMultiSelectOptions(artistFilter, artists);

        // Count play counts for each album - ordered by play count
        const albumCounts = {};
        music.forEach(d => {
            if (d.albumName) {
                albumCounts[d.albumName] = (albumCounts[d.albumName] || 0) + 1;
            }
        });
        const albums = Object.keys(albumCounts)
            .sort((a, b) => sortByCountThenName(albumCounts, a, b));
        setSearchableMultiSelectOptions(albumFilter, albums);

        // Count play counts for each track - ordered by play count
        const trackCounts = {};
        music.forEach(d => {
            if (d.trackName) {
                trackCounts[d.trackName] = (trackCounts[d.trackName] || 0) + 1;
            }
        });
        const tracks = Object.keys(trackCounts)
            .sort((a, b) => sortByCountThenName(trackCounts, a, b));
        setSearchableMultiSelectOptions(trackFilter, tracks);

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
            const artists = getSearchableMultiSelectValues(artistFilter);
            const albums = getSearchableMultiSelectValues(albumFilter);
            const tracks = getSearchableMultiSelectValues(trackFilter);
            const platform = platformFilter.value;
            const country = countryFilter.value;
            const timeOfDay = timeOfDayFilter.value;
            const skipMode = skipFilter.value;

            window.spotifyData.filtered = window.spotifyData.full.filter(d => {
                if (from && d.date < from) return false;
                if (to && d.date > to) return false;
                if (year && String(d.year) !== String(year)) return false;
                if (season && d.season !== season) return false;
                if (artists.length > 0 && !artists.includes(d.artistName)) return false;
                if (albums.length > 0 && !albums.includes(d.albumName)) return false;
                if (tracks.length > 0 && !tracks.includes(d.trackName)) return false;
                if (platform && d.platform !== platform) return false;
                if (country && d.country !== country) return false;
                if (timeOfDay && d.timeOfDay !== timeOfDay) return false;
                if (skipMode === 'completed' && d.skipped) return false;
                if (skipMode === 'skipped' && !d.skipped) return false;
                return true;
            });

            // Format for display in pills
            const artistLabel = summarizeSelectedItems(artists);
            const albumLabel = summarizeSelectedItems(albums);
            const trackLabel = summarizeSelectedItems(tracks);

            renderFilterPills({
                from, to, year, season,
                artist: artistLabel || null,
                album: albumLabel || null,
                track: trackLabel || null,
                platform, country, timeOfDay, skipMode
            });

            renderUI();
            renderStreaksTab();
            renderDeepDiveTab();
            renderF1Tab();
            renderExplorerTab(window.spotifyData.filtered);
            renderViewerTab();
            renderCompareTab();
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
                if (key === 'artist' || key === 'album' || key === 'track') {
                    const elMap = { artist: artistFilter, album: albumFilter, track: trackFilter };
                    const el = elMap[key];
                    if (el) clearSearchableMultiSelect(el);
                } else {
                    const elMap = { from: dateFrom, to: dateTo, year: yearFilter, season: seasonFilter, platform: platformFilter, country: countryFilter, timeOfDay: timeOfDayFilter, skipMode: skipFilter };
                    const el = elMap[key];
                    if (el) {
                        if (el.type === 'date') { const data = window.spotifyData.full; initDateFilters(data); }
                        else el.value = '';
                    }
                }
                applyFilters();
            });
        });
    }

    function escOpt(str) {
        return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escText(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function sortByCountThenName(counts, a, b) {
        const diff = (counts[b] || 0) - (counts[a] || 0);
        if (diff !== 0) return diff;
        return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
    }

    function setupSearchableMultiSelects() {
        searchableFilters.forEach(({ select, search }) => {
            if (!select || !search) return;

            multiSelectState.set(select.id, { options: [], selected: [], query: '' });

            search.addEventListener('input', e => {
                const state = multiSelectState.get(select.id);
                if (!state) return;
                state.query = e.target.value || '';
                renderSearchableMultiSelect(select);
            });

            select.addEventListener('change', () => {
                syncVisibleSelection(select);
                renderSearchableMultiSelect(select, false);
            });
        });
    }

    function setSearchableMultiSelectOptions(select, values) {
        const state = multiSelectState.get(select.id);
        if (!state) return;

        const validValues = new Set(values);
        state.options = values.map(value => ({ value, label: value }));
        state.selected = state.selected.filter(value => validValues.has(value));
        renderSearchableMultiSelect(select, false);
    }

    function renderSearchableMultiSelect(select, preserveScroll = true) {
        const state = multiSelectState.get(select.id);
        if (!state) return;

        const scrollTop = select.scrollTop;
        const query = state.query.trim().toLowerCase();
        const selected = new Set(state.selected);
        const visible = state.options.filter(option => selected.has(option.value) || !query || option.label.toLowerCase().includes(query));

        select.innerHTML = visible.length
            ? visible.map(option => `<option value="${escOpt(option.value)}"${selected.has(option.value) ? ' selected' : ''}>${escText(option.label)}</option>`).join('')
            : '<option value="" disabled>No matches found</option>';

        if (preserveScroll) select.scrollTop = scrollTop;
        updateSearchableMultiSelectMeta(select, visible.length);
    }

    function syncVisibleSelection(select) {
        const state = multiSelectState.get(select.id);
        if (!state) return;

        const visibleValues = new Set(Array.from(select.options).map(option => option.value).filter(Boolean));
        const nextSelected = new Set(state.selected.filter(value => !visibleValues.has(value)));
        Array.from(select.selectedOptions).forEach(option => {
            if (option.value) nextSelected.add(option.value);
        });
        state.selected = state.options
            .map(option => option.value)
            .filter(value => nextSelected.has(value));
    }

    function updateSearchableMultiSelectMeta(select, visibleCount = null) {
        const config = searchableFilters.find(entry => entry.select === select);
        const state = multiSelectState.get(select.id);
        if (!config?.meta || !state) return;

        const total = state.options.length;
        const selectedCount = state.selected.length;
        const shown = visibleCount === null ? total : visibleCount;

        config.meta.textContent = state.query
            ? `${selectedCount} selected · ${shown} shown of ${total}`
            : `${selectedCount} selected · ${total} available`;
    }

    function getSearchableMultiSelectValues(select) {
        const state = multiSelectState.get(select.id);
        if (!state) return Array.from(select.selectedOptions).map(option => option.value).filter(Boolean);
        return [...state.selected];
    }

    function clearSearchableMultiSelect(select) {
        const config = searchableFilters.find(entry => entry.select === select);
        const state = multiSelectState.get(select.id);
        if (!state) return;

        state.selected = [];
        state.query = '';
        if (config?.search) config.search.value = '';
        renderSearchableMultiSelect(select, false);
    }

    function summarizeSelectedItems(values) {
        if (!values.length) return '';
        if (values.length <= 2) return values.join(', ');
        return `${values[0]}, ${values[1]} +${values.length - 2}`;
    }
});
