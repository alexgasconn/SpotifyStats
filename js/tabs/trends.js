// js/tabs/trends.js — Trends tab: temporal distributions, skip rate, heatmap

import * as store from '../store.js';
import * as charts from '../charts.js';

let currentSkipTrendUnit = 'week';

export function renderTrends(data) {
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
