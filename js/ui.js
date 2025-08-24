// js/ui.js

import * as store from './store.js';
import * as charts from './charts.js';

// --- REFERENCIAS GLOBALES ---
const kpiGrid = document.getElementById('kpi-grid');
// --- ¡NUEVA REFERENCIA! ---
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
    renderGlobalKPIs(data); // Esta función ahora renderiza AMBAS filas de KPIs
    renderTopItemsList(topTracksTable, store.calculateTopItems(data, 'trackName')); // Cambiado a nueva función
    renderTopItemsList(topArtistsTable, store.calculateTopItems(data, 'artistName')); // Cambiado a nueva función
    charts.renderTimelineChart(store.calculateTimeline(data));
    
    // --- Trends Tab ---
    charts.renderListeningClockChart(store.calculateTemporalDistribution(data, 'hour'));
    charts.renderDayOfWeekChart(store.calculateTemporalDistribution(data, 'weekday'));
    charts.renderMonthlyListeningChart(store.calculateTemporalDistribution(data, 'month'));
    charts.renderYearlyListeningChart(store.calculateTemporalDistribution(data, 'year'));
    renderFullTopItemsTable(topAlbumsTable, store.calculateTopItems(data, 'albumName', 'minutes', 20));

    // --- Wrapped Tab ---
    renderWrappedContent();
    wrappedYearFilter.addEventListener('change', renderWrappedContent);

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
    // --- ¡NUEVA FUNCIÓN PARA RENDERIZAR LOS KPIs AVANZADOS! ---
    advancedKpiGrid.innerHTML = `
        <div class="kpi-card"><h4>Active Days</h4><p>${kpis.activeDays.toLocaleString()}</p><span class="small-text">days you listened</span></div>
        <div class="kpi-card"><h4>Skip Rate</h4><p>${kpis.skipRate}%</p><span class="small-text">of tracks skipped</span></div>
        <div class="kpi-card"><h4>Musical Diversity</h4><p>${kpis.diversity}</p><span class="small-text">artist discovery score</span></div>
    `;
}

// Esta función ha sido renombrada de 'renderTopItemsTable' a 'renderTopItemsList' para mayor claridad
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

function renderFullTopItemsTable(element, items) {
    const headers = `<thead><tr><th>Rank</th><th>Album</th><th>Minutes</th></tr></thead>`;
    const rows = items.map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${item.name}</td>
            <td>${item.minutes.toLocaleString()}</td>
        </tr>
    `).join('');
    element.innerHTML = `<table class="df-table">${headers}<tbody>${rows}</tbody></table>`;
}

function renderDataTable(data) {
    // --- ¡TABLA ACTUALIZADA CON LA COLUMNA "REASON END"! ---
    const headers = `<thead><tr><th>Time</th><th>Track</th><th>Artist</th><th>Reason End</th></tr></thead>`;
    const rows = data.slice(-500).reverse().map(d => `
        <tr>
            <td>${d.ts.toLocaleString()}</td>
            <td>${d.trackName || ''}</td>
            <td>${d.artistName || ''}</td>
            <td>${d.reasonEnd}</td>
        </tr>
    `).join('');
    dataTable.innerHTML = `<table class="df-table">${headers}<tbody>${rows}</tbody></table>`;
}

// El resto de funciones (renderWordCloud, Wrapped, helpers) están bien y no necesitan cambios.
// Las copio aquí para que tengas el archivo completo.

function renderWordCloud(data) {
    const trackNames = data.map(d => d.trackName).filter(Boolean);
    const wordCounts = trackNames.reduce((acc, name) => {
        acc[name] = (acc[name] || 0) + 1;
        return acc;
    }, {});

    const list = Object.entries(wordCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([text, weight]) => [text, Math.log2(weight + 1) * 5]);
    
    if (list.length > 0) {
        WordCloud(wordCloudCanvas, {
            list: list, gridSize: 8, weightFactor: 2.5,
            fontFamily: 'CircularSp, sans-serif', color: 'random-light',
            backgroundColor: 'transparent', shuffle: true
        });
    }
}

export function populateWrappedFilter() {
    const years = [...new Set(window.spotifyData.full.map(d => d.year))].sort((a,b) => b-a);
    wrappedYearFilter.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
}

function renderWrappedContent() {
    const year = parseInt(wrappedYearFilter.value);
    const yearData = window.spotifyData.full.filter(d => d.year === year);
    if (yearData.length === 0) {
        wrappedContent.innerHTML = "<p>No data for this year.</p>";
        return;
    }
    
    const kpis = store.calculateGlobalKPIs(yearData);
    const topTrack = store.calculateTopItems(yearData, 'trackName', 'count', 1)[0];
    const topArtist = store.calculateTopItems(yearData, 'artistName', 'count', 1)[0];
    const top5Artists = store.calculateTopItems(yearData, 'artistName', 'count', 5);
    const artistsThisYear = new Set(yearData.map(d => d.artistName));
    const artistsBefore = new Set(window.spotifyData.full.filter(d => d.year < year).map(d => d.artistName));
    const newArtists = [...artistsThisYear].filter(artist => !artistsBefore.has(artist)).length;
    const hourlyDist = store.calculateTemporalDistribution(yearData, 'hour');
    const favHour = hourlyDist.indexOf(Math.max(...hourlyDist));

    const yearStartDate = new Date(year, 0, 1);
    const yearEndDate = new Date(year, 11, 31);
    let miniHeatmapHtml = '';
    for (let d = yearStartDate; d <= yearEndDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const hasListen = yearData.some(listen => listen.date === dateStr);
        miniHeatmapHtml += `<div class="day-cell ${hasListen ? 'active' : ''}" title="${dateStr}"></div>`;
    }

    wrappedContent.innerHTML = `
        <div class="wrapped-card"> <div class="title">Minutes Listened</div> <div class="value">${kpis.totalMinutes.toLocaleString()}</div> </div>
        <div class="wrapped-card"> <div class="title">Top Track</div> <div class="value">${topTrack.count} plays</div> <div class="subtitle">${topTrack.name}</div> </div>
        <div class="wrapped-card"> <div class="title">Top Artist</div> <div class="value">${topArtist.count} plays</div> <div class="subtitle">${topArtist.name}</div> </div>
        <div class="wrapped-card"> <div class="title">Favorite Hour</div> <div class="value">${favHour}:00</div> <div class="subtitle">Peak listening time</div> </div>
        <div class="wrapped-card"> <div class="title">New Artists</div> <div class="value">${newArtists}</div> <div class="subtitle">Discovered this year</div> </div>
        <div class="wrapped-card"> <div class="title">Top 5 Artists</div> <ul class="list">${top5Artists.map((a, i) => `<li><span class="rank">${i+1}</span> ${a.name}</li>`).join('')}</ul> </div>
        <div class="wrapped-card full-width"> <div class="title">${year} Listening Consistency</div> <div class="mini-heatmap">${miniHeatmapHtml}</div> </div>
    `;
}

export function showLoading(message) {
    document.getElementById('loading-message').textContent = message;
    document.getElementById('loading-overlay').classList.remove('hidden');
}

export function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}