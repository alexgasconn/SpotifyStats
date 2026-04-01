// js/store.js — Central data processing & statistics

// ─────────────────────────────────────────────
//  ZIP PROCESSING
// ─────────────────────────────────────────────

// Config is set per-load and used by processEntry via closure
let _cfg = {
    minPlayMs: 30000,
    skipMode: 'both',
    skipThresholdMs: 30000,
    includePodcasts: true,
    includeOffline: true,
    includeIncognito: true,
    topN: 10,
    streakGapDays: 1,
};

export function getConfig() { return { ..._cfg }; }

export async function processSpotifyZip(zipFile, config = {}, onProgress = null) {
    _cfg = { ..._cfg, ...config };

    const report = (pct, msg) => {
        if (typeof onProgress === 'function') onProgress(pct, msg);
    };

    report(5, 'Opening ZIP archive...');
    const jszip = new JSZip();
    const zip = await jszip.loadAsync(zipFile);

    report(12, 'Scanning files inside ZIP...');
    const historyFiles = [];
    zip.forEach((relativePath, zipEntry) => {
        if (
            (relativePath.includes('Streaming_History_Audio_') ||
                relativePath.includes('Streaming_History_Video_') ||
                relativePath.includes('endsong_'))
            && relativePath.endsWith('.json')
        ) {
            historyFiles.push(zipEntry);
        }
    });
    if (historyFiles.length === 0) {
        throw new Error('No Spotify streaming history JSON files found in the ZIP.');
    }

    report(16, `Found ${historyFiles.length} history files. Reading JSON...`);

    const allEntries = [];
    for (let i = 0; i < historyFiles.length; i++) {
        const file = historyFiles[i];
        const filePct = 16 + Math.round(((i + 1) / historyFiles.length) * 54);
        report(filePct, `Parsing file ${i + 1}/${historyFiles.length}: ${file.name}`);

        let parsed;
        try {
            const text = await file.async('string');
            parsed = JSON.parse(text);
        } catch (err) {
            throw new Error(`Failed to parse ${file.name}: ${err.message}`);
        }
        allEntries.push(parsed);
    }

    report(74, 'Transforming entries and applying filters...');
    const processedData = allEntries.flat().map(processEntry).filter(Boolean);

    report(86, 'Sorting timeline and finalizing data...');
    const sorted = processedData.sort((a, b) => a.ts - b.ts);

    report(90, 'Data processing complete. Preparing dashboard...');
    return sorted;
}

function processEntry(entry) {
    const msPlayed = entry.ms_played ?? 0;
    if (msPlayed < _cfg.minPlayMs) return null;
    const ts = new Date(entry.ts);
    if (isNaN(ts)) return null;

    const isPodcast = !!(entry.episode_name && entry.episode_show_name);
    if (isPodcast && !_cfg.includePodcasts) return null;

    const isOffline = !!(entry.offline);
    if (isOffline && !_cfg.includeOffline) return null;

    const isIncognito = !!(entry.incognito_mode);
    if (isIncognito && !_cfg.includeIncognito) return null;

    const month = ts.getMonth(); // 0-11
    const season = month >= 2 && month <= 4 ? 'spring'
        : month >= 5 && month <= 7 ? 'summer'
            : month >= 8 && month <= 10 ? 'autumn'
                : 'winter';

    const hour = ts.getHours();
    const timeOfDay = hour >= 6 && hour < 12 ? 'morning'
        : hour >= 12 && hour < 18 ? 'afternoon'
            : hour >= 18 ? 'evening'
                : 'night';

    return {
        ts,
        date: ts.toISOString().split('T')[0],
        trackName: entry.master_metadata_track_name || null,
        artistName: entry.master_metadata_album_artist_name || null,
        albumName: entry.master_metadata_album_album_name || null,
        episodeName: entry.episode_name || null,
        episodeShowName: entry.episode_show_name || null,
        isPodcast,
        msPlayed,
        durationMin: msPlayed / 60000,
        year: ts.getFullYear(),
        month,
        hour,
        weekday: (ts.getDay() + 6) % 7, // Monday=0
        reasonEnd: entry.reason_end || 'unknown',
        reasonStart: entry.reason_start || 'unknown',
        platform: entry.platform || 'unknown',
        country: entry.conn_country || 'unknown',
        season,
        timeOfDay,
        skipped: (() => {
            const byReason = !!(entry.reason_end && entry.reason_end !== 'trackdone' && entry.reason_end !== 'endplay');
            const byTime = msPlayed < _cfg.skipThresholdMs;
            if (_cfg.skipMode === 'reason') return byReason;
            if (_cfg.skipMode === 'time') return byTime;
            return byReason || byTime; // 'both'
        })()
    };
}

// ─────────────────────────────────────────────
//  GLOBAL KPIs
// ─────────────────────────────────────────────

export function calculateGlobalKPIs(data) {
    if (!data.length) return {};
    const music = data.filter(d => !d.isPodcast && d.trackName);

    const totalMinutes = data.reduce((s, d) => s + d.durationMin, 0);
    const musicMinutes = music.reduce((s, d) => s + d.durationMin, 0);

    const uniqueTracks = new Set(music.map(d => d.trackName)).size;
    const uniqueArtists = new Set(music.map(d => d.artistName).filter(Boolean)).size;
    const uniqueAlbums = new Set(music.map(d => `${d.albumName}__${d.artistName}`).filter(a => !a.startsWith('null'))).size;

    // Daily minutes map
    const dailyMin = {};
    data.forEach(d => { dailyMin[d.date] = (dailyMin[d.date] || 0) + d.durationMin; });
    const dailyValues = Object.values(dailyMin);
    const activeDays = dailyValues.length;
    const avgPerDay = totalMinutes / (activeDays || 1);
    const maxDayMinutes = Math.max(...dailyValues);
    const maxDay = Object.keys(dailyMin).find(k => dailyMin[k] === maxDayMinutes);

    const totalPlays = data.length;
    const skipped = data.filter(d => d.skipped).length;
    const skipRate = ((skipped / totalPlays) * 100).toFixed(1);

    const years = [...new Set(data.map(d => d.year))].sort();

    return {
        totalMinutes: Math.round(totalMinutes),
        totalHours: Math.round(totalMinutes / 60),
        totalDays: Math.round(totalMinutes / 1440),
        musicMinutes: Math.round(musicMinutes),
        uniqueTracks,
        uniqueArtists,
        uniqueAlbums,
        activeDays,
        avgPerDay: Math.round(avgPerDay),
        maxDayMinutes: Math.round(maxDayMinutes),
        maxDay,
        totalPlays,
        skipped,
        skipRate,
        years,
        firstDate: data[0].date,
        lastDate: data[data.length - 1].date
    };
}

