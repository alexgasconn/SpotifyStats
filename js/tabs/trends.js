// js/tabs/trends.js — Trends tab: temporal distributions, skip rate, heatmap

import * as store from '../store.js';
import * as charts from '../charts.js';
import { esc } from '../utils.js';

let currentSkipTrendUnit = 'week';

export function renderTrends(data) {
    renderTrendsInsights(data);
    charts.renderListeningClockChart(store.calculateTemporalDistribution(data, 'hour'));
    charts.renderDayOfWeekChart(store.calculateTemporalDistribution(data, 'weekday'));
    charts.renderMonthlyChart(store.calculateTemporalDistribution(data, 'month'));
    charts.renderSeasonChart(store.calculateSeasonDistribution(data));
    charts.renderDistributionChart('reason-start-chart', store.calculateDistributionPercent(data, 'reasonStart').slice(0, 8), 'Start Reason');
    charts.renderDistributionChart('reason-end-chart', store.calculateDistributionPercent(data, 'reasonEnd').slice(0, 8), 'End Reason');
    charts.renderDistributionChart('platform-chart', store.calculateDistributionPercent(data, 'platform').slice(0, 10), 'Platform');
    charts.renderBarChart('country-chart', store.calculateDistributionPercent(data, 'country').slice(0, 15), 'Country');
    charts.renderYearlyChart(store.calculateTemporalDistribution(data, 'year'));
    setupSkipRateTrendControls();
    charts.renderSkipRateTrendChart(store.calculateSkipRateTrend(data, currentSkipTrendUnit), currentSkipTrendUnit);
    charts.renderBubbleChart('weekday-hour-chart', store.calculateWeekdayHourMatrix(data));
}

function renderTrendsInsights(data) {
    let container = document.getElementById('trends-insights');
    if (!container) {
        const chartsGrid = document.querySelector('#trends-tab .charts-grid');
        if (!chartsGrid) return;
        container = document.createElement('div');
        container.id = 'trends-insights';
        container.className = 'trends-insights';
        chartsGrid.insertAdjacentElement('beforebegin', container);
    }

    const music = data.filter(d => !d.isPodcast && d.trackName);
    if (!music.length) { container.innerHTML = ''; return; }

    // Peak hour
    const hourMap = {};
    music.forEach(d => { hourMap[d.hour] = (hourMap[d.hour] || 0) + 1; });
    const peakHour = Object.entries(hourMap).sort((a, b) => b[1] - a[1])[0];

    // Peak weekday (weekday field: Mon=0..Sun=6)
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dowMap = {};
    music.forEach(d => { dowMap[d.weekday] = (dowMap[d.weekday] || 0) + d.durationMin; });
    const peakDay = Object.entries(dowMap).sort((a, b) => b[1] - a[1])[0];

    // Platform leader
    const platMap = {};
    music.forEach(d => { if (d.platform) platMap[d.platform] = (platMap[d.platform] || 0) + 1; });
    const topPlat = Object.entries(platMap).sort((a, b) => b[1] - a[1])[0];
    const platPct = topPlat ? ((topPlat[1] / music.length) * 100).toFixed(0) : 0;

    // Season leader
    const seasons = store.calculateSeasonDistribution(data);
    const topSeason = seasons.sort((a, b) => b.minutes - a.minutes)[0];

    // Average session length (quick estimate: avg plays per active day)
    const dayPlays = {};
    music.forEach(d => { dayPlays[d.date] = (dayPlays[d.date] || 0) + 1; });
    const avgPlaysPerDay = (music.length / Object.keys(dayPlays).length).toFixed(0);

    const pills = [];
    if (peakHour) pills.push({ icon: '🕐', label: 'Peak Hour', value: `${peakHour[0]}:00` });
    if (peakDay) pills.push({ icon: '📅', label: 'Top Day', value: dayNames[peakDay[0]] });
    if (topPlat) pills.push({ icon: '💻', label: 'Main Platform', value: `${esc(topPlat[0])} (${platPct}%)` });
    if (topSeason) pills.push({ icon: '🌤', label: 'Top Season', value: esc(topSeason.label || topSeason.name) });
    pills.push({ icon: '🎵', label: 'Avg plays/day', value: avgPlaysPerDay });

    container.innerHTML = `
        <div class="trends-pills-row">
            ${pills.map(p => `<div class="trends-pill"><span class="tp-icon">${p.icon}</span><span class="tp-label">${p.label}</span><span class="tp-value">${p.value}</span></div>`).join('')}
        </div>`;
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
