// js/tabs/deepdive.js — Deep Insights tab with listening chains

import * as store from '../store.js';
import { esc } from '../utils.js';
import { openDetail } from '../detail.js';

export function renderDeepDiveTab() {
    const data = window.spotifyData.filtered;
    const container = document.getElementById('deepdive-content');
    if (!container) return;

    const ins = store.calculateDeepInsights(data);
    const chains = store.calculateListeningChains(data);

    const timeLabels = { morning: '🌅 Morning Person', afternoon: '☀️ Afternoon Listener', evening: '🌆 Evening Listener', night: '🌙 Night Owl' };
    const timeDesc = { morning: 'Most of your listening happens in the morning (6–12).', afternoon: 'Most of your listening happens in the afternoon (12–18).', evening: 'Most of your listening happens in the evening (18–midnight).', night: 'You listen mostly late at night (midnight–6).' };
    const totalTime = Object.values(ins.timeMap).reduce((a, b) => a + b, 0) || 1;

    // Build listening habits summary
    const habitsHtml = buildListeningHabits(data);

    // Build chain HTML sections
    const trackChainsHtml = buildChainSection('🔗 Track Chains', 'After listening to a track, which track do you play next most often?', chains.trackChains, 'track');
    const artistChainsHtml = buildChainSection('🎤 Artist Flow', 'After an artist, which artist comes next in your sessions?', chains.artistChains, 'artist');
    const albumChainsHtml = buildChainSection('💿 Album Transitions', 'After finishing an album, which album do you jump to?', chains.albumChains, 'album');

    // Build session patterns
    const sessionHtml = buildSessionPatterns(chains.sessions);

    container.innerHTML = `<div class="deepdive-grid">

        <!-- Personality -->
        <div class="insight-card">
            <h4><span class="ic-icon">🧠</span> Your Listening Personality</h4>
            <div class="personality-tag">${timeLabels[ins.dominantTime] || 'Music Lover'}</div>
            <p class="insight-desc">${timeDesc[ins.dominantTime] || ''}</p>
            <div style="margin-top:1rem">
                ${Object.entries(ins.timeMap).map(([t, min]) => `
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;font-size:0.82rem">
                        <span style="min-width:90px;color:var(--text-muted)">${t}</span>
                        <div style="flex:1;background:var(--gray);border-radius:3px;height:6px;overflow:hidden">
                            <div style="width:${Math.round((min / totalTime) * 100)}%;height:100%;background:var(--green);border-radius:3px"></div>
                        </div>
                        <span style="min-width:40px;text-align:right;font-weight:700">${Math.round(min / 60)}h</span>
                    </div>`).join('')}
            </div>
        </div>

        <!-- Loyal artists -->
        <div class="insight-card">
            <h4><span class="ic-icon">💚</span> Most Loyal Artists</h4>
            <p class="insight-desc">Artists you've listened to across the most different years.</p>
            <ul class="insight-list">
                ${ins.loyalArtists.slice(0, 10).map((a, i) => `
                    <li data-detail-type="artist" data-detail-name="${a.artist.replace(/"/g, '&quot;')}">
                        <span class="il-rank">${i + 1}</span><span class="il-name">${esc(a.artist)}</span><span class="il-val">${a.years} years</span>
                    </li>`).join('')}
            </ul>
        </div>

        <!-- Hidden gems -->
        <div class="insight-card">
            <h4><span class="ic-icon">💎</span> Hidden Gems</h4>
            <p class="insight-desc">Tracks you play often in short bursts — your real favourites.</p>
            <ul class="insight-list">
                ${ins.hiddenGems.slice(0, 10).map((t, i) => `
                    <li data-detail-type="track" data-detail-name="${t.name.replace(/"/g, '&quot;')}" data-detail-extra="${(t.artist || '').replace(/"/g, '&quot;')}">
                        <span class="il-rank">${i + 1}</span><span class="il-name">${esc(t.name)}</span><span class="il-val">${t.plays} plays</span>
                    </li>`).join('')}
            </ul>
        </div>

        <!-- Most skipped -->
        <div class="insight-card">
            <h4><span class="ic-icon">⏭</span> Most Skipped Tracks</h4>
            <p class="insight-desc">You keep playing these but rarely finish them.</p>
            <ul class="insight-list">
                ${ins.abandonedTracks.slice(0, 10).map((t, i) => `
                    <li data-detail-type="track" data-detail-name="${t.name.replace(/"/g, '&quot;')}" data-detail-extra="${(t.artist || '').replace(/"/g, '&quot;')}">
                        <span class="il-rank">${i + 1}</span><span class="il-name">${esc(t.name)}</span><span class="il-val">${t.skipRate}% skipped</span>
                    </li>`).join('')}
            </ul>
        </div>

        <!-- Replay kings -->
        <div class="insight-card">
            <h4><span class="ic-icon">🔁</span> Replay Kings</h4>
            <p class="insight-desc">Songs you played 3+ times in a single day.</p>
            <ul class="insight-list">
                ${ins.replayKings.slice(0, 10).map((r, i) => `
                    <li data-detail-type="track" data-detail-name="${r.track.replace(/"/g, '&quot;')}" data-detail-extra="${(r.artist || '').replace(/"/g, '&quot;')}">
                        <span class="il-rank">${i + 1}</span><span class="il-name">${esc(r.track)}</span><span class="il-val">${r.count}x on ${r.date}</span>
                    </li>`).join('')}
            </ul>
        </div>

        <!-- One-hit wonders -->
        <div class="insight-card">
            <h4><span class="ic-icon">🎯</span> One-Track Artists</h4>
            <p class="insight-desc">Artists where you've only heard one track.</p>
            <ul class="insight-list">
                ${ins.oneHitWonders.slice(0, 10).map((o, i) => `
                    <li><span class="il-rank">${i + 1}</span><span class="il-name">${esc(o.artist)}</span><span class="il-val" style="font-size:0.75rem;color:var(--text-muted)">${esc(o.track)}</span></li>
                `).join('')}
            </ul>
        </div>

        <!-- Biggest listening days -->
        <div class="insight-card">
            <h4><span class="ic-icon">🎉</span> Biggest Listening Days</h4>
            <p class="insight-desc">The days with the most track plays ever.</p>
            <ul class="insight-list">
                ${ins.topPlayDays.map((d, i) => `
                    <li><span class="il-rank">${i + 1}</span><span class="il-name">${d.date}</span><span class="il-val">${d.plays} plays</span></li>
                `).join('')}
            </ul>
        </div>

        <!-- Artist diversity -->
        <div class="insight-card" style="grid-column:1/-1">
            <h4><span class="ic-icon">📊</span> Artist Diversity Over Time</h4>
            <p class="insight-desc">How many unique artists you listened to each year.</p>
            <div style="margin-top:1rem">
                ${(() => {
            const max = Math.max(...ins.diversityByYear.map(d => d.uniqueArtists), 1);
            return ins.diversityByYear.map(d => `
                        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.6rem;font-size:0.85rem">
                            <span style="min-width:45px;font-weight:700;color:var(--text-muted)">${d.year}</span>
                            <div style="flex:1;background:var(--gray);border-radius:3px;height:8px;overflow:hidden">
                                <div style="width:${Math.round((d.uniqueArtists / max) * 100)}%;height:100%;background:#17A2B8;border-radius:3px"></div>
                            </div>
                            <span style="min-width:80px;font-weight:700">${d.uniqueArtists} artists</span>
                        </div>`).join('');
        })()}
            </div>
        </div>

        <!-- ═══════ LISTENING HABITS SUMMARY ═══════ -->
        ${habitsHtml}

        <!-- ═══════ LISTENING CHAINS SECTION ═══════ -->
        <div class="insight-card chain-section" style="grid-column:1/-1">
            <h4><span class="ic-icon">🔗</span> Listening Chains & Session Flow</h4>
            <p class="insight-desc">Discover your listening patterns — what you tend to play after each track, artist, or album.</p>
        </div>

        ${trackChainsHtml}
        ${artistChainsHtml}
        ${albumChainsHtml}
        ${sessionHtml}

    </div>`;

    // Wire up click-to-detail
    container.querySelectorAll('[data-detail-type]').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
            openDetail(el.dataset.detailName, el.dataset.detailType, el.dataset.detailExtra || '', window.spotifyData.full);
        });
    });
}