// ─────────────────────────────────────────────
//  TOP ITEMS
// ─────────────────────────────────────────────

export function calculateTopItems(data, key, metric = 'plays', topN = 10) {
    const music = data.filter(d => !d.isPodcast && d.trackName);
    const grouped = {};

    music.forEach(d => {
        let itemKey, displayName, artistName, albumName;

        if (key === 'albumName') {
            const album = d.albumName ? String(d.albumName).trim() : '';
            const artist = d.artistName ? String(d.artistName).trim() : '';
            if (!album || !artist || album.toLowerCase() === 'null') return;
            itemKey = `${album}|||${artist}`;
            displayName = album;
            artistName = artist;
            albumName = album;
        } else if (key === 'trackName') {
            const track = d.trackName ? String(d.trackName).trim() : '';
            if (!track || track.toLowerCase() === 'null') return;
            itemKey = `${track}|||${d.artistName || ''}`;
            displayName = track;
            artistName = d.artistName || '';
            albumName = d.albumName || '';
        } else {
            const val = d[key] ? String(d[key]).trim() : '';
            if (!val || val.toLowerCase() === 'null') return;
            itemKey = val;
            displayName = val;
            artistName = d.artistName || '';
        }

        if (!grouped[itemKey]) {
            grouped[itemKey] = {
                name: displayName,
                artistName,
                albumName: albumName || '',
                plays: 0,
                minutes: 0,
                skipped: 0
            };
        }
        grouped[itemKey].plays++;
        grouped[itemKey].minutes += d.durationMin;
        if (d.skipped) grouped[itemKey].skipped++;
    });

    return Object.values(grouped)
        .map(v => ({
            ...v,
            minutes: Math.round(v.minutes),
            skipRate: v.plays > 0 ? ((v.skipped / v.plays) * 100).toFixed(1) : '0.0'
        }))
        .sort((a, b) => b[metric] - a[metric])
        .slice(0, topN);
}

// ─────────────────────────────────────────────
//  TEMPORAL DISTRIBUTIONS
// ─────────────────────────────────────────────

function getStartOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff)).toISOString().split('T')[0];
}

export function calculateAggregatedTimeline(data, unit = 'week') {
    if (!data || !data.length) return [];
    const map = {};
    data.forEach(d => {
        let key;
        switch (unit) {
            case 'year': key = `${d.year}-01-01`; break;
            case 'month': key = d.ts.toISOString().substring(0, 7) + '-01'; break;
            case 'week': key = getStartOfWeek(d.ts); break;
            default: key = d.date;
        }
        map[key] = (map[key] || 0) + d.durationMin;
    });
    return Object.entries(map)
        .map(([date, minutes]) => ({ x: date, y: Math.round(minutes) }))
        .sort((a, b) => new Date(a.x) - new Date(b.x));
}

export function calculateTemporalDistribution(data, groupBy) {
    const groups = {
        hour: Array(24).fill(0),
        weekday: Array(7).fill(0),
        month: Array(12).fill(0),
        year: {}
    };
    data.forEach(d => {
        groups.hour[d.hour] += d.durationMin;
        groups.weekday[d.weekday] += d.durationMin;
        groups.month[d.month] += d.durationMin;
        groups.year[d.year] = (groups.year[d.year] || 0) + d.durationMin;
    });
    if (groupBy === 'year') {
        return Object.entries(groups.year)
            .sort((a, b) => a[0] - b[0])
            .map(([year, minutes]) => ({ year, minutes: Math.round(minutes) }));
    }
    return groups[groupBy].map(v => Math.round(v));
}

export function calculateSeasonDistribution(data) {
    const seasons = { spring: 0, summer: 0, autumn: 0, winter: 0 };
    data.forEach(d => { if (d.season) seasons[d.season] += d.durationMin; });
    return [
        { label: 'Spring', value: Math.round(seasons.spring) },
        { label: 'Summer', value: Math.round(seasons.summer) },
        { label: 'Autumn', value: Math.round(seasons.autumn) },
        { label: 'Winter', value: Math.round(seasons.winter) }
    ];
}

export function calculateDistributionPercent(data, key) {
    const total = data.length;
    if (!total) return [];
    const counts = {};
    data.forEach(d => {
        const v = d[key] || 'Unknown';
        counts[v] = (counts[v] || 0) + 1;
    });
    return Object.entries(counts)
        .map(([value, count]) => ({ value, percent: +((count / total) * 100).toFixed(2), count }))
        .sort((a, b) => b.percent - a.percent);
}

export function calculateWeekdayHourMatrix(data) {
    // Returns array of {x: hour, y: weekday, count}
    const matrix = {};
    data.forEach(d => {
        const key = `${d.weekday}_${d.hour}`;
        matrix[key] = (matrix[key] || 0) + 1;
    });
    return Object.entries(matrix).map(([key, count]) => {
        const [weekday, hour] = key.split('_').map(Number);
        return { x: hour, y: weekday, r: Math.min(Math.sqrt(count) * 1.5, 18), count };
    });
}

// ─────────────────────────────────────────────
//  STREAKS
// ─────────────────────────────────────────────

