// js/charts.js — All chart rendering

Chart.register(ChartDataLabels);

let instances = {};

function make(id, config) {
    if (instances[id]) instances[id].destroy();
    const ctx = document.getElementById(id);
    if (ctx) instances[id] = new Chart(ctx, config);
}

const GREEN = '#1DB954';
const COLORS = ['#1DB954', '#17A2B8', '#FFC107', '#FD7E14', '#6F42C1', '#E83E8C', '#20C997', '#DC3545', '#0DCAF0', '#FF6384'];
const GRID = '#282828';
const TICK = '#b3b3b3';

const baseScales = {
    y: { ticks: { color: TICK }, grid: { color: GRID } },
    x: { ticks: { color: TICK }, grid: { display: false } }
};

const noLegend = { legend: { display: false }, datalabels: false };

// ── TIMELINE ──────────────────────────────────────────────────────────────────

export function renderTimelineChart(data, unit = 'week') {
    make('timeline-chart', {
        type: 'bar',
        data: {
            datasets: [{ label: 'Minutes', data, backgroundColor: 'rgba(29,185,84,0.7)', borderColor: GREEN, borderWidth: 1, borderRadius: 2 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { ...noLegend, tooltip: { callbacks: { label: ctx => `${Math.round(ctx.raw.y).toLocaleString()} min` } } },
            scales: {
                x: { type: 'time', time: { unit }, ticks: { color: TICK }, grid: { color: GRID } },
                y: { ticks: { color: TICK }, grid: { color: GRID }, title: { display: true, text: 'Minutes', color: TICK } }
            }
        }
    });
}

// ── TEMPORAL DISTRIBUTIONS ────────────────────────────────────────────────────

export function renderListeningClockChart(hourlyData) {
    make('listening-clock-chart', {
        type: 'polarArea',
        data: {
            labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
            datasets: [{ data: hourlyData, backgroundColor: hourlyData.map((_, i) => `hsla(141, 76%, ${20 + (i / 24) * 40}%, 0.75)`) }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { r: { ticks: { backdropColor: 'transparent', color: TICK }, grid: { color: GRID } } },
            plugins: { legend: { display: false }, datalabels: false }
        }
    });
}

export function renderDayOfWeekChart(data) {
    make('day-of-week-chart', {
        type: 'bar',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{ data, backgroundColor: data.map((_, i) => i >= 5 ? '#FFC107' : GREEN), borderRadius: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { ...noLegend, tooltip: { callbacks: { label: ctx => `${Math.round(ctx.raw).toLocaleString()} min` } } },
            scales: baseScales
        }
    });
}

export function renderMonthlyChart(data) {
    make('monthly-listening-chart', {
        type: 'bar',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            datasets: [{ data, backgroundColor: GREEN, borderRadius: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { ...noLegend, tooltip: { callbacks: { label: ctx => `${Math.round(ctx.raw).toLocaleString()} min` } } },
            scales: baseScales
        }
    });
}

export function renderSeasonChart(data) {
    make('season-chart', {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.label),
            datasets: [{ data: data.map(d => d.value), backgroundColor: ['#1DB954', '#FFC107', '#FD7E14', '#17A2B8'], borderColor: '#121212', borderWidth: 2 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: TICK } },
                datalabels: {
                    color: '#fff', font: { weight: 'bold', size: 12 },
                    formatter: (v, ctx) => {
                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        return total > 0 ? Math.round((v / total) * 100) + '%' : '';
                    }
                },
                tooltip: { callbacks: { label: ctx => `${Math.round(ctx.raw).toLocaleString()} min` } }
            }
        },
        plugins: [ChartDataLabels]
    });
}

export function renderYearlyChart(yearlyData) {
    const labels = yearlyData.map(d => d.year);
    const data = yearlyData.map(d => d.minutes);
    make('yearly-listening-chart', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: data.map((_, i) => `rgba(29,185,84,${0.4 + (i / data.length) * 0.6})`),
                borderColor: GREEN, borderWidth: 1, borderRadius: 5
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                ...noLegend,
                tooltip: { callbacks: { label: ctx => `${Math.round(ctx.raw).toLocaleString()} min` } },
                datalabels: {
                    color: '#fff', font: { weight: 'bold', size: 11 },
                    anchor: 'end', align: 'start',
                    formatter: v => Math.round(v / 60) + 'h'
                }
            },
            scales: { ...baseScales, y: { ...baseScales.y, title: { display: true, text: 'Minutes', color: TICK } } }
        },
        plugins: [ChartDataLabels]
    });
}