function buildListeningHabits(data) {
    const music = data.filter(d => !d.isPodcast && d.trackName);
    if (!music.length) return '';

    // Compute shuffle vs on-demand ratio
    const shuffled = music.filter(d => d.shuffle === true).length;
    const shufflePct = ((shuffled / music.length) * 100).toFixed(0);

    // Offline vs online
    const offline = music.filter(d => d.offline === true).length;
    const offlinePct = ((offline / music.length) * 100).toFixed(0);

    // Average track duration
    const avgDur = (music.reduce((s, d) => s + d.durationMin, 0) / music.length).toFixed(1);

    // Complete listen rate (non-skipped)
    const completed = music.filter(d => !d.skipped).length;
    const completionRate = ((completed / music.length) * 100).toFixed(0);

    // Unique tracks per month average
    const monthMap = {};
    music.forEach(d => {
        const key = d.date?.slice(0, 7) || 'unknown';
        if (!monthMap[key]) monthMap[key] = new Set();
        monthMap[key].add(d.trackName);
    });
    const months = Object.values(monthMap);
    const avgUniqPerMonth = months.length ? Math.round(months.reduce((s, set) => s + set.size, 0) / months.length) : 0;

    return `
        <div class="insight-card" style="grid-column:1/-1">
            <h4><span class="ic-icon">📋</span> Listening Habits Summary</h4>
            <p class="insight-desc">A quick snapshot of how you listen to music.</p>
            <div class="habits-grid">
                <div class="habit-item"><span class="hi-val">${shufflePct}%</span><span class="hi-label">Shuffle plays</span></div>
                <div class="habit-item"><span class="hi-val">${offlinePct}%</span><span class="hi-label">Offline plays</span></div>
                <div class="habit-item"><span class="hi-val">${avgDur}</span><span class="hi-label">Avg min/play</span></div>
                <div class="habit-item"><span class="hi-val">${completionRate}%</span><span class="hi-label">Completion rate</span></div>
                <div class="habit-item"><span class="hi-val">${avgUniqPerMonth}</span><span class="hi-label">Unique tracks/month</span></div>
            </div>
        </div>`;
}

