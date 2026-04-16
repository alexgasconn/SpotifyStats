// js/tabs/streaks.js — Streaks tab

import * as store from '../store.js';
import { esc } from '../utils.js';

let calendarYear = null; // null = all years

export function renderStreaksTab() {
    const data = window.spotifyData.filtered;
    const container = document.getElementById('streaks-content');
    if (!container) return;

    const streaks = store.calculateListeningStreaks(data);
    const artistStreaks = store.calculateArtistDailyStreaks(data);
    const trackStreaks = store.calculateTrackDailyStreaks(data);
    const albumStreaks = store.calculateAlbumDailyStreaks(data);
    const artistGaps = store.calculateArtistGapStreaks(data);
    const trackGaps = store.calculateTrackGapStreaks(data);
    const albumGaps = store.calculateAlbumGapStreaks(data);
    const best = store.calculateBestPeriods(data);
    const calData = store.buildCalendarData(data);

    // Compute milestones
    const milestonesHtml = buildMilestones(streaks, best, data);

    const heroHtml = `
        <div class="streaks-hero">
            <div class="streak-card"><div class="sc-icon">🔥</div><div class="sc-value">${streaks.longest}</div><div class="sc-label">Longest Streak</div><div class="sc-dates">${streaks.longestStart || ''} → ${streaks.longestEnd || ''}</div></div>
            <div class="streak-card"><div class="sc-icon">⚡</div><div class="sc-value">${streaks.current}</div><div class="sc-label">Current Streak</div><div class="sc-dates">${streaks.current > 0 ? 'Keep it up!' : 'Start today!'}</div></div>
            <div class="streak-card"><div class="sc-icon">🗓</div><div class="sc-value">${best.bestDay ? best.bestDay.minutes : 0}</div><div class="sc-label">Best Day (min)</div><div class="sc-dates">${best.bestDay ? best.bestDay.date : '—'}</div></div>
            <div class="streak-card"><div class="sc-icon">📅</div><div class="sc-value">${best.bestWeek ? best.bestWeek.minutes : 0}</div><div class="sc-label">Best Week (min)</div><div class="sc-dates">${best.bestWeek ? best.bestWeek.date : '—'}</div></div>
            <div class="streak-card"><div class="sc-icon">🌟</div><div class="sc-value">${best.bestMonth ? best.bestMonth.minutes : 0}</div><div class="sc-label">Best Month (min)</div><div class="sc-dates">${best.bestMonth ? best.bestMonth.date : '—'}</div></div>
            <div class="streak-card"><div class="sc-icon">🏆</div><div class="sc-value">${best.bestYear ? best.bestYear.minutes : 0}</div><div class="sc-label">Best Year (min)</div><div class="sc-dates">${best.bestYear ? best.bestYear.year : '—'}</div></div>
        </div>`;

    const calHtml = buildCalendarHeatmap(calData, data);

    function streakRows(items, valKey, unit) {
        return items.slice(0, 15).map((a, i) => `
            <div class="streak-row">
                <span class="sr-rank">${i + 1}</span>
                <span class="sr-name">${esc(a.name || a.artist)}</span>
                <span class="sr-val">${a[valKey]} ${unit}</span>
                <span class="sr-dates" style="font-size:0.7rem;color:var(--text-muted)">${a.from} → ${a.to}</span>
            </div>`).join('');
    }

    const streakListHtml = `
        <div class="streak-list-grid">
            <div class="streak-list-card"><h4>🎤 Artist Streaks (consecutive days)</h4>${streakRows(artistStreaks, 'streak', 'days')}</div>
            <div class="streak-list-card"><h4>🎵 Track Streaks (consecutive days)</h4>${streakRows(trackStreaks, 'streak', 'days')}</div>
            <div class="streak-list-card"><h4>💿 Album Streaks (consecutive days)</h4>${streakRows(albumStreaks, 'streak', 'days')}</div>
        </div>`;

    const gapListHtml = `
        <h3 style="margin-top:2rem">Longest absences (top listened items)</h3>
        <p style="color:var(--text-muted);font-size:0.82rem;margin-bottom:1rem">Longest gap of consecutive days without listening to each of your most played artists, tracks and albums.</p>
        <div class="streak-list-grid">
            <div class="streak-list-card"><h4>🎤 Artist – Longest absence</h4>${streakRows(artistGaps, 'gap', 'days')}</div>
            <div class="streak-list-card"><h4>🎵 Track – Longest absence</h4>${streakRows(trackGaps, 'gap', 'days')}</div>
            <div class="streak-list-card"><h4>💿 Album – Longest absence</h4>${streakRows(albumGaps, 'gap', 'days')}</div>
        </div>`;

    container.innerHTML = heroHtml + milestonesHtml + calHtml + streakListHtml + gapListHtml;

    // Wire calendar year nav
    container.querySelectorAll('.cal-year-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            calendarYear = btn.dataset.year === 'all' ? null : parseInt(btn.dataset.year);
            renderStreaksTab();
        });
    });
}

