// js/calendar.js — Calendar tab: year / month / week view with daily play counts

// ─── State ───────────────────────────────────
let calView = 'month';       // 'year' | 'month' | 'week'
let calCursor = new Date();  // anchor date for navigation

// ─── Helpers ─────────────────────────────────

function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function localDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocal(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function mondayOfWeek(d) {
    const copy = new Date(d);
    const day = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - day);
    return copy;
}

function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function fmtDuration(min) {
    if (min < 1) return '<1 min';
    if (min < 60) return `${Math.round(min)} min`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
}

function fmtMs(ms) {
    const sec = Math.round(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Data helpers ────────────────────────────

function buildDayMap(data) {
    const map = {};
    data.forEach(d => {
        if (!map[d.date]) map[d.date] = { plays: 0, minutes: 0, entries: [] };
        map[d.date].plays++;
        map[d.date].minutes += d.durationMin;
        map[d.date].entries.push(d);
    });
    return map;
}

function computeStats(dayMap, startDate, endDate) {
    let totalPlays = 0, totalMin = 0, activeDays = 0, maxPlays = 0, maxDay = '';
    const cur = new Date(startDate);
    const end = new Date(endDate);
    while (cur <= end) {
        const key = localDate(cur);
        const day = dayMap[key];
        if (day) {
            totalPlays += day.plays;
            totalMin += day.minutes;
            activeDays++;
            if (day.plays > maxPlays) { maxPlays = day.plays; maxDay = key; }
        }
        cur.setDate(cur.getDate() + 1);
    }
    const uniqueTracks = new Set();
    const uniqueArtists = new Set();
    Object.keys(dayMap).forEach(k => {
        const d = parseLocal(k);
        if (d >= startDate && d <= endDate) {
            dayMap[k].entries.forEach(e => {
                if (e.trackName) uniqueTracks.add(e.trackName);
                if (e.artistName) uniqueArtists.add(e.artistName);
            });
        }
    });
    return { totalPlays, totalMin, activeDays, maxPlays, maxDay, uniqueTracks: uniqueTracks.size, uniqueArtists: uniqueArtists.size };
}

function getColorLevel(plays, maxPlays) {
    if (!plays) return '';
    const ratio = plays / maxPlays;
    if (ratio <= 0.2) return 'cal-l1';
    if (ratio <= 0.4) return 'cal-l2';
    if (ratio <= 0.6) return 'cal-l3';
    if (ratio <= 0.8) return 'cal-l4';
    return 'cal-l5';
}

// ─── Main render ─────────────────────────────

export function renderCalendarTab() {
    const data = window.spotifyData.filtered;
    const container = document.getElementById('calendar-content');
    if (!container) return;

    const dayMap = buildDayMap(data);

    // Find global max plays per day for color scaling
    let globalMax = 0;
    Object.values(dayMap).forEach(d => { if (d.plays > globalMax) globalMax = d.plays; });

    const navHtml = buildNavigation(dayMap);
    let bodyHtml = '';
    let statsHtml = '';

    if (calView === 'year') {
        bodyHtml = buildYearView(dayMap, globalMax);
        const y = calCursor.getFullYear();
        const st = computeStats(dayMap, new Date(y, 0, 1), new Date(y, 11, 31));
        statsHtml = buildStatsBar(st, `${y} Summary`);
    } else if (calView === 'month') {
        bodyHtml = buildMonthView(dayMap, globalMax);
        const y = calCursor.getFullYear(), m = calCursor.getMonth();
        const st = computeStats(dayMap, new Date(y, m, 1), new Date(y, m + 1, 0));
        statsHtml = buildStatsBar(st, `${MONTH_NAMES[m]} ${y} Summary`);
    } else {
        bodyHtml = buildWeekView(dayMap);
        const mon = mondayOfWeek(calCursor);
        const sun = addDays(mon, 6);
        const st = computeStats(dayMap, mon, sun);
        statsHtml = buildStatsBar(st, `Week Summary`);
    }

    container.innerHTML = navHtml + statsHtml + bodyHtml;
    attachCalendarEvents(container, dayMap);
}

// ─── Navigation bar ──────────────────────────

function buildNavigation(dayMap) {
    let label = '';
    if (calView === 'year') {
        label = `${calCursor.getFullYear()}`;
    } else if (calView === 'month') {
        label = `${MONTH_NAMES[calCursor.getMonth()]} ${calCursor.getFullYear()}`;
    } else {
        const mon = mondayOfWeek(calCursor);
        const sun = addDays(mon, 6);
        const fmtShort = d => `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
        label = `${fmtShort(mon)} – ${fmtShort(sun)}, ${sun.getFullYear()}`;
    }

    // Today button
    const todayStr = localDate(new Date());

    return `
    <div class="cal-toolbar">
        <div class="cal-nav">
            <button class="cal-nav-btn" data-dir="prev">&#9664;</button>
            <span class="cal-nav-label">${label}</span>
            <button class="cal-nav-btn" data-dir="next">&#9654;</button>
            <button class="cal-nav-btn cal-today-btn" data-dir="today">Today</button>
        </div>
        <div class="cal-view-toggle">
            <button class="cal-view-btn ${calView === 'year' ? 'active' : ''}" data-view="year">Year</button>
            <button class="cal-view-btn ${calView === 'month' ? 'active' : ''}" data-view="month">Month</button>
            <button class="cal-view-btn ${calView === 'week' ? 'active' : ''}" data-view="week">Week</button>
        </div>
    </div>`;
}

// ─── Stats bar ───────────────────────────────

function buildStatsBar(st, title) {
    const fmt = n => Number(n).toLocaleString();
    return `
    <div class="cal-stats">
        <h3 class="cal-stats-title">${title}</h3>
        <div class="cal-stats-grid">
            <div class="cal-stat"><span class="cal-stat-val">${fmt(st.totalPlays)}</span><span class="cal-stat-label">Plays</span></div>
            <div class="cal-stat"><span class="cal-stat-val">${fmtDuration(st.totalMin)}</span><span class="cal-stat-label">Listened</span></div>
            <div class="cal-stat"><span class="cal-stat-val">${fmt(st.activeDays)}</span><span class="cal-stat-label">Active Days</span></div>
            <div class="cal-stat"><span class="cal-stat-val">${fmt(st.uniqueTracks)}</span><span class="cal-stat-label">Tracks</span></div>
            <div class="cal-stat"><span class="cal-stat-val">${fmt(st.uniqueArtists)}</span><span class="cal-stat-label">Artists</span></div>
            <div class="cal-stat"><span class="cal-stat-val">${st.maxPlays || '—'}</span><span class="cal-stat-label">Best Day Plays</span></div>
        </div>
    </div>`;
}

// ─── YEAR VIEW ───────────────────────────────

function buildYearView(dayMap, globalMax) {
    const year = calCursor.getFullYear();
    let html = '<div class="cal-year-grid">';
    for (let m = 0; m < 12; m++) {
        html += buildMiniMonth(year, m, dayMap, globalMax);
    }
    html += '</div>';
    return html;
}

function buildMiniMonth(year, month, dayMap, globalMax) {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startWeekday = (first.getDay() + 6) % 7; // Monday=0

    let cells = '';
    // Blank cells for offset
    for (let i = 0; i < startWeekday; i++) {
        cells += '<div class="cal-mini-cell empty"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const info = dayMap[key];
        const plays = info ? info.plays : 0;
        const lvl = getColorLevel(plays, globalMax);
        const tip = plays ? `${key}: ${plays} plays, ${fmtDuration(info.minutes)}` : key;
        cells += `<div class="cal-mini-cell ${lvl}" data-date="${key}" title="${tip}">${d}</div>`;
    }

    return `
    <div class="cal-mini-month">
        <div class="cal-mini-month-title">${MONTH_NAMES[month].slice(0, 3)}</div>
        <div class="cal-mini-month-header">${DAY_LETTER.map(l => `<div class="cal-mini-hd">${l}</div>`).join('')}</div>
        <div class="cal-mini-month-grid">${cells}</div>
    </div>`;
}

// ─── MONTH VIEW ──────────────────────────────

function buildMonthView(dayMap, globalMax) {
    const year = calCursor.getFullYear(), month = calCursor.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startWeekday = (first.getDay() + 6) % 7;

    let html = '<div class="cal-month">';
    html += '<div class="cal-month-header">' + DAY_ABBR.map(d => `<div class="cal-mh">${d}</div>`).join('') + '</div>';
    html += '<div class="cal-month-grid">';

    // Blank leading cells
    for (let i = 0; i < startWeekday; i++) {
        html += '<div class="cal-day empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const info = dayMap[key];
        const plays = info ? info.plays : 0;
        const mins = info ? info.minutes : 0;
        const lvl = getColorLevel(plays, globalMax);
        const isToday = key === localDate(new Date());

        html += `<div class="cal-day ${lvl} ${isToday ? 'cal-today' : ''} ${plays ? 'has-data' : ''}" data-date="${key}">
            <span class="cal-day-num">${d}</span>
            ${plays ? `<span class="cal-day-plays">${plays} plays</span><span class="cal-day-time">${fmtDuration(mins)}</span>` : ''}
        </div>`;
    }

    html += '</div></div>';
    return html;
}

// ─── WEEK VIEW ───────────────────────────────

function buildWeekView(dayMap) {
    const mon = mondayOfWeek(calCursor);
    let html = '<div class="cal-week">';

    for (let i = 0; i < 7; i++) {
        const d = addDays(mon, i);
        const key = localDate(d);
        const info = dayMap[key];
        const plays = info ? info.plays : 0;
        const mins = info ? info.minutes : 0;
        const isToday = key === localDate(new Date());

        html += `<div class="cal-week-day ${isToday ? 'cal-today' : ''} ${plays ? 'has-data' : ''}" data-date="${key}">
            <div class="cal-week-day-header">
                <span class="cal-week-day-name">${DAY_ABBR[i]}</span>
                <span class="cal-week-day-date">${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}</span>
            </div>
            <div class="cal-week-day-stats">
                <span class="cal-week-plays">${plays ? `${plays} plays` : 'No plays'}</span>
                ${mins ? `<span class="cal-week-time">${fmtDuration(mins)}</span>` : ''}
            </div>
            ${plays ? buildWeekDayPreview(info.entries) : '<div class="cal-week-empty">—</div>'}
        </div>`;
    }

    html += '</div>';
    return html;
}

function buildWeekDayPreview(entries) {
    const top = entries.slice(0, 5);
    let html = '<div class="cal-week-preview">';
    top.forEach(e => {
        const name = e.isPodcast ? (e.episodeName || 'Podcast') : (e.trackName || 'Unknown');
        const artist = e.isPodcast ? (e.episodeShowName || '') : (e.artistName || '');
        html += `<div class="cal-week-item">
            <span class="cal-week-item-name">${esc(name)}</span>
            <span class="cal-week-item-artist">${esc(artist)}</span>
            <span class="cal-week-item-dur">${fmtMs(e.msPlayed)}</span>
        </div>`;
    });
    if (entries.length > 5) {
        html += `<div class="cal-week-more">+${entries.length - 5} more</div>`;
    }
    html += '</div>';
    return html;
}

// ─── Day detail panel ────────────────────────

function buildDayDetail(dayMap, dateKey) {
    const info = dayMap[dateKey];
    if (!info) return '';

    const d = parseLocal(dateKey);
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
    const monthName = MONTH_NAMES[d.getMonth()];

    // Sort entries by time
    const sorted = [...info.entries].sort((a, b) => a.ts - b.ts);

    // Stats for this day
    const uniqueTracks = new Set(sorted.filter(e => e.trackName).map(e => e.trackName)).size;
    const uniqueArtists = new Set(sorted.filter(e => e.artistName).map(e => e.artistName)).size;
    const skipped = sorted.filter(e => e.skipped).length;

    let html = `
    <div class="cal-detail-overlay" id="cal-detail-overlay">
        <div class="cal-detail-panel">
            <div class="cal-detail-header">
                <div>
                    <h3>${dayName}, ${monthName} ${d.getDate()}, ${d.getFullYear()}</h3>
                    <div class="cal-detail-summary">
                        ${info.plays} plays &middot; ${fmtDuration(info.minutes)} &middot; ${uniqueTracks} tracks &middot; ${uniqueArtists} artists &middot; ${skipped} skipped
                    </div>
                </div>
                <button class="cal-detail-close" id="cal-detail-close">&times;</button>
            </div>
            <div class="cal-detail-list">`;

    sorted.forEach((e, i) => {
        const name = e.isPodcast ? (e.episodeName || 'Podcast') : (e.trackName || 'Unknown');
        const artist = e.isPodcast ? (e.episodeShowName || '') : (e.artistName || '');
        const album = e.isPodcast ? '' : (e.albumName || '');
        const timeStr = e.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        html += `
            <div class="cal-detail-row ${e.skipped ? 'cal-skipped' : ''}">
                <span class="cal-detail-idx">${i + 1}</span>
                <span class="cal-detail-time">${timeStr}</span>
                <div class="cal-detail-info">
                    <span class="cal-detail-name">${esc(name)}</span>
                    ${artist ? `<span class="cal-detail-artist">${esc(artist)}${album ? ' — ' + esc(album) : ''}</span>` : ''}
                </div>
                <span class="cal-detail-dur">${fmtMs(e.msPlayed)}</span>
                <div class="cal-detail-reasons">
                    <span class="cal-reason cal-reason-start" title="Start reason">${esc(e.reasonStart)}</span>
                    <span class="cal-reason cal-reason-end" title="End reason">${esc(e.reasonEnd)}</span>
                </div>
            </div>`;
    });

    html += `</div></div></div>`;
    return html;
}

// ─── Event wiring ────────────────────────────

function attachCalendarEvents(container, dayMap) {
    // View toggle
    container.querySelectorAll('.cal-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            calView = btn.dataset.view;
            renderCalendarTab();
        });
    });

    // Navigation prev/next/today
    container.querySelectorAll('.cal-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const dir = btn.dataset.dir;
            if (dir === 'today') {
                calCursor = new Date();
            } else if (dir === 'prev') {
                navigate(-1);
            } else {
                navigate(1);
            }
            renderCalendarTab();
        });
    });

    // Click on a day cell
    container.querySelectorAll('[data-date]').forEach(cell => {
        cell.addEventListener('click', (e) => {
            // Don't trigger on nested buttons
            if (e.target.closest('.cal-nav-btn') || e.target.closest('.cal-view-btn')) return;
            const dateKey = cell.dataset.date;
            if (!dayMap[dateKey]) return;
            showDayDetail(container, dayMap, dateKey);
        });
    });
}

function navigate(dir) {
    if (calView === 'year') {
        calCursor.setFullYear(calCursor.getFullYear() + dir);
    } else if (calView === 'month') {
        calCursor.setMonth(calCursor.getMonth() + dir);
    } else {
        calCursor.setDate(calCursor.getDate() + dir * 7);
    }
}

function showDayDetail(container, dayMap, dateKey) {
    // Remove existing detail if any
    container.querySelector('#cal-detail-overlay')?.remove();

    const html = buildDayDetail(dayMap, dateKey);
    container.insertAdjacentHTML('beforeend', html);

    const overlay = container.querySelector('#cal-detail-overlay');
    const closeBtn = container.querySelector('#cal-detail-close');

    closeBtn?.addEventListener('click', () => overlay?.remove());
    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}