export function calculateListeningStreaks(data) {
    const dateSet = new Set(data.map(d => d.date));
    const dates = [...dateSet].sort();
    if (!dates.length) return { longest: 0, current: 0, longestStart: null, longestEnd: null };

    let longest = 1, current = 1;
    let longestStart = dates[0], longestEnd = dates[0];
    let streakStart = dates[0];

    for (let i = 1; i < dates.length; i++) {
        const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000;
        if (diff === 1) {
            current++;
            if (current > longest) {
                longest = current;
                longestStart = streakStart;
                longestEnd = dates[i];
            }
        } else {
            streakStart = dates[i];
            current = 1;
        }
    }

    // Current streak
    const lastDate = new Date(dates[dates.length - 1]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const gapDays = Math.floor((today - lastDate) / 86400000);
    const currentStreak = gapDays <= 1 ? current : 0;

    return { longest, longestStart, longestEnd, current: currentStreak };
}

export function calculateArtistDailyStreaks(data, topN = 15) {
    // Build map: date -> Set of artists
    const byDate = {};
    data.forEach(d => {
        if (!d.artistName) return;
        if (!byDate[d.date]) byDate[d.date] = new Set();
        byDate[d.date].add(d.artistName);
    });
    const dates = Object.keys(byDate).sort();

    // Get unique artists with at least some plays
    const artistPlays = {};
    data.forEach(d => { if (d.artistName) artistPlays[d.artistName] = (artistPlays[d.artistName] || 0) + 1; });
    const topArtists = Object.entries(artistPlays).sort((a, b) => b[1] - a[1]).slice(0, 200).map(a => a[0]);

    const result = [];
    topArtists.forEach(artist => {
        let longest = 0, cur = 0, tempStart = null, bestStart = null, bestEnd = null;
        for (let i = 0; i < dates.length; i++) {
            if (byDate[dates[i]].has(artist)) {
                if (cur === 0) tempStart = dates[i];
                const diff = i > 0 ? (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000 : 1;
                if (diff > 1 && cur > 0) { cur = 1; tempStart = dates[i]; }
                else cur++;
                if (cur > longest) { longest = cur; bestStart = tempStart; bestEnd = dates[i]; }
            } else {
                cur = 0;
            }
        }
        if (longest > 1) result.push({ artist, streak: longest, from: bestStart, to: bestEnd });
    });

    return result.sort((a, b) => b.streak - a.streak).slice(0, topN);
}

export function calculateBestPeriods(data) {
    if (!data.length) return {};

    // Best day
    const dayMap = {};
    data.forEach(d => { dayMap[d.date] = (dayMap[d.date] || 0) + d.durationMin; });
    const bestDayEntry = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0] || [null, 0];

    // Best week
    const weekMap = {};
    data.forEach(d => { const w = getStartOfWeek(d.ts); weekMap[w] = (weekMap[w] || 0) + d.durationMin; });
    const bestWeekEntry = Object.entries(weekMap).sort((a, b) => b[1] - a[1])[0] || [null, 0];

    // Best month
    const monthMap = {};
    data.forEach(d => {
        const k = `${d.year}-${String(d.month + 1).padStart(2, '0')}`;
        monthMap[k] = (monthMap[k] || 0) + d.durationMin;
    });
    const bestMonthEntry = Object.entries(monthMap).sort((a, b) => b[1] - a[1])[0] || [null, 0];

    // Best year
    const yearMap = {};
    data.forEach(d => { yearMap[d.year] = (yearMap[d.year] || 0) + d.durationMin; });
    const bestYearEntry = Object.entries(yearMap).sort((a, b) => b[1] - a[1])[0] || [null, 0];

    return {
        bestDay: { date: bestDayEntry[0], minutes: Math.round(bestDayEntry[1]) },
        bestWeek: { date: bestWeekEntry[0], minutes: Math.round(bestWeekEntry[1]) },
        bestMonth: { date: bestMonthEntry[0], minutes: Math.round(bestMonthEntry[1]) },
        bestYear: { year: bestYearEntry[0], minutes: Math.round(bestYearEntry[1]) }
    };
}

export function buildCalendarData(data) {
    // Returns map date -> minutes (for heatmap)
    const map = {};
    data.forEach(d => { map[d.date] = (map[d.date] || 0) + d.durationMin; });
    return map;
}

// ─────────────────────────────────────────────
//  DEEP DIVE INSIGHTS
// ─────────────────────────────────────────────

export function calculateDeepInsights(data) {
    const music = data.filter(d => !d.isPodcast && d.trackName);

    // 1. Personality: morning vs night
    const timeMap = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    music.forEach(d => { if (d.timeOfDay) timeMap[d.timeOfDay] += d.durationMin; });
    const dominantTime = Object.entries(timeMap).sort((a, b) => b[1] - a[1])[0];

    // 2. Most loyal artist (listened in most different years)
    const artistYears = {};
    music.forEach(d => {
        if (!d.artistName) return;
        if (!artistYears[d.artistName]) artistYears[d.artistName] = new Set();
        artistYears[d.artistName].add(d.year);
    });
    const loyalArtists = Object.entries(artistYears)
        .map(([a, ys]) => ({ artist: a, years: ys.size, yearList: [...ys].sort() }))
        .sort((a, b) => b.years - a.years)
        .slice(0, 10);

    // 3. Hidden gems: at least 20 plays but each play < 3 min avg
    const trackStats = {};
    music.forEach(d => {
        if (!d.trackName) return;
        const k = `${d.trackName}|||${d.artistName}`;
        if (!trackStats[k]) trackStats[k] = { name: d.trackName, artist: d.artistName, plays: 0, minutes: 0 };
        trackStats[k].plays++;
        trackStats[k].minutes += d.durationMin;
    });

    const hiddenGems = Object.values(trackStats)
        .filter(t => t.plays >= 20 && (t.minutes / t.plays) < 2.5)
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 10)
        .map(t => ({ ...t, minutes: Math.round(t.minutes) }));

    // 4. Most abandoned (high skip rate) — min 10 plays
    const abandonedTracks = Object.entries(trackStats)
        .filter(([, t]) => t.plays >= 10)
        .map(([, t]) => {
            const skips = music.filter(d => d.trackName === t.name && d.artistName === t.artist && d.skipped).length;
            return { name: t.name, artist: t.artist, plays: t.plays, skipRate: +((skips / t.plays) * 100).toFixed(1) };
        })
        .sort((a, b) => b.skipRate - a.skipRate)
        .slice(0, 10);

    // 5. One-hit wonders (artists heard only 1 unique track)
    const artistTracks = {};
    music.forEach(d => {
        if (!d.artistName) return;
        if (!artistTracks[d.artistName]) artistTracks[d.artistName] = new Set();
        artistTracks[d.artistName].add(d.trackName);
    });
    const oneHitWonders = Object.entries(artistTracks)
        .filter(([, ts]) => ts.size === 1)
        .map(([artist, ts]) => ({ artist, track: [...ts][0] }))
        .slice(0, 10);

    // 6. Replay kings: days where same song played 3+ times
    const dayTrackMap = {};
    music.forEach(d => {
        const k = `${d.date}|||${d.trackName}|||${d.artistName}`;
        dayTrackMap[k] = (dayTrackMap[k] || 0) + 1;
    });
    const replayKings = Object.entries(dayTrackMap)
        .filter(([, c]) => c >= 3)
        .map(([k, c]) => {
            const [date, track, artist] = k.split('|||');
            return { date, track, artist, count: c };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    // 7. Discovery rate: new artists per month
    const monthsSorted = [...new Set(music.map(d => `${d.year}-${String(d.month + 1).padStart(2, '0')}`))].sort();
    const seenArtists = new Set();
    const discoveryByMonth = monthsSorted.map(m => {
        const [y, mo] = m.split('-').map(Number);
        const monthArtists = new Set(
            music.filter(d => d.year === y && d.month === mo - 1).map(d => d.artistName).filter(Boolean)
        );
        let newCount = 0;
        monthArtists.forEach(a => { if (!seenArtists.has(a)) { seenArtists.add(a); newCount++; } });
        return { month: m, newArtists: newCount };
    });

    // 8. Most productive listening day(s) ever
    const dayPlays = {};
    music.forEach(d => { dayPlays[d.date] = (dayPlays[d.date] || 0) + 1; });
    const topPlayDays = Object.entries(dayPlays)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([date, plays]) => ({ date, plays }));

    // 9. Artist diversity over time
    const yearDiversity = {};
    music.forEach(d => {
        if (!yearDiversity[d.year]) yearDiversity[d.year] = new Set();
        if (d.artistName) yearDiversity[d.year].add(d.artistName);
    });
    const diversityByYear = Object.entries(yearDiversity)
        .sort((a, b) => a[0] - b[0])
        .map(([year, artists]) => ({ year: Number(year), uniqueArtists: artists.size }));

    return {
        dominantTime: dominantTime ? dominantTime[0] : 'evening',
        timeMap,
        loyalArtists,
        hiddenGems,
        abandonedTracks,
        oneHitWonders,
        replayKings,
        discoveryByMonth,
        topPlayDays,
        diversityByYear
    };
}

// ─────────────────────────────────────────────
//  F1 CHAMPIONSHIP
// ─────────────────────────────────────────────

const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export function calculateF1Championship(data, mode = 'artists', selectedYear = null, topN = 15) {
    const music = data.filter(d => !d.isPodcast && d.trackName);
    if (!music.length) return null;

    const getKey = (d) => {
        if (mode === 'artists') {
            return d.artistName ? String(d.artistName).trim() : '';
        }
        if (mode === 'tracks') {
            const t = d.trackName ? String(d.trackName).trim() : '';
            const a = d.artistName ? String(d.artistName).trim() : '';
            return t ? `${t}|||${a}` : '';
        }
        const al = d.albumName ? String(d.albumName).trim() : '';
        const a = d.artistName ? String(d.artistName).trim() : '';
        return al ? `${al}|||${a}` : '';
    };

    const getLabel = (key) => {
        if (mode === 'artists') return { name: key, subtitle: '' };
        const [name, artist] = key.split('|||');
        return { name, subtitle: artist || '' };
    };

    const weekMap = {};
    music.forEach(d => {
        const wk = getStartOfWeek(d.ts);
        const key = getKey(d);
        if (!key) return;
        if (!weekMap[wk]) weekMap[wk] = {};
        if (!weekMap[wk][key]) weekMap[wk][key] = 0;
        weekMap[wk][key] += d.durationMin;
    });

    const years = [...new Set(music.map(d => d.year))].sort((a, b) => a - b);
    const activeYear = selectedYear && years.includes(selectedYear) ? selectedYear : years[years.length - 1];

    const yearStandingMap = {};
    const weeklyByYear = {};

    Object.entries(weekMap).sort((a, b) => a[0].localeCompare(b[0])).forEach(([weekStart, values]) => {
        const year = new Date(weekStart).getFullYear();
        if (!yearStandingMap[year]) yearStandingMap[year] = {};
        if (!weeklyByYear[year]) weeklyByYear[year] = [];

        const ranking = Object.entries(values)
            .map(([key, minutes]) => ({ key, minutes }))
            .sort((a, b) => b.minutes - a.minutes);

        // Fastest lap: whoever has the most minutes in a single week
        const fastestLapKey = ranking.length > 0 ? ranking[0].key : null;
        const fastestLapMinutes = ranking.length > 0 ? ranking[0].minutes : 0;

        const topWeek = ranking.slice(0, 10).map((r, idx) => {
            const pts = F1_POINTS[idx] || 0;
            let bonusPoints = 0;

            // Fastest lap bonus: +1 point
            if (r.key === fastestLapKey && idx === 0) {
                bonusPoints = 1;
            }

            const totalPoints = pts + bonusPoints;

            if (!yearStandingMap[year][r.key]) {
                yearStandingMap[year][r.key] = { points: 0, weeksWon: 0, podiums: 0, minutes: 0, fastestLaps: 0 };
            }
            yearStandingMap[year][r.key].points += totalPoints;
            yearStandingMap[year][r.key].minutes += r.minutes;
            if (idx === 0) {
                yearStandingMap[year][r.key].weeksWon += 1;
                if (bonusPoints > 0) yearStandingMap[year][r.key].fastestLaps += 1;
            }
            if (idx < 3) yearStandingMap[year][r.key].podiums += 1;

            return {
                rank: idx + 1,
                key: r.key,
                points: totalPoints,
                basePoints: pts,
                bonusPoints: bonusPoints,
                minutes: Math.round(r.minutes),
                fastestLap: r.key === fastestLapKey,
                ...getLabel(r.key)
            };
        });

        weeklyByYear[year].push({ weekStart, topWeek, fastestLapKey, fastestLapMinutes });
    });

    const yearStreaks = {};
    Object.entries(weeklyByYear).forEach(([y, weeks]) => {
        const yearKeys = Object.keys(yearStandingMap[y] || {});
        const streakMap = {};
        yearKeys.forEach(key => {
            streakMap[key] = {
                currentWin: 0,
                bestWin: 0,
                currentPodium: 0,
                bestPodium: 0
            };
        });

        weeks.forEach(week => {
            const winnerKey = week.topWeek[0]?.key || null;
            const podiumKeys = new Set(week.topWeek.slice(0, 3).map(r => r.key));

            yearKeys.forEach(key => {
                const s = streakMap[key];
                if (key === winnerKey) {
                    s.currentWin += 1;
                } else {
                    s.currentWin = 0;
                }
                s.bestWin = Math.max(s.bestWin, s.currentWin);

                if (podiumKeys.has(key)) {
                    s.currentPodium += 1;
                } else {
                    s.currentPodium = 0;
                }
                s.bestPodium = Math.max(s.bestPodium, s.currentPodium);
            });
        });

        yearStreaks[y] = streakMap;
    });

    const standingsByYear = {};
    Object.entries(yearStandingMap).forEach(([y, map]) => {
        standingsByYear[y] = Object.entries(map)
            .map(([key, val]) => ({
                key,
                ...getLabel(key),
                points: val.points,
                weeksWon: val.weeksWon,
                podiums: val.podiums,
                fastestLaps: val.fastestLaps || 0,
                bestWinStreak: yearStreaks[y]?.[key]?.bestWin || 0,
                bestPodiumStreak: yearStreaks[y]?.[key]?.bestPodium || 0,
                minutes: Math.round(val.minutes)
            }))
            .sort((a, b) => b.points - a.points);
    });

    const selectedStandings = (standingsByYear[activeYear] || []).slice(0, topN);
    const selectedWeekly = weeklyByYear[activeYear] || [];

    // Evolution month-by-month (cumulative points) for top contenders of selected year
    const contenders = selectedStandings.slice(0, 8).map(s => s.key);
    const monthPoints = {};
    contenders.forEach(c => { monthPoints[c] = Array(12).fill(0); });

    selectedWeekly.forEach(w => {
        const month = new Date(w.weekStart).getMonth();
        w.topWeek.forEach(row => {
            if (monthPoints[row.key]) monthPoints[row.key][month] += row.points;
        });
    });

    const evolutionSeries = contenders.map(key => {
        let cum = 0;
        const data = monthPoints[key].map(v => { cum += v; return cum; });
        const label = getLabel(key);
        return { key, name: label.name, subtitle: label.subtitle, data };
    });

    const winners = Object.entries(standingsByYear)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([y, standings]) => ({
            year: Number(y),
            winner: standings[0] || null
        }))
        .filter(w => w.winner);

    const yearlyTop3 = Object.entries(standingsByYear)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([y, standings]) => ({
            year: Number(y),
            top3: standings.slice(0, 3)
        }))
        .filter(row => row.top3.length > 0);

    // Calculate all-time records: count gold/silver/bronze for each contender
    const allTimeRecords = {};
    Object.entries(standingsByYear).forEach(([y, standings]) => {
        standings.forEach((record, idx) => {
            const key = record.key;
            if (!allTimeRecords[key]) {
                allTimeRecords[key] = {
                    key,
                    ...getLabel(key),
                    golds: 0,      // 1st place finishes
                    silvers: 0,    // 2nd place finishes
                    bronzes: 0,    // 3rd place finishes
                    totalWins: 0,
                    totalPodiums: 0,
                    totalFastestLaps: 0,
                    bestWinStreak: 0,
                    bestPodiumStreak: 0,
                    totalPoints: 0,
                    yearsActive: new Set()
                };
            }
            allTimeRecords[key].yearsActive.add(Number(y));
            allTimeRecords[key].totalWins += record.weeksWon;
            allTimeRecords[key].totalPodiums += record.podiums;
            allTimeRecords[key].totalFastestLaps += record.fastestLaps;
            allTimeRecords[key].bestWinStreak = Math.max(allTimeRecords[key].bestWinStreak, record.bestWinStreak || 0);
            allTimeRecords[key].bestPodiumStreak = Math.max(allTimeRecords[key].bestPodiumStreak, record.bestPodiumStreak || 0);
            allTimeRecords[key].totalPoints += record.points;

            if (idx === 0) allTimeRecords[key].golds++;
            else if (idx === 1) allTimeRecords[key].silvers++;
            else if (idx === 2) allTimeRecords[key].bronzes++;
        });
    });

    const allTimeList = Object.values(allTimeRecords)
        .filter(r => r.golds > 0 || r.silvers > 0 || r.bronzes > 0)
        .sort((a, b) => b.totalPoints - a.totalPoints);

    return {
        mode,
        years,
        selectedYear: activeYear,
        standings: selectedStandings,
        weekly: selectedWeekly,
        evolution: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            series: evolutionSeries
        },
        winners,
        yearlyTop3,
        allTimeList
    };
}

