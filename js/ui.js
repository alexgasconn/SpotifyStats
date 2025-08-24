// js/ui.js

import * as store from './store.js';
import * as charts from './charts.js';

// --- REFERENCIAS GLOBALES ---
const kpiGrid = document.getElementById('kpi-grid');
const advancedKpiGrid = document.getElementById('advanced-kpi-grid'); 
const topTracksTable = document.getElementById('top-tracks-table');
const topArtistsTable = document.getElementById('top-artists-table');
const topAlbumsTable = document.getElementById('top-albums-table');
const dataTable = document.getElementById('data-table');
const wordCloudCanvas = document.getElementById('word-cloud-canvas');
const wrappedYearFilter = document.getElementById('wrapped-year-filter');
const wrappedContent = document.getElementById('wrapped-content');

export function renderUI() {
    showLoading('Calculating stats and rendering UI...');
    const data = window.spotifyData.filtered;

    // --- Overview Tab ---
    renderGlobalKPIs(data);
    renderTopItemsList(topTracksTable, store.calculateTopItems(data, 'trackName'));
    renderTopItemsList(topArtistsTable, store.calculateTopItems(data, 'artistName'));
    renderTopItemsList(topAlbumsTable, store.calculateTopItems(data, 'albumName'));
    charts.renderTimelineChart(store.calculateTimeline(data));
    
    // --- Trends Tab ---
    renderTrendCharts(data);

    // --- Wrapped Tab ---
    // La lógica de renderizado del Wrapped ahora está contenida en su propia función.
    renderWrappedContent();
    
    // --- Explorer Tab ---
    renderWordCloud(data);
    renderDataTable(data);

    hideLoading();
}

// --- FUNCIONES DE RENDERIZADO POR SECCIÓN ---

function renderGlobalKPIs(data) {
    const kpis = store.calculateGlobalKPIs(data);
    kpiGrid.innerHTML = `
        <div class="kpi-card"><h4>Total Listening Time</h4><p>${kpis.totalDays.toLocaleString()}</p><span class="small-text">days</span></div>
        <div class="kpi-card"><h4>Unique Tracks</h4><p>${kpis.uniqueTracks.toLocaleString()}</p></div>
        <div class="kpi-card"><h4>Unique Artists</h4><p>${kpis.uniqueArtists.toLocaleString()}</p></div>
        <div class="kpi-card"><h4>Minutes per Day</h4><p>${kpis.minutesPerDay.toLocaleString()}</p><span class="small-text">on average</span></div>
    `;
    advancedKpiGrid.innerHTML = `
        <div class="kpi-card"><h4>Active Days</h4><p>${kpis.activeDays.toLocaleString()}</p><span class="small-text">days you listened</span></div>
        <div class="kpi-card"><h4>Skip Rate</h4><p>${kpis.skipRate}%</p><span class="small-text">of tracks skipped</span></div>
        <div class="kpi-card"><h4>Musical Diversity</h4><p>${kpis.diversity}</p><span class="small-text">artist discovery score</span></div>
    `;
}

function renderTrendCharts(data) {
    const platformData = store.calculateDistributionPercent(data, 'platform');
    const countryData = store.calculateDistributionPercent(data, 'country').slice(0, 10);
    const reasonStartData = store.calculateDistributionPercent(data, 'reasonStart');

    charts.renderDistributionChart('platform-chart', platformData, 'Platform Usage');
    charts.renderDistributionChart('country-chart', countryData, 'Top 10 Countries', 'bar');
    charts.renderDistributionChart('reason-start-chart', reasonStartData, 'Playback Start Reason');
    
    charts.renderListeningClockChart(store.calculateTemporalDistribution(data, 'hour'));
    charts.renderDayOfWeekChart(store.calculateTemporalDistribution(data, 'weekday'));
    charts.renderMonthlyListeningChart(store.calculateTemporalDistribution(data, 'month'));
    charts.renderYearlyListeningChart(store.calculateTemporalDistribution(data, 'year'));
    // renderFullTopItemsTable(topAlbumsTable, store.calculateTopItems(data, 'albumName', 'minutes', 20));
}

function renderTopItemsList(element, items) {
    element.innerHTML = items.map((item, index) => `
        <div class="top-item">
            <span class="rank">${index + 1}</span>
            <div class="item-details">
                <span class="item-name">${item.name}</span>
                ${item.artist ? `<span class="item-artist">${item.artist}</span>` : ''}
            </div>
            <span class="metric">${item.minutes.toLocaleString()} min</span>
        </div>
    `).join('');
}