export function renderSkipRateTrendChart(data, unit = 'week') {
    make('global-skip-trend-chart', {
        type: 'line',
        data: {
            datasets: [{
                label: 'Skip Rate %',
                data,
                parsing: { xAxisKey: 'x', yAxisKey: 'y' },
                borderColor: '#FFC107',
                backgroundColor: 'rgba(255, 193, 7, 0.20)',
                pointRadius: 2,
                pointHoverRadius: 5,
                borderWidth: 2,
                tension: 0.25,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: false,
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const raw = ctx.raw || {};
                            return `${raw.y}% skip (${raw.skipped || 0}/${raw.plays || 0} plays)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit },
                    ticks: { color: TICK },
                    grid: { color: GRID }
                },
                y: {
                    min: 0,
                    max: 100,
                    ticks: { color: TICK, callback: v => `${v}%` },
                    grid: { color: GRID },
                    title: { display: true, text: 'Skip Rate', color: TICK }
                }
            }
        }
    });
}

// ── DISTRIBUTION ──────────────────────────────────────────────────────────────

export function renderDistributionChart(canvasId, data, title) {
    make(canvasId, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.value),
            datasets: [{ data: data.map(d => d.count || parseFloat(d.percent)), backgroundColor: COLORS, borderColor: '#121212', borderWidth: 2 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: TICK, boxWidth: 12 } },
                datalabels: {
                    color: '#fff', font: { weight: 'bold', size: 10 },
                    formatter: (v, ctx) => {
                        const t = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        const pct = Math.round((v / t) * 100);
                        return pct >= 5 ? pct + '%' : '';
                    }
                },
                title: { display: false }
            }
        },
        plugins: [ChartDataLabels]
    });
}

export function renderBarChart(canvasId, data, title) {
    make(canvasId, {
        type: 'bar',
        data: {
            labels: data.map(d => d.value),
            datasets: [{ data: data.map(d => d.count || parseFloat(d.percent)), backgroundColor: GREEN, borderRadius: 3 }]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: { ...noLegend, tooltip: { callbacks: { label: ctx => `${ctx.raw.toLocaleString()} plays` } } },
            scales: {
                y: { ticks: { color: TICK }, grid: { display: false } },
                x: { ticks: { color: TICK }, grid: { color: GRID } }
            }
        }
    });
}

// ── HEATMAP / BUBBLE ──────────────────────────────────────────────────────────

export function renderBubbleChart(canvasId, matrixData) {
    const maxCount = Math.max(...matrixData.map(d => d.count || 0), 1);
    const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const toHourLabel = hour => {
        const h = Number(hour);
        if (h === 0) return '12am';
        if (h < 12) return `${h}am`;
        if (h === 12) return '12pm';
        return `${h - 12}pm`;
    };

    // 3-stop gradient: dark green -> spotify green -> bright mint
    const colorFor = count => {
        const t = Math.max(0, Math.min(1, count / maxCount));
        const r = Math.round(12 + (124 * t));
        const g = Math.round(80 + (175 * t));
        const b = Math.round(44 + (124 * t));
        return `rgba(${r},${g},${b},0.82)`;
    };

    make(canvasId, {
        type: 'bubble',
        data: {
            datasets: [{
                data: matrixData,
                backgroundColor: matrixData.map(d => colorFor(d.count || 0)),
                borderColor: matrixData.map(d => colorFor((d.count || 0) * 0.9)),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false }, datalabels: false,
                tooltip: {
                    callbacks: {
                        title: ctxItems => {
                            const p = ctxItems[0]?.raw;
                            if (!p) return '';
                            return `${weekdayNames[p.y] || ''} · ${toHourLabel(p.x)}`;
                        },
                        label: ctx => `${ctx.raw.count} plays`
                    }
                }
            },
            scales: {
                y: {
                    min: -0.5, max: 6.5,
                    ticks: { color: TICK, stepSize: 1, callback: v => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][v] || '' },
                    grid: { color: GRID }
                },
                x: {
                    min: -0.5, max: 23.5,
                    ticks: { color: TICK, stepSize: 1 },
                    grid: { display: false },
                    title: { display: true, text: 'Hour of Day', color: TICK }
                }
            }
        }
    });
}

// ── F1 CHAMPIONSHIP ───────────────────────────────────────────────────────────

export function renderF1EvolutionChart(labels, series) {
    make('f1-evolution-chart', {
        type: 'line',
        data: {
            labels,
            datasets: series.map((s, i) => ({
                label: s.subtitle ? `${s.name} — ${s.subtitle}` : s.name,
                data: s.data,
                borderColor: COLORS[i % COLORS.length],
                backgroundColor: COLORS[i % COLORS.length] + '33',
                tension: 0.25,
                pointRadius: 2,
                borderWidth: 2
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: TICK, boxWidth: 10 }
                },
                datalabels: false,
                tooltip: {
                    callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} pts` }
                }
            },
            scales: {
                x: { ticks: { color: TICK }, grid: { display: false } },
                y: { ticks: { color: TICK }, grid: { color: GRID }, title: { display: true, text: 'Cumulative Points', color: TICK } }
            }
        }
    });
}