function buildChainSection(title, description, chains, type) {
    if (!chains || !chains.length) return '';

    return `
        <div class="insight-card chain-card" style="grid-column:1/-1">
            <h4><span class="ic-icon">${title.split(' ')[0]}</span> ${title.split(' ').slice(1).join(' ')}</h4>
            <p class="insight-desc">${description}</p>
            <div class="chain-list">
                ${chains.slice(0, 15).map((c, i) => {
        const fromAttr = (c.from || '').replace(/"/g, '&quot;');
        const toAttr = (c.to || '').replace(/"/g, '&quot;');
        const fromExtra = (c.fromArtist || '').replace(/"/g, '&quot;');
        const toExtra = (c.toArtist || '').replace(/"/g, '&quot;');

        return `<div class="chain-item">
                        <span class="chain-rank">${i + 1}</span>
                        <div class="chain-flow">
                            <span class="chain-from" data-detail-type="${type}" data-detail-name="${fromAttr}" data-detail-extra="${fromExtra}">${esc(c.from)}</span>
                            <span class="chain-arrow">→</span>
                            <span class="chain-to" data-detail-type="${type}" data-detail-name="${toAttr}" data-detail-extra="${toExtra}">${esc(c.to)}</span>
                        </div>
                        <div class="chain-stats">
                            <span class="chain-count">${c.count}x</span>
                            <span class="chain-pct">${c.pct}%</span>
                        </div>
                    </div>`;
    }).join('')}
            </div>
        </div>`;
}