// function renderFullTopItemsTable(element, items) {
//     const headers = `<thead><tr><th>Rank</th><th>Album</th><th>Minutes</th></tr></thead>`;
//     const rows = items.map((item, index) => `<tr><td>${index + 1}</td><td>${item.name}</td><td>${item.minutes.toLocaleString()}</td></tr>`).join('');
//     element.innerHTML = `<table class="df-table">${headers}<tbody>${rows}</tbody></table>`;
// }

function renderDataTable(data) {
    const headers = `<thead><tr><th>Time</th><th>Track</th><th>Artist</th><th>Reason End</th></tr></thead>`;
    const rows = data.slice(-500).reverse().map(d => `<tr><td>${d.ts.toLocaleString()}</td><td>${d.trackName || ''}</td><td>${d.artistName || ''}</td><td>${d.reasonEnd}</td></tr>`).join('');
    dataTable.innerHTML = `<table class="df-table">${headers}<tbody>${rows}</tbody></table>`;
}

function renderWordCloud(data) {
    const list = Object.entries(data.reduce((acc, d) => {
        if(d.trackName) acc[d.trackName] = (acc[d.trackName] || 0) + 1;
        return acc;
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 100).map(([text, weight]) => [text, Math.log2(weight + 1) * 5]);
    if (list.length > 0) WordCloud(wordCloudCanvas, { list, gridSize: 8, weightFactor: 2.5, fontFamily: 'CircularSp, sans-serif', color: 'random-light', backgroundColor: 'transparent', shuffle: true });
}

export function populateWrappedFilter() {
    const years = [...new Set(window.spotifyData.full.map(d => d.year))].sort((a,b) => b-a);
    wrappedYearFilter.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
}

// Se exporta la función para poder llamarla desde main.js
export function renderWrappedContent() {
    const year = parseInt(wrappedYearFilter.value);
    const stats = store.calculateWrappedStats(year, window.spotifyData.full);

    if (!stats) {
        wrappedContent.innerHTML = "<p>No data for this year.</p>";
        return;
    }

    wrappedContent.innerHTML = `
        <div class="wrapped-card"> <div class="title">Total Minutes</div> <div class="value">${stats.totalMinutes.toLocaleString()}</div> </div>
        <div class="wrapped-card">
            <div class="title">Monthly Breakdown</div>
            <div class="chart-wrapper" style="height: 150px;"><canvas id="wrapped-monthly-chart"></canvas></div>
        </div>
        <div class="wrapped-card"> <div class="title">Unique Tracks</div> <div class="value">${stats.uniques.tracks}</div> <div class="subtitle">${stats.discoveries.tracks}% new</div> </div>
        <div class="wrapped-card"> <div class="title">Unique Artists</div> <div class="value">${stats.uniques.artists}</div> <div class="subtitle">${stats.discoveries.artists}% new</div> </div>
        <div class="wrapped-card"> <div class="title">Unique Albums</div> <div class="value">${stats.uniques.albums}</div> <div class="subtitle">${stats.discoveries.albums}% new</div> </div>
        <div class="wrapped-card"> <div class="title">Skip Rate</div> <div class="value">${stats.skipRate}%</div> <div class="subtitle">of tracks skipped</div> </div>
        <div class="wrapped-card"> <div class="title">Top 5 Songs</div> <ul class="list">${stats.topSong.map((s, i) => `<li><span class="rank">${i+1}</span> ${s.name}</li>`).join('')}</ul> </div>
        <div class="wrapped-card"> <div class="title">Top 5 Artists</div> <ul class="list">${stats.topArtist.map((a, i) => `<li><span class="rank">${i+1}</span> ${a.name}</li>`).join('')}</ul> </div>
        <div class="wrapped-card"> <div class="title">Top 5 Albums</div> <ul class="list">${stats.topAlbum.map((al, i) => `<li><span class="rank">${i+1}</span> ${al.name}</li>`).join('')}</ul> </div>
        
    `;

    setTimeout(() => {
        charts.renderWrappedMonthlyChart(stats.monthlyMinutes);
    }, 0);
}

export function showLoading(message) {
    document.getElementById('loading-message').textContent = message;
    document.getElementById('loading-overlay').classList.remove('hidden');
}

export function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}