// ── WRAPPED ───────────────────────────────────────────────────────────────────

export function renderWrappedMonthlyChart(monthlyData) {
    make('wrapped-monthly-chart', {
        type: 'bar',
        data: {
            labels: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
            datasets: [{ data: monthlyData, backgroundColor: GREEN, borderRadius: 3 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, datalabels: false },
            scales: {
                y: { display: false, grid: { display: false } },
                x: { ticks: { color: TICK }, grid: { display: false } }
            }
        }
    });
}

// ── ARTIST COMPARE ───────────────────────────────────────────────────────────

export function renderCompareRaceChart(canvasId, labels, seriesA, seriesB, artistA, artistB, yTitle = 'Cumulative Minutes') {
    make(canvasId, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: `${artistA} cumulative`,
                    data: seriesA,
                    borderColor: '#1DB954',
                    backgroundColor: 'rgba(29,185,84,0.15)',
                    borderWidth: 2,
                    pointRadius: 1.5,
                    pointHoverRadius: 4,
                    tension: 0.22,
                    fill: false
                },
                {
                    label: `${artistB} cumulative`,
                    data: seriesB,
                    borderColor: '#17A2B8',
                    backgroundColor: 'rgba(23,162,184,0.15)',
                    borderWidth: 2,
                    pointRadius: 1.5,
                    pointHoverRadius: 4,
                    tension: 0.22,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: TICK, boxWidth: 12 } },
                datalabels: false
            },
            scales: {
                x: {
                    ticks: { color: TICK, maxTicksLimit: 10, autoSkip: true },
                    grid: { display: false }
                },
                y: {
                    ticks: { color: TICK },
                    grid: { color: GRID },
                    title: { display: true, text: yTitle, color: TICK }
                }
            }
        }
    });
}

export function renderCompareGroupedBar(canvasId, labels, aValues, bValues, artistA, artistB, yTitle) {
    make(canvasId, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: artistA,
                    data: aValues,
                    backgroundColor: 'rgba(29,185,84,0.8)',
                    borderColor: '#1DB954',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: artistB,
                    data: bValues,
                    backgroundColor: 'rgba(23,162,184,0.8)',
                    borderColor: '#17A2B8',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: TICK, boxWidth: 12 } },
                datalabels: false
            },
            scales: {
                x: { ticks: { color: TICK }, grid: { display: false } },
                y: {
                    ticks: { color: TICK },
                    grid: { color: GRID },
                    title: { display: true, text: yTitle, color: TICK }
                }
            }
        }
    });
}

export function renderCompareSessionViolinLike(canvasId, artistA, artistB, distA, distB) {
    const labels = [artistA, artistB];
    const ranges = [
        [distA.q10, distA.q90],
        [distB.q10, distB.q90]
    ];

    make(canvasId, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'P10-P90 range',
                    data: ranges,
                    backgroundColor: ['rgba(29,185,84,0.25)', 'rgba(23,162,184,0.25)'],
                    borderColor: ['#1DB954', '#17A2B8'],
                    borderWidth: 1,
                    borderRadius: 6,
                    barPercentage: 0.55,
                    categoryPercentage: 0.7
                },
                {
                    type: 'line',
                    label: 'Median',
                    data: [distA.q50, distB.q50],
                    borderColor: '#FFC107',
                    backgroundColor: '#FFC107',
                    borderWidth: 0,
                    pointRadius: 6,
                    pointHoverRadius: 7,
                    showLine: false
                },
                {
                    type: 'line',
                    label: 'IQR (Q25-Q75)',
                    data: [distA.q25, distB.q25],
                    borderColor: '#8fd9a8',
                    backgroundColor: '#8fd9a8',
                    borderWidth: 0,
                    pointRadius: 4,
                    pointHoverRadius: 5,
                    showLine: false
                },
                {
                    type: 'line',
                    data: [distA.q75, distB.q75],
                    borderColor: '#8fd9a8',
                    backgroundColor: '#8fd9a8',
                    borderWidth: 0,
                    pointRadius: 4,
                    pointHoverRadius: 5,
                    showLine: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: TICK, boxWidth: 12 } },
                datalabels: false,
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.type === 'bar') {
                                const range = ctx.raw || [0, 0];
                                return `P10-P90: ${range[0]}-${range[1]} min`;
                            }
                            if (ctx.dataset.label === 'Median') return `Median: ${ctx.raw} min`;
                            if (ctx.dataset.label === 'IQR (Q25-Q75)') return `Q25: ${ctx.raw} min`;
                            return `Q75: ${ctx.raw} min`;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: TICK }, grid: { display: false } },
                y: {
                    ticks: { color: TICK },
                    grid: { color: GRID },
                    title: { display: true, text: 'Daily minutes distribution', color: TICK }
                }
            }
        }
    });
}