// ─────────────────────────────────────────────
//  DETAIL PAGE STATS
// ─────────────────────────────────────────────

export function calculateTrackDetail(trackName, artistName, fullData) {
    const d = fullData.filter(e => e.trackName === trackName && e.artistName === artistName);
    if (!d.length) return null;

    const totalPlays = d.length;
    const totalMinutes = d.reduce((s, e) => s + e.durationMin, 0);
    const skipped = d.filter(e => e.skipped).length;
    const skipRate = ((skipped / totalPlays) * 100).toFixed(1);

    const sorted = [...d].sort((a, b) => a.ts - b.ts);
    const firstPlay = sorted[0].ts;
    const lastPlay = sorted[sorted.length - 1].ts;

    // Year breakdown
    const byYear = {};
    d.forEach(e => { byYear[e.year] = (byYear[e.year] || 0) + 1; });
    const yearBreakdown = Object.entries(byYear).sort((a, b) => a[0] - b[0]).map(([year, plays]) => ({ year: Number(year), plays }));

    // Hour distribution
    const byHour = Array(24).fill(0);
    d.forEach(e => { byHour[e.hour]++; });

    // Day of week
    const byWeekday = Array(7).fill(0);
    d.forEach(e => { byWeekday[e.weekday]++; });

    // Monthly timeline (aggregated)
    const byMonth = {};
    d.forEach(e => { const k = `${e.year}-${String(e.month + 1).padStart(2, '0')}`; byMonth[k] = (byMonth[k] || 0) + 1; });
    const monthlyTimeline = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([m, plays]) => ({ month: m, plays }));

    // Streak
    const dateSet = new Set(d.map(e => e.date));
    const dates = [...dateSet].sort();
    let maxStreak = 1, cur = 1;
    for (let i = 1; i < dates.length; i++) {
        const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000;
        if (diff === 1) { cur++; maxStreak = Math.max(maxStreak, cur); } else cur = 1;
    }

    // Recent plays
    const recent = sorted.slice(-20).reverse().map(e => ({
        date: e.ts.toLocaleString(),
        minutes: Math.round(e.durationMin * 10) / 10,
        skipped: e.skipped
    }));

    return {
        type: 'track',
        name: trackName,
        subtitle: artistName,
        totalPlays,
        totalMinutes: Math.round(totalMinutes),
        skipRate,
        firstPlay: firstPlay.toLocaleDateString(),
        lastPlay: lastPlay.toLocaleDateString(),
        avgMinPerPlay: Math.round((totalMinutes / totalPlays) * 10) / 10,
        maxStreakDays: maxStreak,
        yearBreakdown,
        byHour,
        byWeekday,
        monthlyTimeline,
        recent
    };
}