function buildMilestones(streaks, best, data) {
    const music = data.filter(d => !d.isPodcast && d.trackName);
    const totalMin = music.reduce((s, d) => s + d.durationMin, 0);
    const totalPlays = music.length;
    const activeDays = new Set(data.map(d => d.date)).size;

    const badges = [];
    // Streak milestones
    if (streaks.longest >= 365) badges.push({ icon: '👑', label: 'Year-Long Streak', desc: `${streaks.longest} consecutive days` });
    else if (streaks.longest >= 180) badges.push({ icon: '💎', label: 'Half-Year Streak', desc: `${streaks.longest} consecutive days` });
    else if (streaks.longest >= 90) badges.push({ icon: '🏅', label: 'Quarter Streak', desc: `${streaks.longest} consecutive days` });
    else if (streaks.longest >= 30) badges.push({ icon: '🔥', label: 'Monthly Streak', desc: `${streaks.longest} consecutive days` });
    else if (streaks.longest >= 7) badges.push({ icon: '⭐', label: 'Weekly Streak', desc: `${streaks.longest} consecutive days` });

    // Play milestones
    if (totalPlays >= 100000) badges.push({ icon: '🎵', label: '100K Club', desc: `${totalPlays.toLocaleString()} total plays` });
    else if (totalPlays >= 50000) badges.push({ icon: '🎵', label: '50K Plays', desc: `${totalPlays.toLocaleString()} total plays` });
    else if (totalPlays >= 10000) badges.push({ icon: '🎵', label: '10K Plays', desc: `${totalPlays.toLocaleString()} total plays` });

    // Hours milestones
    const totalHours = Math.round(totalMin / 60);
    if (totalHours >= 10000) badges.push({ icon: '⏱', label: 'Time Lord', desc: `${totalHours.toLocaleString()} hours` });
    else if (totalHours >= 5000) badges.push({ icon: '⏱', label: 'Listening Master', desc: `${totalHours.toLocaleString()} hours` });
    else if (totalHours >= 1000) badges.push({ icon: '⏱', label: '1K Hours', desc: `${totalHours.toLocaleString()} hours` });

    // Active days milestones
    if (activeDays >= 1000) badges.push({ icon: '📅', label: '1000 Active Days', desc: `${activeDays} days with music` });
    else if (activeDays >= 365) badges.push({ icon: '📅', label: 'Year of Music', desc: `${activeDays} active days` });

    // Best day intensity
    if (best.bestDay && best.bestDay.minutes >= 480) badges.push({ icon: '🏆', label: 'Marathon Day', desc: `${best.bestDay.minutes} min in a single day` });

    if (!badges.length) return '';

    return `
        <div class="streaks-milestones">
            <h3>🏆 Milestones & Achievements</h3>
            <div class="milestones-grid">
                ${badges.map(b => `<div class="milestone-badge"><span class="mb-icon">${b.icon}</span><span class="mb-label">${b.label}</span><span class="mb-desc">${b.desc}</span></div>`).join('')}
            </div>
        </div>`;
}

