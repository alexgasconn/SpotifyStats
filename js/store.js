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
    f1MinutesWeight: 50,
};

export function getConfig() { return { ..._cfg }; }
export function setF1Weight(minutesWeight) { _cfg.f1MinutesWeight = Math.max(0, Math.min(100, Number(minutesWeight) || 50)); }

function formatLocalDate(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

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

function normalizePlatform(raw) {
    if (!raw) return 'Unknown';
    const p = raw.toLowerCase();
    if (p.includes('iphone') || p.includes('ios')) return 'iPhone';
    if (p.includes('ipad')) return 'iPad';
    if (p.includes('mac') || p.includes('osx') || p.includes('os x') || p.includes('macos')) return 'Mac';
    if (p.includes('android')) return 'Android';
    if (p.includes('windows')) return 'Windows';
    if (p.includes('linux')) return 'Linux';
    if (p.includes('chromebook') || p.includes('chrome os') || p.includes('chromeos')) return 'ChromeOS';
    if (p.includes('web') || p.includes('browser')) return 'Web Player';
    if (p.includes('cast') || p.includes('chromecast') || p.includes('google home') || p.includes('nest')) return 'Cast';
    if (p.includes('sonos')) return 'Sonos';
    if (p.includes('alexa') || p.includes('echo') || p.includes('amazon')) return 'Alexa';
    if (p.includes('playstation') || p.includes('ps4') || p.includes('ps5')) return 'PlayStation';
    if (p.includes('xbox')) return 'Xbox';
    if (p.includes('samsung') || p.includes('smart tv') || p.includes('smarttv') || p.includes('tv')) return 'Smart TV';
    if (p.includes('car') || p.includes('carplay')) return 'Car';
    if (p.includes('watch') || p.includes('wearos') || p.includes('wear')) return 'Wearable';
    // Capitalize first word as fallback
    return raw.charAt(0).toUpperCase() + raw.slice(1).split(/[\s_-]/)[0];
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
        date: formatLocalDate(ts),
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
        platform: normalizePlatform(entry.platform),
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
    const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

    const getItemIdentity = (d) => {
        if (key === 'albumName') {
            const album = d.albumName ? String(d.albumName).trim() : '';
            const artist = d.artistName ? String(d.artistName).trim() : '';
            if (!album || !artist || album.toLowerCase() === 'null') return null;
            return {
                itemKey: `${album}|||${artist}`,
                displayName: album,
                artistName: artist,
                albumName: album
            };
        }

        if (key === 'trackName') {
            const track = d.trackName ? String(d.trackName).trim() : '';
            if (!track || track.toLowerCase() === 'null') return null;
            return {
                itemKey: `${track}|||${d.artistName || ''}`,
                displayName: track,
                artistName: d.artistName || '',
                albumName: d.albumName || ''
            };
        }

        const val = d[key] ? String(d[key]).trim() : '';
        if (!val || val.toLowerCase() === 'null') return null;
        return {
            itemKey: val,
            displayName: val,
            artistName: d.artistName || '',
            albumName: ''
        };
    };

    music.forEach(d => {
        const identity = getItemIdentity(d);
        if (!identity) return;

        const { itemKey, displayName, artistName, albumName } = identity;

        if (!grouped[itemKey]) {
            grouped[itemKey] = {
                name: displayName,
                artistName,
                albumName: albumName || '',
                plays: 0,
                minutes: 0,
                skipped: 0,
                points: 0
            };
        }
        grouped[itemKey].plays++;
        grouped[itemKey].minutes += d.durationMin;
        if (d.skipped) grouped[itemKey].skipped++;
    });

    // F1-style weekly points: weekly ranking by 50% minutes + 50% plays, top 10 score 25..1
    const weekMap = {};
    music.forEach(d => {
        const identity = getItemIdentity(d);
        if (!identity) return;
        const wk = getStartOfWeek(d.ts);
        if (!weekMap[wk]) weekMap[wk] = {};
        if (!weekMap[wk][identity.itemKey]) {
            weekMap[wk][identity.itemKey] = { minutes: 0, plays: 0 };
        }
        weekMap[wk][identity.itemKey].minutes += d.durationMin;
        weekMap[wk][identity.itemKey].plays += 1;
    });

    Object.values(weekMap).forEach(weekValues => {
        const rows = Object.entries(weekValues).map(([itemKey, vals]) => ({
            itemKey,
            minutes: vals.minutes || 0,
            plays: vals.plays || 0
        }));
        const maxMinutes = Math.max(...rows.map(r => r.minutes), 1);
        const maxPlays = Math.max(...rows.map(r => r.plays), 1);
        const wMin = _cfg.f1MinutesWeight / 100;
        const wPlay = 1 - wMin;

        rows.forEach(r => {
            r.weekScore = ((r.minutes / maxMinutes) * wMin) + ((r.plays / maxPlays) * wPlay);
        });

        rows
            .sort((a, b) => {
                if (b.weekScore !== a.weekScore) return b.weekScore - a.weekScore;
                if (b.minutes !== a.minutes) return b.minutes - a.minutes;
                if (b.plays !== a.plays) return b.plays - a.plays;
                return a.itemKey.localeCompare(b.itemKey);
            })
            .slice(0, 10)
            .forEach(({ itemKey }, idx) => {
                if (grouped[itemKey]) grouped[itemKey].points += (F1_POINTS[idx] || 0);
            });
    });

    return Object.values(grouped)
        .map(v => ({
            ...v,
            minutes: Math.round(v.minutes),
            points: Math.round(v.points || 0),
            skipRate: v.plays > 0 ? ((v.skipped / v.plays) * 100).toFixed(1) : '0.0'
        }))
        .sort((a, b) => {
            const metricDiff = (b[metric] || 0) - (a[metric] || 0);
            if (metricDiff !== 0) return metricDiff;
            return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
        })
        .slice(0, topN);
}

// ─────────────────────────────────────────────
//  TEMPORAL DISTRIBUTIONS
// ─────────────────────────────────────────────

function getStartOfWeek(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    const dayFromMonday = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - dayFromMonday);
    return formatLocalDate(date);
}

export function calculateAggregatedTimeline(data, unit = 'week') {
    if (!data || !data.length) return [];
    const map = {};
    data.forEach(d => {
        let key;
        switch (unit) {
            case 'year': key = `${d.year}-01-01`; break;
            case 'month': key = `${d.year}-${String(d.month + 1).padStart(2, '0')}-01`; break;
            case 'week': key = getStartOfWeek(d.ts); break;
            default: key = d.date;
        }
        map[key] = (map[key] || 0) + d.durationMin;
    });
    return Object.entries(map)
        .map(([date, minutes]) => ({ x: date, y: Math.round(minutes) }))
        .sort((a, b) => new Date(a.x) - new Date(b.x));
}