export function calculateArtistDetail(artistName, fullData) {
    const d = fullData.filter(e => e.artistName === artistName && !e.isPodcast);
    if (!d.length) return null;

    const totalPlays = d.length;
    const totalMinutes = d.reduce((s, e) => s + e.durationMin, 0);
    const skipped = d.filter(e => e.skipped).length;
    const skipRate = ((skipped / totalPlays) * 100).toFixed(1);

    const uniqueTracks = new Set(d.map(e => e.trackName).filter(Boolean)).size;
    const uniqueAlbums = new Set(d.map(e => e.albumName).filter(Boolean)).size;

    const sorted = [...d].sort((a, b) => a.ts - b.ts);
    const firstPlay = sorted[0].ts;
    const lastPlay = sorted[sorted.length - 1].ts;

    // Top tracks for this artist
    const trackMap = {};
    d.forEach(e => {
        if (!e.trackName) return;
        if (!trackMap[e.trackName]) trackMap[e.trackName] = { plays: 0, minutes: 0 };
        trackMap[e.trackName].plays++;
        trackMap[e.trackName].minutes += e.durationMin;
    });
    const topTracks = Object.entries(trackMap)
        .map(([name, v]) => ({ name, plays: v.plays, minutes: Math.round(v.minutes) }))
        .sort((a, b) => b.plays - a.plays).slice(0, 15);

    // Top albums
    const albumMap = {};
    d.forEach(e => {
        if (!e.albumName) return;
        if (!albumMap[e.albumName]) albumMap[e.albumName] = { plays: 0, minutes: 0 };
        albumMap[e.albumName].plays++;
        albumMap[e.albumName].minutes += e.durationMin;
    });
    const topAlbums = Object.entries(albumMap)
        .map(([name, v]) => ({ name, plays: v.plays, minutes: Math.round(v.minutes) }))
        .sort((a, b) => b.plays - a.plays).slice(0, 10);

    // Year breakdown
    const byYear = {};
    d.forEach(e => { byYear[e.year] = (byYear[e.year] || 0) + e.durationMin; });
    const yearBreakdown = Object.entries(byYear)
        .sort((a, b) => a[0] - b[0])
        .map(([year, minutes]) => ({ year: Number(year), minutes: Math.round(minutes) }));

    // Hour distribution
    const byHour = Array(24).fill(0);
    d.forEach(e => { byHour[e.hour]++; });

    // Weekday distribution
    const byWeekday = Array(7).fill(0);
    d.forEach(e => { byWeekday[e.weekday]++; });

    // Monthly timeline
    const byMonth = {};
    d.forEach(e => { const k = `${e.year}-${String(e.month + 1).padStart(2, '0')}`; byMonth[k] = (byMonth[k] || 0) + e.durationMin; });
    const monthlyTimeline = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([m, mins]) => ({ month: m, minutes: Math.round(mins) }));

    // Streak
    const dateSet = new Set(d.map(e => e.date));
    const dates = [...dateSet].sort();
    let maxStreak = 1, cur = 1;
    for (let i = 1; i < dates.length; i++) {
        const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000;
        if (diff === 1) { cur++; maxStreak = Math.max(maxStreak, cur); } else cur = 1;
    }

    return {
        type: 'artist',
        name: artistName,
        subtitle: `${uniqueTracks} tracks · ${uniqueAlbums} albums`,
        totalPlays,
        totalMinutes: Math.round(totalMinutes),
        skipRate,
        firstPlay: firstPlay.toLocaleDateString(),
        lastPlay: lastPlay.toLocaleDateString(),
        uniqueTracks,
        uniqueAlbums,
        maxStreakDays: maxStreak,
        yearBreakdown,
        byHour,
        byWeekday,
        monthlyTimeline,
        topTracks,
        topAlbums
    };
}