function buildCalendarHeatmap(calData, data) {
    // Get available years for navigation
    const years = [...new Set(data.map(d => new Date(d.endTime).getFullYear()))].sort();

    // Filter calData by selected year
    let filteredCalData = calData;
    if (calendarYear !== null) {
        filteredCalData = {};
        Object.entries(calData).forEach(([date, val]) => {
            if (date.startsWith(String(calendarYear))) filteredCalData[date] = val;
        });
    }

    const allDates = Object.keys(filteredCalData).sort();
    if (!allDates.length) return '<p style="color:var(--text-muted)">No data</p>';

    const firstDate = new Date(allDates[0]);
    const lastDate = new Date(allDates[allDates.length - 1]);
    const startMonday = new Date(firstDate);
    startMonday.setDate(firstDate.getDate() - ((firstDate.getDay() + 6) % 7));

    const values = Object.values(filteredCalData).filter(v => v > 0);
    const maxVal = Math.max(...values, 1);
    const p33 = maxVal * 0.2, p66 = maxVal * 0.4, p80 = maxVal * 0.65, p95 = maxVal * 0.85;

    // Stats for this view
    const totalDays = values.length;
    const avgMin = totalDays ? Math.round(values.reduce((s, v) => s + v, 0) / totalDays) : 0;

    const weeks = [];
    let current = new Date(startMonday);
    const end = new Date(lastDate);
    end.setDate(end.getDate() + (6 - (end.getDay() + 6) % 7));

    let currentMo = -1;
    const monthLabels = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    while (current <= end) {
        const weekDays = [];
        for (let d = 0; d < 7; d++) {
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, '0');
            const day = String(current.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${day}`;
            const mins = filteredCalData[dateStr] || 0;
            let level = 0;
            if (mins > 0) {
                if (mins > p95) level = 5;
                else if (mins > p80) level = 4;
                else if (mins > p66) level = 3;
                else if (mins > p33) level = 2;
                else level = 1;
            }
            const tooltip = mins > 0 ? `${dateStr}: ${Math.round(mins)} min` : dateStr;
            weekDays.push(`<div class="heatmap-cell ${level > 0 ? 'l' + level : ''}" title="${tooltip}"></div>`);
            current.setDate(current.getDate() + 1);
        }
        const weekMo = new Date(current.getTime() - 86400000 * 7).getMonth();
        if (weekMo !== currentMo) { currentMo = weekMo; monthLabels.push(monthNames[weekMo]); }
        else monthLabels.push('');
        weeks.push(`<div class="heatmap-col">${weekDays.join('')}</div>`);
    }

    const monthRow = monthLabels.map(m => `<span style="min-width:15px;display:inline-block">${m}</span>`).join('');
    const yearBtns = [`<button class="cal-year-btn ${calendarYear === null ? 'active' : ''}" data-year="all">All</button>`]
        .concat(years.map(y => `<button class="cal-year-btn ${calendarYear === y ? 'active' : ''}" data-year="${y}">${y}</button>`))
        .join('');

    return `<div class="heatmap-section"><h3>Listening Calendar</h3>
        <div class="cal-year-nav">${yearBtns}<span class="cal-year-stats">${totalDays} active days · ${avgMin} avg min/day</span></div>
        <div class="calendar-heatmap">
            <div class="heatmap-months">${monthRow}</div>
            <div class="heatmap-grid">${weeks.join('')}</div>
            <div class="heatmap-legend">Less <div class="heatmap-cell"></div><div class="heatmap-cell l1"></div><div class="heatmap-cell l2"></div><div class="heatmap-cell l3"></div><div class="heatmap-cell l4"></div><div class="heatmap-cell l5"></div> More</div>
        </div></div>`;
}
