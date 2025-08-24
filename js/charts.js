let chartInstances = {};

function createOrUpdateChart(canvasId, config) {
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }
    const ctx = document.getElementById(canvasId);
    if (ctx) {
       chartInstances[canvasId] = new Chart(ctx.getContext('2d'), config);
    }
}

// --- GRÁFICOS ---

export function renderTimelineChart(timelineData) {
    createOrUpdateChart('timeline-chart', {
        type: 'bar',
        data: {
            datasets: [{
                label: 'Minutes Listened',
                data: timelineData,
                backgroundColor: '#1DB954',
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'month' },
                    ticks: { color: '#b3b3b3' },
                    grid: { color: '#282828' }
                },
                y: {
                    ticks: { color: '#b3b3b3' },
                    grid: { color: '#282828' },
                    title: { display: true, text: 'Minutes', color: '#b3b3b3' }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

export function renderListeningClockChart(hourlyData) {
    createOrUpdateChart('listening-clock-chart', {
        type: 'polarArea',
        data: {
            labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
            datasets: [{
                data: hourlyData,
                backgroundColor: hourlyData.map((_, i) => `hsla(141, 76%, ${20 + (i/24)*40}%, 0.7)`)
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { r: { ticks: { backdropColor: 'transparent', color: '#b3b3b3' }, grid: { color: '#282828' } } },
            plugins: { legend: { display: false } }
        }
    });
}

export function renderDayOfWeekChart(weekdayData) {
    createOrUpdateChart('day-of-week-chart', {
        type: 'bar',
        data: {
            labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            datasets: [{ data: weekdayData, backgroundColor: '#1DB954' }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { ticks: { color: '#b3b3b3' }, grid: { color: '#282828' } },
                x: { ticks: { color: '#b3b3b3' }, grid: { display: false } }
            }
        }
    });
}

export function renderMonthlyListeningChart(monthlyData) {
    createOrUpdateChart('monthly-listening-chart', {
        type: 'bar',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            datasets: [{ data: monthlyData, backgroundColor: '#1DB954' }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { ticks: { color: '#b3b3b3' }, grid: { color: '#282828' } },
                x: { ticks: { color: '#b3b3b3' }, grid: { display: false } }
            }
        }
    });
}

export function renderYearlyListeningChart(yearlyData) {
    const labels = yearlyData.map(d => d.year);
    const data = yearlyData.map(d => d.minutes);
    
    createOrUpdateChart('yearly-listening-chart', {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                borderColor: '#1DB954',
                backgroundColor: 'rgba(29, 185, 84, 0.2)',
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { ticks: { color: '#b3b3b3' }, grid: { color: '#282828' } },
                x: { ticks: { color: '#b3b3b3' }, grid: { display: false } }
            }
        }
    });
}