export function calculateAlbumDetail(albumName, artistName, fullData) {
    const d = fullData.filter(e => e.albumName === albumName && e.artistName === artistName && !e.isPodcast);
    if (!d.length) return null;

    const totalPlays = d.length;
    const totalMinutes = d.reduce((s, e) => s + e.durationMin, 0);
    const skipped = d.filter(e => e.skipped).length;
    const skipRate = ((skipped / totalPlays) * 100).toFixed(1);
    const uniqueTracks = new Set(d.map(e => e.trackName).filter(Boolean)).size;

    const sorted = [...d].sort((a, b) => a.ts - b.ts);
    const firstPlay = sorted[0].ts;
    const lastPlay = sorted[sorted.length - 1].ts;

    // Per-track breakdown
    const trackMap = {};
    d.forEach(e => {
        if (!e.trackName) return;
        if (!trackMap[e.trackName]) trackMap[e.trackName] = { plays: 0, minutes: 0, skipped: 0 };
        trackMap[e.trackName].plays++;
        trackMap[e.trackName].minutes += e.durationMin;
        if (e.skipped) trackMap[e.trackName].skipped++;
    });
    const trackList = Object.entries(trackMap)
        .map(([name, v]) => ({
            name,
            plays: v.plays,
            minutes: Math.round(v.minutes),
            skipRate: +((v.skipped / v.plays) * 100).toFixed(1)
        }))
        .sort((a, b) => b.plays - a.plays);

    // Year breakdown
    const byYear = {};
    d.forEach(e => { byYear[e.year] = (byYear[e.year] || 0) + e.durationMin; });
    const yearBreakdown = Object.entries(byYear)
        .sort((a, b) => a[0] - b[0])
        .map(([year, minutes]) => ({ year: Number(year), minutes: Math.round(minutes) }));

    // Hour distribution
    const byHour = Array(24).fill(0);
    d.forEach(e => { byHour[e.hour]++; });

    // Weekday
    const byWeekday = Array(7).fill(0);
    d.forEach(e => { byWeekday[e.weekday]++; });

    return {
        type: 'album',
        name: albumName,
        subtitle: artistName,
        totalPlays,
        totalMinutes: Math.round(totalMinutes),
        skipRate,
        firstPlay: firstPlay.toLocaleDateString(),
        lastPlay: lastPlay.toLocaleDateString(),
        uniqueTracks,
        yearBreakdown,
        byHour,
        byWeekday,
        trackList
    };
}

