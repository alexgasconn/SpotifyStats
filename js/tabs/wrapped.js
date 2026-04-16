// js/tabs/wrapped.js — Wrapped tab

import * as store from '../store.js';
import * as charts from '../charts.js';
import { esc } from '../utils.js';
import { openDetail } from '../detail.js';

export function populateWrappedFilter() {
    const years = [...new Set(window.spotifyData.full.map(d => d.year))].sort((a, b) => b - a);
    const sel = document.getElementById('wrapped-year-filter');
    if (sel) sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
}

export function renderWrappedContent() {
    const sel = document.getElementById('wrapped-year-filter');
    if (!sel) return;
    const year = parseInt(sel.value);
    const s = store.calculateWrappedStats(year, window.spotifyData.full);
    const container = document.getElementById('wrapped-content');
    if (!container) return;
    if (!s) { container.innerHTML = '<p style="color:var(--text-muted);padding:1rem">No data for this year.</p>'; return; }

    const trendPill = (label, val) => {
        if (val === null || val === undefined) return `<span class="wc-pill neutral">${label}: n/a</span>`;
        const cls = val >= 0 ? 'up' : 'down';
        const arrow = val >= 0 ? '▲' : '▼';
        return `<span class="wc-pill ${cls}">${label}: ${arrow} ${Math.abs(val)}%</span>`;
    };

    const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const maxQuarter = Math.max(...s.quarterMinutes, 1);
    const maxNewArtist = Math.max(...s.monthlyNewArtists, 1);
    const dayPartLabel = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' };
    const dayPartOrder = ['morning', 'afternoon', 'evening', 'night'];

    container.innerHTML = `
        <div class="wrapped-card wrapped-hero-card">
            <div class="wc-label">Your ${year} Story</div>
            <div class="wc-value">${s.totalMinutes.toLocaleString()}</div>
            <div class="wc-sub">minutes · ${s.totalHours.toLocaleString()} hours · ${s.totalPlays.toLocaleString()} plays</div>
            <div class="wc-pill-row">${trendPill('Minutes vs prev year', s.comparePrev.minutesPct)} ${trendPill('Plays vs prev year', s.comparePrev.playsPct)} ${trendPill('Artists vs prev year', s.comparePrev.artistsPct)}</div>
        </div>
        <div class="wrapped-card"><div class="wc-label">Year Arc</div><div class="wc-highlight">${s.yearArc}</div><div class="wc-sub">Peak quarter: ${s.quarterPeak} · Active days: ${s.activeDays}</div><div class="wc-sub">${s.playsPerActiveDay} plays/day · ${Math.round(s.minutesPerActiveDay)} min/day on active days</div></div>
        <div class="wrapped-card"><div class="wc-label">Obsession & Loyalty</div><div class="wc-sub">Top song concentration: <strong>${s.obsessionShare}%</strong> of all yearly plays</div><div class="wc-sub">Top 5 artists concentration: <strong>${s.loyaltyTop5Share}%</strong> of total minutes</div><div class="wc-sub">Mood profile: <strong>${esc(s.mood)}</strong></div></div>
        <div class="wrapped-card"><div class="wc-label">Your Top Song</div><div class="wc-highlight">${esc(s.topSongMain?.name || '—')}</div><div class="wc-sub">${esc(s.topSongMain?.artistName || '')} · ${s.topSongMain?.plays || 0} plays</div></div>
        <div class="wrapped-card"><div class="wc-label">Your Top Artist</div><div class="wc-highlight">${esc(s.topArtistMain?.name || '—')}</div><div class="wc-sub">${s.topArtistMain?.minutes || 0} min · ${s.topArtistMain?.plays || 0} plays</div></div>
        <div class="wrapped-card"><div class="wc-label">Listening Persona</div><div class="wc-value" style="font-size:2rem">${esc(s.persona)}</div><div class="wc-sub">Fav hour: ${s.topHour} · Fav weekday: ${s.topWeekday} · Weekend share: ${s.weekendShare}%</div></div>
        <div class="wrapped-card"><div class="wc-label">Peak Moment</div><div class="wc-value" style="font-size:2rem">${s.peakMonth}</div><div class="wc-sub">${s.peakMonthMinutes.toLocaleString()} min in your strongest month</div><div class="wc-sub" style="margin-top:0.35rem">Best day: ${s.topDay ? `${s.topDay.date} (${s.topDay.minutes} min)` : '—'}</div></div>
        <div class="wrapped-card"><div class="wc-label">Consistency & Discovery</div><div class="wc-sub">Longest streak this year: <strong>${s.longestStreak} days</strong></div><div class="wc-sub">${s.discoveries.tracks}% of your tracks were first-time discoveries</div><div class="wc-sub">${s.discoveries.artists}% of your artists were new for you</div><div class="wc-sub">Skip rate: ${s.skipRate}%</div></div>
        <div class="wrapped-card wrapped-wide-card"><div class="wc-label">Quarter Momentum</div><div class="wc-mini-bars">${s.quarterMinutes.map((v, i) => `<div class="wc-mini-bar-row"><span>${['Q1', 'Q2', 'Q3', 'Q4'][i]}</span><div class="wc-mini-bar-wrap"><div class="wc-mini-bar" style="width:${Math.round((v / maxQuarter) * 100)}%"></div></div><strong>${v.toLocaleString()} min</strong></div>`).join('')}</div><div class="wc-sub" style="margin-top:0.5rem">First half: ${s.firstHalfMinutes.toLocaleString()} min · Second half: ${s.secondHalfMinutes.toLocaleString()} min</div></div>
        <div class="wrapped-card wrapped-wide-card"><div class="wc-label">Daypart DNA</div><div class="wc-mini-bars">${dayPartOrder.map(k => `<div class="wc-mini-bar-row"><span>${dayPartLabel[k]}</span><div class="wc-mini-bar-wrap"><div class="wc-mini-bar" style="width:${s.daypartPct[k]}%"></div></div><strong>${s.daypartPct[k]}%</strong></div>`).join('')}</div></div>
        <div class="wrapped-card wrapped-wide-card"><div class="wc-label">Discovery Rhythm (New Artists per Month)</div><div class="wc-mini-bars">${s.monthlyNewArtists.map((v, i) => `<div class="wc-mini-bar-row"><span>${monthShort[i]}</span><div class="wc-mini-bar-wrap"><div class="wc-mini-bar" style="width:${Math.round((v / maxNewArtist) * 100)}%"></div></div><strong>${v}</strong></div>`).join('')}</div></div>
        <div class="wrapped-card"><div class="wc-label">Monthly Breakdown</div><div style="position:relative;height:180px;margin-top:0.5rem"><canvas id="wrapped-monthly-chart"></canvas></div></div>
        <div class="wrapped-card"><div class="wc-label">Top 10 Tracks of ${year}</div><ul class="wc-list wc-clickable-list">${s.topSong.map((t, i) => `<li data-detail-type="track" data-detail-name="${t.name.replace(/"/g, '&quot;')}" data-detail-extra="${(t.artistName || '').replace(/"/g, '&quot;')}"><span class="wc-rank">${i + 1}</span><span style="flex:1;font-weight:600">${esc(t.name)}</span><span style="color:var(--green);font-weight:700">${t.plays} plays</span></li>`).join('')}</ul></div>
        <div class="wrapped-card"><div class="wc-label">Top 10 Artists of ${year}</div><ul class="wc-list wc-clickable-list">${s.topArtist.map((a, i) => `<li data-detail-type="artist" data-detail-name="${a.name.replace(/"/g, '&quot;')}"><span class="wc-rank">${i + 1}</span><span style="flex:1;font-weight:600">${esc(a.name)}</span><span style="color:var(--green);font-weight:700">${a.minutes} min</span></li>`).join('')}</ul></div>
        <div class="wrapped-card"><div class="wc-label">Top 10 Albums of ${year}</div><ul class="wc-list wc-clickable-list">${s.topAlbum.map((a, i) => `<li data-detail-type="album" data-detail-name="${a.name.replace(/"/g, '&quot;')}" data-detail-extra="${(a.artistName || '').replace(/"/g, '&quot;')}"><span class="wc-rank">${i + 1}</span><span style="flex:1;font-weight:600">${esc(a.name)}</span><span style="color:var(--green);font-weight:700">${a.plays} plays</span></li>`).join('')}</ul></div>
    `;

    container.querySelectorAll('.wc-clickable-list li[data-detail-type]').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => openDetail(el.dataset.detailName, el.dataset.detailType, el.dataset.detailExtra || '', window.spotifyData.full));
    });

    setTimeout(() => charts.renderWrappedMonthlyChart(s.monthlyMinutes), 50);
}