function buildSessionPatterns(sessions) {
    if (!sessions || !sessions.length) return '';

    const totalSessions = sessions.length;
    const avgLength = sessions.reduce((s, se) => s + se.trackCount, 0) / totalSessions;
    const avgDuration = sessions.reduce((s, se) => s + se.durationMin, 0) / totalSessions;
    const longestSession = sessions.reduce((best, se) => se.trackCount > best.trackCount ? se : best, sessions[0]);
    const longestDuration = sessions.reduce((best, se) => se.durationMin > best.durationMin ? se : best, sessions[0]);

    // Session duration distribution buckets
    const buckets = { '< 5 min': 0, '5–15 min': 0, '15–30 min': 0, '30–60 min': 0, '1–2 hours': 0, '2+ hours': 0 };
    sessions.forEach(se => {
        const m = se.durationMin;
        if (m < 5) buckets['< 5 min']++;
        else if (m < 15) buckets['5–15 min']++;
        else if (m < 30) buckets['15–30 min']++;
        else if (m < 60) buckets['30–60 min']++;
        else if (m < 120) buckets['1–2 hours']++;
        else buckets['2+ hours']++;
    });
    const maxBucket = Math.max(...Object.values(buckets), 1);

    // Session time-of-day distribution
    const timeSlots = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    sessions.forEach(se => {
        if (!se.tracks.length) return;
        const h = new Date(se.tracks[0].endTime).getHours();
        if (h >= 6 && h < 12) timeSlots.morning++;
        else if (h >= 12 && h < 18) timeSlots.afternoon++;
        else if (h >= 18) timeSlots.evening++;
        else timeSlots.night++;
    });
    const maxSlot = Math.max(...Object.values(timeSlots), 1);
    const slotLabels = { morning: '🌅 Morning', afternoon: '☀️ Afternoon', evening: '🌆 Evening', night: '🌙 Night' };

    // Most common session starters
    const starterCounts = {};
    sessions.forEach(se => {
        if (se.tracks.length) {
            const t = se.tracks[0];
            const key = `${t.trackName}|||${t.artistName}`;
            starterCounts[key] = (starterCounts[key] || 0) + 1;
        }
    });
    const topStarters = Object.entries(starterCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([key, count]) => {
            const [track, artist] = key.split('|||');
            return { track, artist, count };
        });

    // Most common session closers
    const closerCounts = {};
    sessions.forEach(se => {
        if (se.tracks.length) {
            const t = se.tracks[se.tracks.length - 1];
            const key = `${t.trackName}|||${t.artistName}`;
            closerCounts[key] = (closerCounts[key] || 0) + 1;
        }
    });
    const topClosers = Object.entries(closerCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([key, count]) => {
            const [track, artist] = key.split('|||');
            return { track, artist, count };
        });

    return `
        <div class="insight-card" style="grid-column:1/-1">
            <h4><span class="ic-icon">📱</span> Session Patterns</h4>
            <p class="insight-desc">Analysis of your listening sessions (groups of consecutive plays with &lt;30 min gaps).</p>
            <div class="session-stats-grid">
                <div class="session-stat"><div class="ss-val">${totalSessions.toLocaleString()}</div><div class="ss-label">Total Sessions</div></div>
                <div class="session-stat"><div class="ss-val">${avgLength.toFixed(1)}</div><div class="ss-label">Avg Tracks/Session</div></div>
                <div class="session-stat"><div class="ss-val">${Math.round(avgDuration)}</div><div class="ss-label">Avg Min/Session</div></div>
                <div class="session-stat"><div class="ss-val">${longestSession.trackCount}</div><div class="ss-label">Longest Session (tracks)</div></div>
                <div class="session-stat"><div class="ss-val">${Math.round(longestDuration.durationMin)}</div><div class="ss-label">Longest Session (min)</div></div>
            </div>
        </div>

        <div class="insight-card">
            <h4><span class="ic-icon">📊</span> Session Duration Distribution</h4>
            <p class="insight-desc">How long your listening sessions typically last.</p>
            <div style="margin-top:0.8rem">
                ${Object.entries(buckets).map(([label, count]) => `
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;font-size:0.82rem">
                        <span style="min-width:80px;color:var(--text-muted)">${label}</span>
                        <div style="flex:1;background:var(--gray);border-radius:3px;height:8px;overflow:hidden">
                            <div style="width:${Math.round((count / maxBucket) * 100)}%;height:100%;background:var(--green);border-radius:3px"></div>
                        </div>
                        <span style="min-width:40px;text-align:right;font-weight:700">${count}</span>
                    </div>`).join('')}
            </div>
        </div>

        <div class="insight-card">
            <h4><span class="ic-icon">🕐</span> Session Start Times</h4>
            <p class="insight-desc">When you tend to start your listening sessions.</p>
            <div style="margin-top:0.8rem">
                ${Object.entries(timeSlots).map(([key, count]) => `
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;font-size:0.82rem">
                        <span style="min-width:110px">${slotLabels[key]}</span>
                        <div style="flex:1;background:var(--gray);border-radius:3px;height:8px;overflow:hidden">
                            <div style="width:${Math.round((count / maxSlot) * 100)}%;height:100%;background:#17A2B8;border-radius:3px"></div>
                        </div>
                        <span style="min-width:40px;text-align:right;font-weight:700">${count}</span>
                        <span style="font-size:0.75rem;color:var(--text-muted)">(${((count / totalSessions) * 100).toFixed(0)}%)</span>
                    </div>`).join('')}
            </div>
        </div>

        <div class="insight-card">
            <h4><span class="ic-icon">▶️</span> Session Starters</h4>
            <p class="insight-desc">Tracks you most often start your listening sessions with.</p>
            <ul class="insight-list">
                ${topStarters.map((s, i) => `
                    <li data-detail-type="track" data-detail-name="${(s.track || '').replace(/"/g, '&quot;')}" data-detail-extra="${(s.artist || '').replace(/"/g, '&quot;')}">
                        <span class="il-rank">${i + 1}</span>
                        <span class="il-name">${esc(s.track)}</span>
                        <span class="il-val">${s.count}x</span>
                    </li>`).join('')}
            </ul>
        </div>

        <div class="insight-card">
            <h4><span class="ic-icon">⏹️</span> Session Closers</h4>
            <p class="insight-desc">The last tracks you listen to before stopping.</p>
            <ul class="insight-list">
                ${topClosers.map((s, i) => `
                    <li data-detail-type="track" data-detail-name="${(s.track || '').replace(/"/g, '&quot;')}" data-detail-extra="${(s.artist || '').replace(/"/g, '&quot;')}">
                        <span class="il-rank">${i + 1}</span>
                        <span class="il-name">${esc(s.track)}</span>
                        <span class="il-val">${s.count}x</span>
                    </li>`).join('')}
            </ul>
        </div>`;
}