// ─────────────────────────────────────────────
//  WRAPPED
// ─────────────────────────────────────────────

export function calculateWrappedStats(year, fullData) {
    const yearData = fullData.filter(d => d.year === year && !d.isPodcast && d.trackName);
    if (!yearData.length) return null;

    const prevData = fullData.filter(d => d.year < year && !d.isPodcast);
    const prevTracks = new Set(prevData.map(d => d.trackName).filter(Boolean));
    const prevArtists = new Set(prevData.map(d => d.artistName).filter(Boolean));

    const uniqueTracks = new Set(yearData.map(d => d.trackName));
    const uniqueArtists = new Set(yearData.map(d => d.artistName));
    const uniqueAlbums = new Set(yearData.map(d => `${d.albumName}--${d.artistName}`));

    const isFirst = prevArtists.size === 0;
    const newTracks = isFirst ? uniqueTracks.size : [...uniqueTracks].filter(t => !prevTracks.has(t)).length;
    const newArtists = isFirst ? uniqueArtists.size : [...uniqueArtists].filter(a => !prevArtists.has(a)).length;

    const monthlyMinutes = Array(12).fill(0);
    const skipped = yearData.filter(d => d.skipped).length;
    yearData.forEach(d => { monthlyMinutes[d.month] += d.durationMin; });

    // Peak month
    const peakMonth = monthlyMinutes.indexOf(Math.max(...monthlyMinutes));
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Top hour
    const hourCounts = Array(24).fill(0);
    yearData.forEach(d => { hourCounts[d.hour]++; });
    const topHour = hourCounts.indexOf(Math.max(...hourCounts));

    // Top weekday
    const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekdayCounts = Array(7).fill(0);
    yearData.forEach(d => { weekdayCounts[d.weekday]++; });
    const topWeekdayIndex = weekdayCounts.indexOf(Math.max(...weekdayCounts));

    // Top day (minutes and plays)
    const dayMap = {};
    yearData.forEach(d => {
        if (!dayMap[d.date]) dayMap[d.date] = { minutes: 0, plays: 0 };
        dayMap[d.date].minutes += d.durationMin;
        dayMap[d.date].plays += 1;
    });
    const topDayEntry = Object.entries(dayMap).sort((a, b) => b[1].minutes - a[1].minutes)[0] || null;

    // Longest daily streak inside selected year
    const uniqueDates = [...new Set(yearData.map(d => d.date))].sort();
    let longestStreak = uniqueDates.length ? 1 : 0;
    let current = uniqueDates.length ? 1 : 0;
    for (let i = 1; i < uniqueDates.length; i++) {
        const diff = (new Date(uniqueDates[i]) - new Date(uniqueDates[i - 1])) / 86400000;
        if (diff === 1) {
            current += 1;
            if (current > longestStreak) longestStreak = current;
        } else {
            current = 1;
        }
    }

    // Compare with previous year
    const prevYearData = fullData.filter(d => d.year === (year - 1) && !d.isPodcast && d.trackName);
    const prevMinutes = prevYearData.reduce((s, d) => s + d.durationMin, 0);
    const prevPlays = prevYearData.length;
    const prevArtistsCount = new Set(prevYearData.map(d => d.artistName).filter(Boolean)).size;
    const currentMinutes = yearData.reduce((s, d) => s + d.durationMin, 0);
    const currentPlays = yearData.length;
    const currentArtists = uniqueArtists.size;

    const deltaPct = (curr, prev) => {
        if (!prev) return null;
        return +((((curr - prev) / prev) * 100).toFixed(1));
    };

    // Time persona / aura
    const buckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    yearData.forEach(d => { buckets[d.timeOfDay] = (buckets[d.timeOfDay] || 0) + d.durationMin; });
    const dominantTime = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]?.[0] || 'evening';
    const personaMap = {
        morning: 'Early Energy',
        afternoon: 'Daytime Flow',
        evening: 'Sunset Mood',
        night: 'Night Drive'
    };

    // Weekend share
    let weekendMinutes = 0;
    yearData.forEach(d => {
        if (d.weekday >= 5) weekendMinutes += d.durationMin;
    });
    const weekendShare = currentMinutes > 0 ? +((weekendMinutes / currentMinutes) * 100).toFixed(1) : 0;

    const topSong = calculateTopItems(yearData, 'trackName', 'plays', 10);
    const topArtist = calculateTopItems(yearData, 'artistName', 'plays', 10);
    const topAlbum = calculateTopItems(yearData, 'albumName', 'plays', 10);

    // Quarters and year arc
    const quarterMinutes = [0, 0, 0, 0];
    const firstHalfMonths = new Set([0, 1, 2, 3, 4, 5]);
    let firstHalfMinutes = 0;
    let secondHalfMinutes = 0;
    yearData.forEach(d => {
        const q = Math.floor(d.month / 3);
        quarterMinutes[q] += d.durationMin;
        if (firstHalfMonths.has(d.month)) firstHalfMinutes += d.durationMin;
        else secondHalfMinutes += d.durationMin;
    });

    // Monthly play density
    const monthlyPlays = Array(12).fill(0);
    yearData.forEach(d => { monthlyPlays[d.month] += 1; });

    // Active-day metrics
    const activeDays = uniqueDates.length;
    const playsPerActiveDay = activeDays > 0 ? +(currentPlays / activeDays).toFixed(1) : 0;
    const minutesPerActiveDay = activeDays > 0 ? +(currentMinutes / activeDays).toFixed(1) : 0;

    // Obsession and loyalty
    const topSongMain = topSong[0] || null;
    const topArtistMain = topArtist[0] || null;
    const topAlbumMain = topAlbum[0] || null;
    const obsessionShare = topSongMain ? +((topSongMain.plays / currentPlays) * 100).toFixed(1) : 0;
    const top5ArtistMinutes = topArtist.slice(0, 5).reduce((sum, a) => sum + (a.minutes || 0), 0);
    const loyaltyTop5Share = currentMinutes > 0 ? +((top5ArtistMinutes / currentMinutes) * 100).toFixed(1) : 0;

    // Discovery rhythm by month
    const seenArtists = new Set(prevArtists);
    const monthlyNewArtists = Array(12).fill(0);
    for (let m = 0; m < 12; m++) {
        const monthArtists = new Set(yearData.filter(d => d.month === m).map(d => d.artistName).filter(Boolean));
        monthArtists.forEach(a => {
            if (!seenArtists.has(a)) {
                monthlyNewArtists[m] += 1;
                seenArtists.add(a);
            }
        });
    }

    // Year progression tags
    const yearArc = secondHalfMinutes >= firstHalfMinutes ? 'Stronger Second Half' : 'Front-Loaded Year';
    const quarterPeakIndex = quarterMinutes.indexOf(Math.max(...quarterMinutes));
    const quarterLabels = ['Q1', 'Q2', 'Q3', 'Q4'];

    const daypartTotal = Object.values(buckets).reduce((a, b) => a + b, 0) || 1;
    const daypartPct = {
        morning: +((buckets.morning / daypartTotal) * 100).toFixed(1),
        afternoon: +((buckets.afternoon / daypartTotal) * 100).toFixed(1),
        evening: +((buckets.evening / daypartTotal) * 100).toFixed(1),
        night: +((buckets.night / daypartTotal) * 100).toFixed(1),
    };

    const mood = daypartPct.night >= 35 ? 'Late-night heavy' : daypartPct.morning >= 35 ? 'Morning-focused' : daypartPct.evening >= 35 ? 'Evening-driven' : 'Balanced listener';

    return {
        totalMinutes: Math.round(currentMinutes),
        totalPlays: currentPlays,
        totalHours: Math.round(currentMinutes / 60),
        topSong,
        topArtist,
        topAlbum,
        topSongMain,
        topArtistMain,
        topAlbumMain,
        monthlyMinutes: monthlyMinutes.map(m => Math.round(m)),
        monthlyPlays,
        quarterMinutes: quarterMinutes.map(v => Math.round(v)),
        uniques: { tracks: uniqueTracks.size, artists: uniqueArtists.size, albums: uniqueAlbums.size },
        discoveries: {
            tracks: Math.round((newTracks / uniqueTracks.size) * 100),
            artists: Math.round((newArtists / uniqueArtists.size) * 100)
        },
        monthlyNewArtists,
        skipRate: ((skipped / yearData.length) * 100).toFixed(1),
        peakMonth: monthNames[peakMonth],
        peakMonthMinutes: Math.round(monthlyMinutes[peakMonth] || 0),
        topHour: `${topHour}:00`,
        topWeekday: weekdayNames[topWeekdayIndex],
        topDay: topDayEntry ? {
            date: topDayEntry[0],
            minutes: Math.round(topDayEntry[1].minutes),
            plays: topDayEntry[1].plays
        } : null,
        longestStreak,
        activeDays,
        playsPerActiveDay,
        minutesPerActiveDay,
        persona: personaMap[dominantTime] || 'Music Lover',
        timeBuckets: buckets,
        daypartPct,
        mood,
        weekendShare,
        obsessionShare,
        loyaltyTop5Share,
        yearArc,
        quarterPeak: quarterLabels[quarterPeakIndex],
        firstHalfMinutes: Math.round(firstHalfMinutes),
        secondHalfMinutes: Math.round(secondHalfMinutes),
        comparePrev: {
            available: prevYearData.length > 0,
            minutesPct: deltaPct(currentMinutes, prevMinutes),
            playsPct: deltaPct(currentPlays, prevPlays),
            artistsPct: deltaPct(currentArtists, prevArtistsCount)
        }
    };
}
