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

    const trendPill = (label, val, lowerIsBetter = false, unit = '%') => {
        if (val === null || val === undefined) return `<span class="wc-pill neutral">${label}: n/a</span>`;
        const cls = val === 0 ? 'neutral' : (lowerIsBetter ? val < 0 : val > 0) ? 'up' : 'down';
        const arrow = val === 0 ? '=' : val > 0 ? '▲' : '▼';
        return `<span class="wc-pill ${cls}">${label}: ${arrow} ${Math.abs(val)}${unit}</span>`;
    };

    const number = value => value.toLocaleString();
    const rankList = (items, type, metric) => {
        const max = Math.max(...items.map(item => item[metric]), 1);
        return `<ol class="wc-ranking wc-${type}-ranking">${items.map((item, index) => `
            <li><button type="button" class="wc-rank-button" data-detail-type="${type}" data-detail-name="${esc(item.name)}" data-detail-extra="${esc(item.artistName || '')}">
                <span class="wc-rank">${String(index + 1).padStart(2, '0')}</span>
                <span class="wc-rank-info"><strong>${esc(item.name)}</strong><small>${type === 'artist' ? `${number(item.plays)} plays` : esc(item.artistName || '')}</small>
                    <span class="wc-rank-track"><span style="width:${Math.round(item[metric] / max * 100)}%"></span></span>
                </span>
                <span class="wc-rank-metric">${number(item[metric])}<small>${metric === 'minutes' ? 'min' : 'plays'}</small></span>
            </button></li>`).join('')}</ol>`;
    };

    const milestones = [];
    if (s.totalPlays >= 10000) milestones.push({ icon: '🎵', label: '10K+ plays this year' });
    else if (s.totalPlays >= 5000) milestones.push({ icon: '🎵', label: '5K+ plays this year' });
    else if (s.totalPlays >= 1000) milestones.push({ icon: '🎵', label: '1K+ plays this year' });
    if (s.totalHours >= 1000) milestones.push({ icon: '⏱', label: '1K+ hours listened' });
    else if (s.totalHours >= 500) milestones.push({ icon: '⏱', label: '500+ hours listened' });
    else if (s.totalHours >= 100) milestones.push({ icon: '⏱', label: '100+ hours listened' });
    if (s.longestStreak >= 7) milestones.push({ icon: '🔥', label: `${s.longestStreak}-day streak` });
    if (s.activeDays >= 350) milestones.push({ icon: '📅', label: 'Nearly every day!' });
    else if (s.activeDays >= 300) milestones.push({ icon: '📅', label: '300+ active days' });
    else if (s.activeDays >= 100) milestones.push({ icon: '📅', label: `${s.activeDays} active days` });
    if (s.newArtists >= 25) milestones.push({ icon: '✨', label: `${number(s.newArtists)} new artists discovered` });
    if (s.newTracks >= 100) milestones.push({ icon: '🧭', label: `${number(s.newTracks)} new songs discovered` });
    if (s.uniques.artists >= 100) milestones.push({ icon: '🎤', label: `${number(s.uniques.artists)} different artists` });
    if (s.uniques.tracks >= 500) milestones.push({ icon: '💿', label: `${number(s.uniques.tracks)} different songs` });
    if (s.topSongMain?.plays >= 50) milestones.push({ icon: '🔁', label: `${number(s.topSongMain.plays)} plays of your #1 song` });
    if (s.topDay?.minutes >= 180) milestones.push({ icon: '⚡', label: `${number(s.topDay.minutes)} min on your biggest day` });
    if (s.monthlyPlays.every(plays => plays > 0)) milestones.push({ icon: '🗓', label: 'Music in all 12 months' });
    if (s.comparePrev.skipRatePoints < 0) milestones.push({ icon: '🎯', label: `Skip rate down ${Math.abs(s.comparePrev.skipRatePoints)} pp` });
    if (s.comparePrev.minutesPct > 0) milestones.push({ icon: '📈', label: `${s.comparePrev.minutesPct}% more listening than ${year - 1}` });
    const milestonesHtml = milestones.length ? `<section class="wrapped-section wrapped-wide-card"><h3>🏆 Milestones</h3><div class="wc-achievements">${milestones.map(m => `<div class="wc-achievement"><span aria-hidden="true">${m.icon}</span><strong>${m.label}</strong></div>`).join('')}</div></section>` : '';
    const skipTrend = s.comparePrev.skipsPct === null && s.comparePrev.available
        ? trendPill('Skips vs prev year', s.comparePrev.skipsDelta, true, ' skips')
        : trendPill('Skips vs prev year', s.comparePrev.skipsPct, true);

    container.innerHTML = `
        <section class="wrapped-summary wrapped-wide-card">
            <div class="wc-summary-heading"><h3>Your ${year} in music</h3><span>${number(s.totalHours)} hours listened</span></div>
            <div class="wc-stat-strip">
                <div><strong>${number(s.totalMinutes)}</strong><span>Minutes</span>${trendPill('Minutes vs prev year', s.comparePrev.minutesPct)}</div>
                <div><strong>${number(s.totalPlays)}</strong><span>Plays</span>${trendPill('Plays vs prev year', s.comparePrev.playsPct)}</div>
                <div><strong>${number(s.uniques.artists)}</strong><span>Artists</span>${trendPill('Artists vs prev year', s.comparePrev.artistsPct)}</div>
                <div><strong>${number(s.skipped)}</strong><span>Skips · ${s.skipRate}% of plays</span>${skipTrend}</div>
            </div>
            <div class="wc-comparison-note">${s.comparePrev.available ? `Compared with ${year - 1}` : `No listening data for ${year - 1}`} ${trendPill('Skip rate change', s.comparePrev.skipRatePoints, true, ' pp')}</div>
        </section>
        <section class="wrapped-section wrapped-wide-card wc-volume-section">
            <div class="wc-section-heading"><div><h3>Monthly listening volume</h3><p>${s.yearArc} · ${s.activeDays} active days</p></div><div class="wc-peak"><span>Peak month</span><strong>${s.peakMonth}</strong><span>${number(s.peakMonthMinutes)} min</span></div></div>
            <div class="wc-monthly-canvas"><canvas id="wrapped-monthly-chart" role="img" aria-label="Monthly listening minutes for ${year}${s.comparePrev.available ? ` and ${year - 1}` : ''}"></canvas></div>
            <div class="wc-volume-footer"><span>${s.quarterPeak} was your strongest quarter</span><span>${s.playsPerActiveDay} plays / active day</span><span>${Math.round(s.minutesPerActiveDay)} min / active day</span></div>
        </section>
        <section class="wrapped-section"><div class="wc-section-heading"><h3>Top songs</h3><span>By plays · ${year}</span></div>${rankList(s.topSong, 'track', 'plays')}</section>
        <section class="wrapped-section"><div class="wc-section-heading"><h3>Top artists</h3><span>By plays · ${year}</span></div>${rankList(s.topArtist, 'artist', 'plays')}</section>
        ${milestonesHtml}
        <section class="wrapped-section"><div class="wc-section-heading"><h3>Top albums</h3><span>By plays · ${year}</span></div>${rankList(s.topAlbum, 'album', 'plays')}</section>
        <section class="wrapped-section wc-year-notes"><h3>Your listening signature</h3>
            <dl><div><dt>Listening persona</dt><dd>${esc(s.persona)} · ${esc(s.mood)}</dd></div>
            <div><dt>Favourite time</dt><dd>${s.topWeekday} · ${s.topHour}</dd></div>
            <div><dt>Longest streak</dt><dd>${s.longestStreak} days</dd></div>
            <div><dt>New discoveries</dt><dd>${number(s.newArtists)} artists · ${number(s.newTracks)} songs</dd></div>
            <div><dt>Top song share</dt><dd>${s.obsessionShare}% of plays</dd></div>
            <div><dt>Top 5 artist share</dt><dd>${s.loyaltyTop5Share}% of minutes</dd></div>
            <div><dt>Best listening day</dt><dd>${s.topDay ? `${s.topDay.date} · ${number(s.topDay.minutes)} min` : '—'}</dd></div></dl>
        </section>
    `;

    container.querySelectorAll('.wc-rank-button[data-detail-type]').forEach(el => {
        el.addEventListener('click', () => openDetail(el.dataset.detailName, el.dataset.detailType, el.dataset.detailExtra || '', window.spotifyData.full));
    });

    charts.renderWrappedMonthlyChart(s.monthlyMinutes, s.comparePrev.available ? s.prevMonthlyMinutes : null, year, s.monthlyPlays);
}