export function calculateSkipRateTrend(data, unit = 'week') {
    if (!data || !data.length) return [];

    const map = {};

    data.forEach(d => {
        let key;
        switch (unit) {
            case 'year':
                key = `${d.year}-01-01`;
                break;
            case 'month':
                key = `${d.year}-${String(d.month + 1).padStart(2, '0')}-01`;
                break;
            case 'week':
                key = getStartOfWeek(d.ts);
                break;
            case 'day':
            default:
                key = d.date;
                break;
        }

        if (!map[key]) map[key] = { plays: 0, skipped: 0 };
        map[key].plays += 1;
        if (d.skipped) map[key].skipped += 1;
    });

    return Object.entries(map)
        .sort((a, b) => new Date(a[0]) - new Date(b[0]))
        .map(([x, v]) => ({
            x,
            y: +((v.skipped / (v.plays || 1)) * 100).toFixed(1),
            plays: v.plays,
            skipped: v.skipped
        }));
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

export function getViewerEntities(data, entityType = 'artist', topN = 250) {
    const music = (data || []).filter(d => !d.isPodcast && d.trackName);
    const map = {};

    const buildKey = (d) => {
        if (entityType === 'artist') {
            const artist = d.artistName ? String(d.artistName).trim() : '';
            return artist ? { key: artist, name: artist, subtitle: '' } : null;
        }

        if (entityType === 'album') {
            const album = d.albumName ? String(d.albumName).trim() : '';
            const artist = d.artistName ? String(d.artistName).trim() : '';
            if (!album || !artist || album.toLowerCase() === 'null') return null;
            return { key: `${album}|||${artist}`, name: album, subtitle: artist };
        }

        const track = d.trackName ? String(d.trackName).trim() : '';
        const artist = d.artistName ? String(d.artistName).trim() : '';
        if (!track || track.toLowerCase() === 'null') return null;
        return { key: `${track}|||${artist}`, name: track, subtitle: artist };
    };

    music.forEach(d => {
        const base = buildKey(d);
        if (!base) return;
        if (!map[base.key]) {
            map[base.key] = { ...base, plays: 0, minutes: 0 };
        }
        map[base.key].plays += 1;
        map[base.key].minutes += d.durationMin;
    });

    return Object.values(map)
        .map(v => ({ ...v, minutes: Math.round(v.minutes) }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, topN);
}

export function calculateViewerAccumulatedSeries(data, options = {}) {
    const {
        entityType = 'artist',
        metric = 'minutes',
        granularity = 'month',
        fromDate = '',
        toDate = '',
        topX = 8,
        valueMode = 'accum',
        rollingWindow = 4
    } = options;

    const parseKey = (d) => {
        if (entityType === 'artist') return d.artistName || '';
        if (entityType === 'album') return `${d.albumName || ''}|||${d.artistName || ''}`;
        return `${d.trackName || ''}|||${d.artistName || ''}`;
    };

    const parseLabel = (key) => {
        if (entityType === 'artist') return { name: key, subtitle: '' };
        const [name, subtitle] = String(key).split('|||');
        return { name: name || key, subtitle: subtitle || '' };
    };

    const music = (data || []).filter(d => {
        if (d.isPodcast || !d.trackName) return false;
        if (fromDate && d.date < fromDate) return false;
        if (toDate && d.date > toDate) return false;
        if (!parseKey(d)) return false;
        return true;
    });

    if (!music.length) return { labels: [], entities: [], seriesByKey: {}, totalsByKey: {} };

    const bucketOf = (d) => {
        switch (granularity) {
            case 'year': return `${d.year}-01-01`;
            case 'month': return `${d.year}-${String(d.month + 1).padStart(2, '0')}-01`;
            case 'week': return getStartOfWeek(d.ts);
            case 'day':
            default: return d.date;
        }
    };

    const bucketMap = {};
    music.forEach(d => {
        const b = bucketOf(d);
        const key = parseKey(d);

        if (!bucketMap[b]) bucketMap[b] = {};
        if (!bucketMap[b][key]) bucketMap[b][key] = { minutes: 0, plays: 0 };

        bucketMap[b][key].minutes += d.durationMin;
        bucketMap[b][key].plays += 1;
    });

    const buckets = Object.keys(bucketMap).sort((a, b) => new Date(a) - new Date(b));

    const metricTotals = {};
    const periodMetricByBucket = {};

    if (metric === 'points') {
        // Per bucket, assign F1 points by minutes ranking (Top 10): 25..1.
        const pointsScale = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

        buckets.forEach(bucket => {
            const rows = Object.entries(bucketMap[bucket] || {})
                .map(([key, v]) => ({ key, minutes: v.minutes || 0, plays: v.plays || 0 }))
                .sort((a, b) => {
                    if (b.minutes !== a.minutes) return b.minutes - a.minutes;
                    if (b.plays !== a.plays) return b.plays - a.plays;
                    return a.key.localeCompare(b.key);
                });

            const ptsMap = {};
            rows.slice(0, 10).forEach((row, idx) => {
                ptsMap[row.key] = pointsScale[idx] || 0;
            });

            periodMetricByBucket[bucket] = ptsMap;

            Object.entries(ptsMap).forEach(([key, pts]) => {
                metricTotals[key] = (metricTotals[key] || 0) + pts;
            });
        });
    } else {
        buckets.forEach(bucket => {
            const vals = {};
            Object.entries(bucketMap[bucket] || {}).forEach(([key, v]) => {
                const metricVal = metric === 'plays' ? (v.plays || 0) : (v.minutes || 0);
                vals[key] = metricVal;
                metricTotals[key] = (metricTotals[key] || 0) + metricVal;
            });
            periodMetricByBucket[bucket] = vals;
        });
    }

    const rankedKeys = Object.entries(metricTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.max(1, topX))
        .map(([k]) => k);

    if (!rankedKeys.length) return { labels: [], entities: [], seriesByKey: {}, totalsByKey: {} };

    const formatLabel = (bucket) => {
        if (granularity === 'year') return String(bucket).slice(0, 4);
        if (granularity === 'month') return String(bucket).slice(0, 7);
        if (granularity === 'week') return bucket;
        return bucket;
    };

    const labels = buckets.map(formatLabel);
    const periodSeriesByKey = {};
    const seriesByKey = {};
    const totalsByKey = {};
    const entities = rankedKeys.map(key => ({ key, ...parseLabel(key) }));

    rankedKeys.forEach(key => {
        periodSeriesByKey[key] = buckets.map(b => periodMetricByBucket[b]?.[key] || 0);
    });

    const w = Math.max(1, parseInt(rollingWindow, 10) || 1);
    rankedKeys.forEach(key => {
        const raw = periodSeriesByKey[key] || [];

        if (valueMode === 'accum') {
            let cumulative = 0;
            seriesByKey[key] = raw.map(v => {
                cumulative += v;
                if (metric === 'plays' || metric === 'points') return cumulative;
                return Math.round(cumulative);
            });
        } else if (valueMode === 'rolling') {
            seriesByKey[key] = raw.map((_, idx) => {
                const start = Math.max(0, idx - w + 1);
                const windowVals = raw.slice(start, idx + 1);
                const avg = windowVals.reduce((s, v) => s + v, 0) / (windowVals.length || 1);
                if (metric === 'plays' || metric === 'points') return +avg.toFixed(2);
                return +avg.toFixed(1);
            });
        } else {
            // 'period' and 'simple' both show raw values for each bucket.
            seriesByKey[key] = raw.map(v => {
                if (metric === 'plays' || metric === 'points') return v;
                return Math.round(v);
            });
        }

        const finalVal = seriesByKey[key][seriesByKey[key].length - 1] || 0;
        if (metric === 'plays' || metric === 'points') totalsByKey[key] = finalVal;
        else totalsByKey[key] = Math.round(finalVal);
    });

    return {
        labels,
        entities,
        seriesByKey,
        totalsByKey
    };
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
    return _calcItemStreaks(data, d => d.artistName, topN);
}

export function calculateTrackDailyStreaks(data, topN = 15) {
    return _calcItemStreaks(data, d => d.trackName, topN);
}

export function calculateAlbumDailyStreaks(data, topN = 15) {
    return _calcItemStreaks(data, d => d.albumName, topN);
}

function _calcItemStreaks(data, keyFn, topN) {
    // Build map: date -> Set of items
    const byDate = {};
    data.forEach(d => {
        const k = keyFn(d);
        if (!k) return;
        if (!byDate[d.date]) byDate[d.date] = new Set();
        byDate[d.date].add(k);
    });
    const dates = Object.keys(byDate).sort();

    // Get top items by play count
    const plays = {};
    data.forEach(d => { const k = keyFn(d); if (k) plays[k] = (plays[k] || 0) + 1; });
    const topItems = Object.entries(plays).sort((a, b) => b[1] - a[1]).slice(0, 300).map(a => a[0]);

    const result = [];
    topItems.forEach(item => {
        let longest = 0, cur = 0, tempStart = null, bestStart = null, bestEnd = null;
        for (let i = 0; i < dates.length; i++) {
            if (byDate[dates[i]].has(item)) {
                if (cur === 0) tempStart = dates[i];
                const diff = i > 0 ? (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000 : 1;
                if (diff > 1 && cur > 0) { cur = 1; tempStart = dates[i]; }
                else cur++;
                if (cur > longest) { longest = cur; bestStart = tempStart; bestEnd = dates[i]; }
            } else {
                cur = 0;
            }
        }
        if (longest > 1) result.push({ name: item, streak: longest, from: bestStart, to: bestEnd });
    });

    return result.sort((a, b) => b.streak - a.streak).slice(0, topN);
}

// Longest GAP (consecutive listening days WITHOUT each item) for top items
export function calculateItemGapStreaks(data, keyFn, topN = 15) {
    // Get all days in the full range
    const allDaySet = new Set(data.map(d => d.date));
    const allDates = [...allDaySet].sort();
    if (!allDates.length) return [];

    // Build map: date -> Set of items
    const byDate = {};
    data.forEach(d => {
        const k = keyFn(d);
        if (!k) return;
        if (!byDate[d.date]) byDate[d.date] = new Set();
        byDate[d.date].add(k);
    });

    // Get top items by total minutes
    const totals = {};
    data.forEach(d => { const k = keyFn(d); if (k) totals[k] = (totals[k] || 0) + d.durationMin; });
    const topItems = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, topN).map(a => a[0]);

    const result = [];
    topItems.forEach(item => {
        // Find first and last day the item was heard to bound the gap search
        const activeDays = allDates.filter(d => byDate[d] && byDate[d].has(item));
        if (activeDays.length < 2) return;
        const firstDay = activeDays[0];
        const lastDay = activeDays[activeDays.length - 1];
        const boundedDates = allDates.filter(d => d >= firstDay && d <= lastDay);

        let longest = 0, cur = 0, tempStart = null, bestStart = null, bestEnd = null;
        for (let i = 0; i < boundedDates.length; i++) {
            const has = byDate[boundedDates[i]] && byDate[boundedDates[i]].has(item);
            if (!has) {
                if (cur === 0) tempStart = boundedDates[i];
                cur++;
                if (cur > longest) { longest = cur; bestStart = tempStart; bestEnd = boundedDates[i]; }
            } else {
                cur = 0;
            }
        }
        if (longest > 0) result.push({ name: item, gap: longest, from: bestStart, to: bestEnd });
    });

    return result.sort((a, b) => b.gap - a.gap);
}

export function calculateArtistGapStreaks(data, topN = 15) {
    return calculateItemGapStreaks(data, d => d.artistName, topN);
}
export function calculateTrackGapStreaks(data, topN = 15) {
    return calculateItemGapStreaks(data, d => d.trackName, topN);
}
export function calculateAlbumGapStreaks(data, topN = 15) {
    return calculateItemGapStreaks(data, d => d.albumName, topN);
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
//  ARTIST VS ARTIST (COMPARE TAB)
// ─────────────────────────────────────────────

export function calculateArtistComparison(data, artistA, artistB, options = {}) {
    const cleanA = String(artistA || '').trim();
    const cleanB = String(artistB || '').trim();
    if (!cleanA || !cleanB || cleanA === cleanB) return null;

    const strictWinnerMode = !!options.strictWinnerMode;
    const customWeights = options.weights || {};

    const music = (data || []).filter(d => !d.isPodcast && d.trackName);
    const aRows = music.filter(d => d.artistName === cleanA);
    const bRows = music.filter(d => d.artistName === cleanB);
    if (!aRows.length || !bRows.length) return null;

    const allDates = [...new Set(music.map(d => d.date))].sort();
    const monthLabels = [...new Set(music.map(d => `${d.year}-${String(d.month + 1).padStart(2, '0')}`))].sort();

    const summarize = (rows) => {
        const totalMinutesRaw = rows.reduce((s, d) => s + d.durationMin, 0);
        const totalMinutes = Math.round(totalMinutesRaw);
        const plays = rows.length;
        const skipped = rows.filter(r => r.skipped).length;
        const skipRate = +(((skipped / (plays || 1)) * 100).toFixed(1));

        const uniqueTracks = new Set(rows.map(r => r.trackName).filter(Boolean));
        const uniqueAlbums = new Set(rows.map(r => `${r.albumName || ''}|||${r.artistName || ''}`).filter(v => !v.startsWith('|||')));
        const activeDays = new Set(rows.map(r => r.date));

        const dayMinutes = {};
        const dayPlays = {};
        const dayTrackCounts = {};
        const hourMinutes = Array(24).fill(0);
        const weekdayMinutes = Array(7).fill(0);
        const timeOfDayMinutes = { morning: 0, afternoon: 0, evening: 0, night: 0 };
        const platformMinutes = {};
        const trackPlaysMap = {};
        const albumPlaysMap = {};

        rows.forEach(r => {
            dayMinutes[r.date] = (dayMinutes[r.date] || 0) + r.durationMin;
            dayPlays[r.date] = (dayPlays[r.date] || 0) + 1;

            const dayTrackKey = `${r.date}|||${r.trackName || ''}`;
            dayTrackCounts[dayTrackKey] = (dayTrackCounts[dayTrackKey] || 0) + 1;

            hourMinutes[r.hour] += r.durationMin;
            weekdayMinutes[r.weekday] += r.durationMin;
            if (r.timeOfDay && timeOfDayMinutes[r.timeOfDay] !== undefined) {
                timeOfDayMinutes[r.timeOfDay] += r.durationMin;
            }
            platformMinutes[r.platform || 'unknown'] = (platformMinutes[r.platform || 'unknown'] || 0) + r.durationMin;

            if (r.trackName) trackPlaysMap[r.trackName] = (trackPlaysMap[r.trackName] || 0) + 1;
            if (r.albumName) {
                const aKey = `${r.albumName}|||${r.artistName || ''}`;
                albumPlaysMap[aKey] = (albumPlaysMap[aKey] || 0) + 1;
            }
        });

        const avgMinutesPerPlay = +((totalMinutesRaw / (plays || 1)).toFixed(2));
        const avgPlaysPerActiveDay = +((plays / (activeDays.size || 1)).toFixed(2));
        const avgMinutesPerActiveDay = +((totalMinutesRaw / (activeDays.size || 1)).toFixed(2));
        const bestDay = Object.entries(dayMinutes).sort((a, b) => b[1] - a[1])[0] || null;

        const weekMinutes = {};
        rows.forEach(r => {
            const wk = getStartOfWeek(r.ts);
            weekMinutes[wk] = (weekMinutes[wk] || 0) + r.durationMin;
        });
        const bestWeek = Object.entries(weekMinutes).sort((a, b) => b[1] - a[1])[0] || null;

        const monthMinutes = {};
        rows.forEach(r => {
            const mk = `${r.year}-${String(r.month + 1).padStart(2, '0')}`;
            monthMinutes[mk] = (monthMinutes[mk] || 0) + r.durationMin;
        });
        const bestMonth = Object.entries(monthMinutes).sort((a, b) => b[1] - a[1])[0] || null;

        const streaks = calculateStreaksFromDateSet(activeDays);

        const totalHourMinutes = hourMinutes.reduce((s, v) => s + v, 0) || 1;
        const hourPct = hourMinutes.map(v => +((v / totalHourMinutes) * 100).toFixed(2));
        const totalWeekdayMinutes = weekdayMinutes.reduce((s, v) => s + v, 0) || 1;
        const weekdayPct = weekdayMinutes.map(v => +((v / totalWeekdayMinutes) * 100).toFixed(2));

        const repeatedSameDayCount = Object.values(dayTrackCounts).filter(c => c >= 2).reduce((s, c) => s + c, 0);
        const repeatedSameDayEvents = Object.values(dayTrackCounts).filter(c => c >= 2).length;

        const varietyTrackPct = +(((uniqueTracks.size / (plays || 1)) * 100).toFixed(1));
        const varietyAlbumPct = +(((uniqueAlbums.size / (plays || 1)) * 100).toFixed(1));

        const topTracks = Object.entries(trackPlaysMap)
            .map(([name, v]) => ({ name, plays: v }))
            .sort((a, b) => b.plays - a.plays)
            .slice(0, 10);

        const topAlbums = Object.entries(albumPlaysMap)
            .map(([k, v]) => {
                const [name] = k.split('|||');
                return { name, plays: v };
            })
            .sort((a, b) => b.plays - a.plays)
            .slice(0, 10);

        const sessionLike = Object.values(dayMinutes).map(v => +(v.toFixed(2))).sort((a, b) => a - b);

        return {
            totalMinutes,
            plays,
            skipped,
            skipRate,
            uniqueTracks: uniqueTracks.size,
            uniqueAlbums: uniqueAlbums.size,
            activeDays: activeDays.size,
            avgMinutesPerPlay,
            avgPlaysPerActiveDay,
            avgMinutesPerActiveDay,
            bestDay: bestDay ? { date: bestDay[0], minutes: Math.round(bestDay[1]) } : null,
            bestWeek: bestWeek ? { week: bestWeek[0], minutes: Math.round(bestWeek[1]) } : null,
            bestMonth: bestMonth ? { month: bestMonth[0], minutes: Math.round(bestMonth[1]) } : null,
            longestStreak: streaks.longest,
            currentStreak: streaks.current,
            repeatedSameDayCount,
            repeatedSameDayEvents,
            varietyTrackPct,
            varietyAlbumPct,
            hourMinutes: hourMinutes.map(v => Math.round(v)),
            hourPct,
            weekdayMinutes: weekdayMinutes.map(v => Math.round(v)),
            weekdayPct,
            timeOfDayMinutes: Object.fromEntries(
                Object.entries(timeOfDayMinutes).map(([k, v]) => [k, Math.round(v)])
            ),
            platformMinutes: Object.fromEntries(
                Object.entries(platformMinutes)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => [k, Math.round(v)])
            ),
            topTracks,
            topAlbums,
            dailyMinutesSorted: sessionLike,
            dayMinutesRaw: dayMinutes,
            dayPlaysRaw: dayPlays
        };
    };

    const A = summarize(aRows);
    const B = summarize(bRows);

    // Monthly trends
    const buildMonthlyMinutes = (rows) => {
        const map = {};
        rows.forEach(r => {
            const k = `${r.year}-${String(r.month + 1).padStart(2, '0')}`;
            map[k] = (map[k] || 0) + r.durationMin;
        });
        return monthLabels.map(m => Math.round(map[m] || 0));
    };

    const monthlyA = buildMonthlyMinutes(aRows);
    const monthlyB = buildMonthlyMinutes(bRows);

    // Trim monthly series so charts start at first non-zero point.
    let monthStart = 0;
    while (monthStart < monthLabels.length && (monthlyA[monthStart] || 0) === 0 && (monthlyB[monthStart] || 0) === 0) {
        monthStart += 1;
    }
    const trimmedMonthLabels = monthLabels.slice(monthStart);
    const trimmedMonthlyA = monthlyA.slice(monthStart);
    const trimmedMonthlyB = monthlyB.slice(monthStart);

    // Cumulative race by date
    const dayMinutesA = A.dayMinutesRaw;
    const dayMinutesB = B.dayMinutesRaw;
    const dayPlaysA = A.dayPlaysRaw;
    const dayPlaysB = B.dayPlaysRaw;

    let accumA = 0;
    let accumB = 0;
    const raceLabels = [];
    const raceA = [];
    const raceB = [];
    const racePlaysA = [];
    const racePlaysB = [];
    let accumPlaysA = 0;
    let accumPlaysB = 0;

    allDates.forEach((date, idx) => {
        accumA += dayMinutesA[date] || 0;
        accumB += dayMinutesB[date] || 0;
        accumPlaysA += dayPlaysA[date] || 0;
        accumPlaysB += dayPlaysB[date] || 0;

        // Keep series readable for long histories.
        const keepStep = allDates.length > 260 ? Math.ceil(allDates.length / 260) : 1;
        const isLast = idx === allDates.length - 1;
        if (idx % keepStep === 0 || isLast) {
            raceLabels.push(date);
            raceA.push(Math.round(accumA));
            raceB.push(Math.round(accumB));
            racePlaysA.push(Math.round(accumPlaysA));
            racePlaysB.push(Math.round(accumPlaysB));
        }
    });

    // Trim cumulative race so it starts when at least one side is non-zero.
    let raceStart = 0;
    while (raceStart < raceLabels.length && (raceA[raceStart] || 0) === 0 && (raceB[raceStart] || 0) === 0) {
        raceStart += 1;
    }
    const trimmedRaceLabels = raceLabels.slice(raceStart);
    const trimmedRaceA = raceA.slice(raceStart);
    const trimmedRaceB = raceB.slice(raceStart);
    const trimmedRacePlaysA = racePlaysA.slice(raceStart);
    const trimmedRacePlaysB = racePlaysB.slice(raceStart);

    // Week-based duel points and wins
    const byWeekA = {};
    const byWeekB = {};
    aRows.forEach(r => {
        const wk = getStartOfWeek(r.ts);
        byWeekA[wk] = (byWeekA[wk] || 0) + r.durationMin;
    });
    bRows.forEach(r => {
        const wk = getStartOfWeek(r.ts);
        byWeekB[wk] = (byWeekB[wk] || 0) + r.durationMin;
    });

    const weeks = [...new Set([...Object.keys(byWeekA), ...Object.keys(byWeekB)])].sort();
    let duelPointsA = 0;
    let duelPointsB = 0;
    let winsA = 0;
    let winsB = 0;
    let ties = 0;
    const weeklyDuel = weeks.map(w => {
        const aMin = byWeekA[w] || 0;
        const bMin = byWeekB[w] || 0;
        let winner = 'tie';
        if (aMin > bMin) {
            winner = 'A';
            winsA += 1;
            duelPointsA += 3;
        } else if (bMin > aMin) {
            winner = 'B';
            winsB += 1;
            duelPointsB += 3;
        } else {
            ties += 1;
            duelPointsA += 1;
            duelPointsB += 1;
        }
        return {
            week: w,
            aMinutes: Math.round(aMin),
            bMinutes: Math.round(bMin),
            winner
        };
    });

    const pointsRace = { labels: [], a: [], b: [] };
    let cumPtsA = 0;
    let cumPtsB = 0;
    weeklyDuel.forEach((w, idx) => {
        cumPtsA += w.winner === 'A' ? 3 : w.winner === 'tie' ? 1 : 0;
        cumPtsB += w.winner === 'B' ? 3 : w.winner === 'tie' ? 1 : 0;
        pointsRace.labels.push(w.week);
        pointsRace.a.push(cumPtsA);
        pointsRace.b.push(cumPtsB);
    });

    // Device comparison matrix
    const allPlatforms = [...new Set([...Object.keys(A.platformMinutes), ...Object.keys(B.platformMinutes)])]
        .sort((x, y) => ((B.platformMinutes[y] || 0) + (A.platformMinutes[y] || 0)) - ((B.platformMinutes[x] || 0) + (A.platformMinutes[x] || 0)));

    const platformRows = allPlatforms.slice(0, 2).map(p => ({
        platform: p,
        aMinutes: A.platformMinutes[p] || 0,
        bMinutes: B.platformMinutes[p] || 0
    }));

    // Shared vs exclusive catalogue
    const aTrackSet = new Set(aRows.map(r => r.trackName).filter(Boolean));
    const bTrackSet = new Set(bRows.map(r => r.trackName).filter(Boolean));
    const aAlbumSet = new Set(aRows.map(r => r.albumName).filter(Boolean));
    const bAlbumSet = new Set(bRows.map(r => r.albumName).filter(Boolean));

    let sharedTracks = 0;
    aTrackSet.forEach(t => { if (bTrackSet.has(t)) sharedTracks += 1; });
    let sharedAlbums = 0;
    aAlbumSet.forEach(a => { if (bAlbumSet.has(a)) sharedAlbums += 1; });

    const trackUnion = aTrackSet.size + bTrackSet.size - sharedTracks;
    const albumUnion = aAlbumSet.size + bAlbumSet.size - sharedAlbums;

    const sessionDistribution = {
        A: quantilesFromSorted(A.dailyMinutesSorted),
        B: quantilesFromSorted(B.dailyMinutesSorted)
    };

    const defaultWeights = {
        totalMinutes: 3,
        plays: 2,
        uniqueTracks: 1.5,
        uniqueAlbums: 0.6,
        activeDays: 1.5,
        duelPoints: 3,
        weeklyWins: 2,
        longestStreak: 2,
        currentStreak: 1.5,
        bestDayMinutes: 1,
        bestWeekMinutes: 1,
        bestMonthMinutes: 1,
        avgPlaysPerActiveDay: 1,
        avgMinPerActiveDay: 1.5,
        skipRate: 5,
        varietyTrackPct: 2,
        varietyAlbumPct: 1,
        repeatSameDay: strictWinnerMode ? 2 : 1,
        repeatSameDayEvents: strictWinnerMode ? 2 : 1,
    };

    const scorecard = [
        { key: 'totalMinutes', label: 'Total minutes', a: A.totalMinutes, b: B.totalMinutes, higherWins: true },
        { key: 'plays', label: 'Total plays', a: A.plays, b: B.plays, higherWins: true },
        { key: 'uniqueTracks', label: 'Unique tracks', a: A.uniqueTracks, b: B.uniqueTracks, higherWins: true },
        { key: 'uniqueAlbums', label: 'Unique albums', a: A.uniqueAlbums, b: B.uniqueAlbums, higherWins: true },
        { key: 'activeDays', label: 'Active days', a: A.activeDays, b: B.activeDays, higherWins: true },
        { key: 'duelPoints', label: 'Head-to-head points', a: duelPointsA, b: duelPointsB, higherWins: true },
        { key: 'weeklyWins', label: 'Weekly wins', a: winsA, b: winsB, higherWins: true },
        { key: 'longestStreak', label: 'Longest streak (days)', a: A.longestStreak, b: B.longestStreak, higherWins: true },
        { key: 'currentStreak', label: 'Current streak (days)', a: A.currentStreak, b: B.currentStreak, higherWins: true },
        { key: 'bestDayMinutes', label: 'Best day minutes', a: A.bestDay?.minutes || 0, b: B.bestDay?.minutes || 0, higherWins: true },
        { key: 'bestWeekMinutes', label: 'Best week minutes', a: A.bestWeek?.minutes || 0, b: B.bestWeek?.minutes || 0, higherWins: true },
        { key: 'bestMonthMinutes', label: 'Best month minutes', a: A.bestMonth?.minutes || 0, b: B.bestMonth?.minutes || 0, higherWins: true },
        { key: 'avgPlaysPerActiveDay', label: 'Avg plays / active day', a: A.avgPlaysPerActiveDay, b: B.avgPlaysPerActiveDay, higherWins: true },
        { key: 'avgMinPerActiveDay', label: 'Avg min / active day', a: A.avgMinutesPerActiveDay, b: B.avgMinutesPerActiveDay, higherWins: true },
        { key: 'skipRate', label: 'Skip rate (lower better)', a: A.skipRate, b: B.skipRate, higherWins: false },
        { key: 'varietyTrackPct', label: 'Track variety %', a: A.varietyTrackPct, b: B.varietyTrackPct, higherWins: true },
        { key: 'varietyAlbumPct', label: 'Album variety %', a: A.varietyAlbumPct, b: B.varietyAlbumPct, higherWins: true },
        {
            key: 'repeatSameDay',
            label: strictWinnerMode ? 'Same-day repetition count (lower better)' : 'Same-day repetition count',
            a: A.repeatedSameDayCount,
            b: B.repeatedSameDayCount,
            higherWins: !strictWinnerMode
        },
        {
            key: 'repeatSameDayEvents',
            label: strictWinnerMode ? 'Repeated-track day events (lower better)' : 'Repeated-track day events',
            a: A.repeatedSameDayEvents,
            b: B.repeatedSameDayEvents,
            higherWins: !strictWinnerMode
        }
    ].map(row => ({
        ...row,
        weight: Math.max(0, Number(customWeights[row.key] ?? defaultWeights[row.key] ?? 1))
    }));

    let scoreA = 0;
    let scoreB = 0;
    let draws = 0;
    let weightedA = 0;
    let weightedB = 0;
    let weightedDraw = 0;

    scorecard.forEach(row => {
        if (row.a === row.b) {
            draws += 1;
            row.winner = 'draw';
            weightedDraw += row.weight;
            weightedA += row.weight / 2;
            weightedB += row.weight / 2;
            return;
        }
        if (row.higherWins) {
            if (row.a > row.b) {
                scoreA += 1;
                row.winner = 'A';
                weightedA += row.weight;
            } else {
                scoreB += 1;
                row.winner = 'B';
                weightedB += row.weight;
            }
        } else {
            if (row.a < row.b) {
                scoreA += 1;
                row.winner = 'A';
                weightedA += row.weight;
            } else {
                scoreB += 1;
                row.winner = 'B';
                weightedB += row.weight;
            }
        }
    });

    const weightedWinner = weightedA === weightedB ? 'tie' : (weightedA > weightedB ? 'A' : 'B');

    return {
        artistA: cleanA,
        artistB: cleanB,
        summaryA: A,
        summaryB: B,
        monthlyLabels: trimmedMonthLabels,
        monthlyA: trimmedMonthlyA,
        monthlyB: trimmedMonthlyB,
        raceLabels: trimmedRaceLabels,
        raceA: trimmedRaceA,
        raceB: trimmedRaceB,
        raceSeries: {
            minutes: {
                labels: trimmedRaceLabels,
                a: trimmedRaceA,
                b: trimmedRaceB,
                yTitle: 'Cumulative Minutes'
            },
            plays: {
                labels: trimmedRaceLabels,
                a: trimmedRacePlaysA,
                b: trimmedRacePlaysB,
                yTitle: 'Cumulative Plays'
            },
            points: {
                labels: pointsRace.labels,
                a: pointsRace.a,
                b: pointsRace.b,
                yTitle: 'Cumulative Duel Points'
            }
        },
        duel: {
            pointsA: duelPointsA,
            pointsB: duelPointsB,
            winsA,
            winsB,
            ties,
            weekly: weeklyDuel
        },
        platformRows,
        overlap: {
            sharedTracks,
            sharedAlbums,
            onlyATracks: Math.max(0, aTrackSet.size - sharedTracks),
            onlyBTracks: Math.max(0, bTrackSet.size - sharedTracks),
            onlyAAlbums: Math.max(0, aAlbumSet.size - sharedAlbums),
            onlyBAlbums: Math.max(0, bAlbumSet.size - sharedAlbums),
            trackJaccardPct: +(((sharedTracks / (trackUnion || 1)) * 100).toFixed(1)),
            albumJaccardPct: +(((sharedAlbums / (albumUnion || 1)) * 100).toFixed(1))
        },
        sessionDistribution,
        scorecard,
        strictWinnerMode,
        winner: scoreA === scoreB ? 'tie' : (scoreA > scoreB ? 'A' : 'B'),
        weightedWinner,
        winsByMetrics: {
            A: scoreA,
            B: scoreB,
            draws,
            weightedA: +weightedA.toFixed(2),
            weightedB: +weightedB.toFixed(2),
            weightedDraw: +weightedDraw.toFixed(2)
        }
    };
}

function quantilesFromSorted(sortedVals) {
    if (!sortedVals || !sortedVals.length) return { q10: 0, q25: 0, q50: 0, q75: 0, q90: 0 };

    const q = (p) => {
        const idx = (sortedVals.length - 1) * p;
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        if (lo === hi) return +sortedVals[lo].toFixed(1);
        const t = idx - lo;
        return +(sortedVals[lo] + (sortedVals[hi] - sortedVals[lo]) * t).toFixed(1);
    };

    return {
        q10: q(0.1),
        q25: q(0.25),
        q50: q(0.5),
        q75: q(0.75),
        q90: q(0.9)
    };
}

function calculateStreaksFromDateSet(dateSet) {
    const dates = [...dateSet].sort();
    if (!dates.length) return { longest: 0, current: 0 };

    let longest = 1;
    let currentRun = 1;

    for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1]);
        const cur = new Date(dates[i]);
        const diffDays = Math.round((cur - prev) / 86400000);
        if (diffDays === 1) {
            currentRun += 1;
            if (currentRun > longest) longest = currentRun;
        } else {
            currentRun = 1;
        }
    }

    let trailing = 1;
    for (let i = dates.length - 1; i > 0; i--) {
        const cur = new Date(dates[i]);
        const prev = new Date(dates[i - 1]);
        const diffDays = Math.round((cur - prev) / 86400000);
        if (diffDays === 1) trailing += 1;
        else break;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastDate = new Date(dates[dates.length - 1]);
    lastDate.setHours(0, 0, 0, 0);
    const gap = Math.round((today - lastDate) / 86400000);
    const current = gap <= 1 ? trailing : 0;

    return { longest, current };
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
        if (!weekMap[wk][key]) weekMap[wk][key] = { totalMinutes: 0, plays: 0, bestSessionMinutes: 0 };
        weekMap[wk][key].totalMinutes += d.durationMin;
        weekMap[wk][key].plays += 1;
        weekMap[wk][key].bestSessionMinutes = Math.max(weekMap[wk][key].bestSessionMinutes, d.durationMin);
    });

    const years = [...new Set(music.map(d => d.year))].sort((a, b) => a - b);
    const activeYear = selectedYear && years.includes(selectedYear) ? selectedYear : years[years.length - 1];

    const yearStandingMap = {};
    const weeklyByYear = {};

    Object.entries(weekMap).sort((a, b) => a[0].localeCompare(b[0])).forEach(([weekStart, values]) => {
        const year = Number(weekStart.split('-')[0]);
        if (!yearStandingMap[year]) yearStandingMap[year] = {};
        if (!weeklyByYear[year]) weeklyByYear[year] = [];

        const ranking = Object.entries(values)
            .map(([key, agg]) => ({
                key,
                minutes: agg.totalMinutes,
                plays: agg.plays || 0,
                bestSessionMinutes: agg.bestSessionMinutes
            }));

        const maxMinutes = Math.max(...ranking.map(r => r.minutes), 1);
        const maxPlays = Math.max(...ranking.map(r => r.plays), 1);
        const wMin = _cfg.f1MinutesWeight / 100;
        const wPlay = 1 - wMin;

        ranking.forEach(r => {
            r.weekScore = ((r.minutes / maxMinutes) * wMin) + ((r.plays / maxPlays) * wPlay);
        });

        ranking.sort((a, b) => {
            if (b.weekScore !== a.weekScore) return b.weekScore - a.weekScore;
            if (b.minutes !== a.minutes) return b.minutes - a.minutes;
            if (b.plays !== a.plays) return b.plays - a.plays;
            return a.key.localeCompare(b.key);
        });

        // Fastest lap: biggest single listening session in the week (not total weekly winner).
        const fastestCandidate = ranking.reduce((best, row) => {
            if (!best || row.bestSessionMinutes > best.bestSessionMinutes) return row;
            return best;
        }, null);
        const topWeekKeys = new Set(ranking.slice(0, 10).map(r => r.key));
        const fastestLapKey = fastestCandidate && topWeekKeys.has(fastestCandidate.key) ? fastestCandidate.key : null;
        const fastestLapMinutes = fastestCandidate ? fastestCandidate.bestSessionMinutes : 0;

        const topWeek = ranking.slice(0, 10).map((r, idx) => {
            const pts = F1_POINTS[idx] || 0;
            let bonusPoints = 0;

            // Fastest lap bonus: +1 point
            if (r.key === fastestLapKey) {
                bonusPoints = 1;
            }

            const totalPoints = pts + bonusPoints;

            if (!yearStandingMap[year][r.key]) {
                yearStandingMap[year][r.key] = { points: 0, weeksWon: 0, podiums: 0, minutes: 0, plays: 0, fastestLaps: 0 };
            }
            yearStandingMap[year][r.key].points += totalPoints;
            yearStandingMap[year][r.key].minutes += r.minutes;
            yearStandingMap[year][r.key].plays += r.plays;
            if (idx === 0) yearStandingMap[year][r.key].weeksWon += 1;
            if (bonusPoints > 0) yearStandingMap[year][r.key].fastestLaps += 1;
            if (idx < 3) yearStandingMap[year][r.key].podiums += 1;

            return {
                rank: idx + 1,
                key: r.key,
                points: totalPoints,
                basePoints: pts,
                bonusPoints: bonusPoints,
                minutes: Math.round(r.minutes),
                plays: r.plays,
                weightedScore: +r.weekScore.toFixed(4),
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
                currentTop10: 0,
                bestTop10: 0,
                currentPodium: 0,
                bestPodium: 0
            };
        });

        weeks.forEach(week => {
            const top10Keys = new Set(week.topWeek.map(r => r.key));
            const podiumKeys = new Set(week.topWeek.slice(0, 3).map(r => r.key));

            yearKeys.forEach(key => {
                const s = streakMap[key];
                if (top10Keys.has(key)) {
                    s.currentTop10 += 1;
                } else {
                    s.currentTop10 = 0;
                }
                s.bestTop10 = Math.max(s.bestTop10, s.currentTop10);

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
                // Kept name for UI compatibility: now means best consecutive Top 10 weeks.
                bestWinStreak: yearStreaks[y]?.[key]?.bestTop10 || 0,
                bestPodiumStreak: yearStreaks[y]?.[key]?.bestPodium || 0,
                minutes: Math.round(val.minutes),
                plays: val.plays || 0
            }))
            .sort((a, b) => b.points - a.points);
    });

    const selectedStandings = (standingsByYear[activeYear] || []).slice(0, topN);
    const selectedWeekly = weeklyByYear[activeYear] || [];

    // Evolution for top contenders of selected year
    const contenders = selectedStandings.slice(0, 8).map(s => s.key);

    // Month-by-month cumulative points
    const monthPoints = {};
    contenders.forEach(c => { monthPoints[c] = Array(12).fill(0); });

    selectedWeekly.forEach(w => {
        const month = Number(w.weekStart.split('-')[1]) - 1;
        if (isNaN(month) || month < 0 || month > 11) return;
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

    // Week-by-week cumulative points
    const weekLabels = selectedWeekly.map((_, idx) => `W${idx + 1}`);
    const evolutionWeekSeries = contenders.map(key => {
        let cum = 0;
        const data = selectedWeekly.map(w => {
            const row = w.topWeek.find(r => r.key === key);
            cum += row ? row.points : 0;
            return cum;
        });
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
            month: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                series: evolutionSeries
            },
            week: {
                labels: weekLabels,
                series: evolutionWeekSeries
            }
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

export function calculatePodcastDetail(showName, fullData) {
    const d = fullData.filter(e => e.isPodcast && e.episodeShowName === showName);
    if (!d.length) return null;

    const totalPlays = d.length;
    const totalMinutes = d.reduce((s, e) => s + e.durationMin, 0);
    const skipped = d.filter(e => e.skipped).length;
    const skipRate = ((skipped / totalPlays) * 100).toFixed(1);
    const uniqueEpisodes = new Set(d.map(e => e.episodeName).filter(Boolean)).size;

    const sorted = [...d].sort((a, b) => a.ts - b.ts);
    const firstPlay = sorted[0].ts;
    const lastPlay = sorted[sorted.length - 1].ts;

    const episodeMap = {};
    d.forEach(e => {
        const ep = e.episodeName || 'Unknown Episode';
        if (!episodeMap[ep]) episodeMap[ep] = { plays: 0, minutes: 0, skipped: 0 };
        episodeMap[ep].plays++;
        episodeMap[ep].minutes += e.durationMin;
        if (e.skipped) episodeMap[ep].skipped++;
    });

    const topEpisodes = Object.entries(episodeMap)
        .map(([name, v]) => ({
            name,
            plays: v.plays,
            minutes: Math.round(v.minutes),
            skipRate: +((v.skipped / v.plays) * 100).toFixed(1)
        }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 15);

    const byYear = {};
    d.forEach(e => { byYear[e.year] = (byYear[e.year] || 0) + e.durationMin; });
    const yearBreakdown = Object.entries(byYear)
        .sort((a, b) => a[0] - b[0])
        .map(([year, minutes]) => ({ year: Number(year), minutes: Math.round(minutes) }));

    const byHour = Array(24).fill(0);
    d.forEach(e => { byHour[e.hour]++; });

    const byWeekday = Array(7).fill(0);
    d.forEach(e => { byWeekday[e.weekday]++; });

    const byMonth = {};
    d.forEach(e => {
        const k = `${e.year}-${String(e.month + 1).padStart(2, '0')}`;
        byMonth[k] = (byMonth[k] || 0) + e.durationMin;
    });
    const monthlyTimeline = Object.entries(byMonth)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([m, mins]) => ({ month: m, minutes: Math.round(mins) }));

    return {
        type: 'podcast',
        name: showName,
        subtitle: `${uniqueEpisodes} episodes listened`,
        totalPlays,
        totalMinutes: Math.round(totalMinutes),
        skipRate,
        firstPlay: firstPlay.toLocaleDateString(),
        lastPlay: lastPlay.toLocaleDateString(),
        uniqueEpisodes,
        avgMinPerPlay: Math.round((totalMinutes / totalPlays) * 10) / 10,
        yearBreakdown,
        byHour,
        byWeekday,
        monthlyTimeline,
        topEpisodes
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

// ─────────────────────────────────────────────
//  LISTENING CHAINS & SESSIONS
// ─────────────────────────────────────────────

const SESSION_GAP_MS = 30 * 60 * 1000; // 30 min

export function calculateListeningSessions(data, gapMinutes = 30) {
    const gapMs = gapMinutes * 60 * 1000;
    const sorted = [...data].filter(d => !d.isPodcast && d.trackName).sort((a, b) => a.ts - b.ts);
    if (!sorted.length) return [];

    const sessions = [];
    let currentSession = { tracks: [sorted[0]], startDate: sorted[0].date, durationMin: sorted[0].durationMin };

    for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].ts - sorted[i - 1].ts;
        if (gap <= gapMs) {
            currentSession.tracks.push(sorted[i]);
            currentSession.durationMin += sorted[i].durationMin;
        } else {
            currentSession.trackCount = currentSession.tracks.length;
            sessions.push(currentSession);
            currentSession = { tracks: [sorted[i]], startDate: sorted[i].date, durationMin: sorted[i].durationMin };
        }
    }
    currentSession.trackCount = currentSession.tracks.length;
    sessions.push(currentSession);

    return sessions;
}

export function calculateListeningChains(data) {
    const sorted = [...data].filter(d => !d.isPodcast && d.trackName).sort((a, b) => a.ts - b.ts);
    if (sorted.length < 2) return { trackChains: [], artistChains: [], albumChains: [], sessions: [] };

    // Build transitions (only count within session = gap < 30 min)
    const trackTransitions = {};
    const artistTransitions = {};
    const albumTransitions = {};
    const trackFromCounts = {};
    const artistFromCounts = {};
    const albumFromCounts = {};

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const gap = curr.ts - prev.ts;
        if (gap > SESSION_GAP_MS) continue;

        // Track chains
        if (prev.trackName && curr.trackName && prev.trackName !== curr.trackName) {
            const key = `${prev.trackName}|||${prev.artistName || ''}|||${curr.trackName}|||${curr.artistName || ''}`;
            trackTransitions[key] = (trackTransitions[key] || 0) + 1;
            trackFromCounts[prev.trackName] = (trackFromCounts[prev.trackName] || 0) + 1;
        }

        // Artist chains
        if (prev.artistName && curr.artistName && prev.artistName !== curr.artistName) {
            const key = `${prev.artistName}|||${curr.artistName}`;
            artistTransitions[key] = (artistTransitions[key] || 0) + 1;
            artistFromCounts[prev.artistName] = (artistFromCounts[prev.artistName] || 0) + 1;
        }

        // Album chains
        if (prev.albumName && curr.albumName && prev.albumName !== curr.albumName) {
            const key = `${prev.albumName}|||${prev.artistName || ''}|||${curr.albumName}|||${curr.artistName || ''}`;
            albumTransitions[key] = (albumTransitions[key] || 0) + 1;
            albumFromCounts[`${prev.albumName}|||${prev.artistName || ''}`] = (albumFromCounts[`${prev.albumName}|||${prev.artistName || ''}`] || 0) + 1;
        }
    }

    const trackChains = Object.entries(trackTransitions)
        .map(([key, count]) => {
            const [from, fromArtist, to, toArtist] = key.split('|||');
            const total = trackFromCounts[from] || 1;
            return { from, fromArtist, to, toArtist, count, pct: +((count / total) * 100).toFixed(1) };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);

    const artistChains = Object.entries(artistTransitions)
        .map(([key, count]) => {
            const [from, to] = key.split('|||');
            const total = artistFromCounts[from] || 1;
            return { from, fromArtist: '', to, toArtist: '', count, pct: +((count / total) * 100).toFixed(1) };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);

    const albumChains = Object.entries(albumTransitions)
        .map(([key, count]) => {
            const [from, fromArtist, to, toArtist] = key.split('|||');
            const total = albumFromCounts[`${from}|||${fromArtist}`] || 1;
            return { from, fromArtist, to, toArtist, count, pct: +((count / total) * 100).toFixed(1) };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);

    const sessions = calculateListeningSessions(data, 30);

    return { trackChains, artistChains, albumChains, sessions };
}
