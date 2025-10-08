// js/store.js

const MIN_MS_PLAYED = 30000;

export async function processSpotifyZip(zipFile) {
    const jszip = new JSZip();
    const zip = await jszip.loadAsync(zipFile);
    const historyFiles = [];
    zip.forEach((relativePath, zipEntry) => {
        if (
            (relativePath.includes('Streaming_History_Audio_') || relativePath.includes('Streaming_History_Video_'))
            && relativePath.endsWith('.json')
        ) {
            historyFiles.push(zipEntry);
        }

    });
    if (historyFiles.length === 0) throw new Error('No "Streaming_History_Audio_....json" files found.');
    const allEntries = await Promise.all(historyFiles.map(file => file.async('string').then(JSON.parse)));
    const processedData = allEntries.flat().map(processEntry).filter(Boolean);
    return processedData.sort((a, b) => a.ts - b.ts);
}

function processEntry(entry) {
    if (entry.ms_played < MIN_MS_PLAYED) return null;
    const ts = new Date(entry.ts);

    // Determinar si es podcast o música
    const isPodcast = entry.episode_name != null && entry.episode_show_name != null;

    return {
        ts,
        date: ts.toISOString().split('T')[0],
        // Campos de música
        trackName: entry.master_metadata_track_name,
        artistName: entry.master_metadata_album_artist_name,
        albumName: entry.master_metadata_album_album_name,
        // Campos de podcast
        episodeName: entry.episode_name,
        episodeShowName: entry.episode_show_name,
        // Indicador de tipo
        isPodcast: isPodcast,
        // Campos comunes
        msPlayed: entry.ms_played,
        durationMin: entry.ms_played / 60000,
        year: ts.getFullYear(),
        month: ts.getMonth(), // 0-11
        hour: ts.getHours(),
        weekday: (ts.getDay() + 6) % 7,
        reasonEnd: entry.reason_end,
        platform: entry.platform,
        country: entry.conn_country,
        reasonStart: entry.reason_start
    };
}

// --- FUNCIONES DE CÁLCULO DE MÉTRICAS ---

export function calculateGlobalKPIs(data) {
    if (data.length === 0) return {};
    const totalMinutes = data.reduce((sum, d) => sum + d.durationMin, 0);
    const uniqueTracks = new Set(data.map(d => d.trackName)).size;
    const uniqueArtists = new Set(data.map(d => d.artistName)).size;
    const dailyMinutes = data.reduce((acc, d) => {
        acc[d.date] = (acc[d.date] || 0) + d.durationMin;
        return acc;
    }, {});
    const activeDays = Object.keys(dailyMinutes).length;
    const skippedTracks = data.filter(d => d.reasonEnd !== 'trackdone').length;
    return {
        totalMinutes: Math.round(totalMinutes),
        totalDays: Math.round(totalMinutes / 1440),
        uniqueTracks,
        uniqueArtists,
        minutesPerDay: Math.round(totalMinutes / activeDays) || 0,
        activeDays,
        skipRate: (skippedTracks / data.length * 100).toFixed(1),
        diversity: (uniqueArtists / data.length * 1000).toFixed(2)
    };
}

export function calculateTopItems(data, key, metric = 'minutes', topN = 5) {
    const grouped = data.reduce((acc, d) => {
        const itemKey = (key === 'albumName') ? `${d.albumName} - ${d.artistName}` : d[key];
        if (!itemKey) return acc;
        if (!acc[itemKey]) acc[itemKey] = { count: 0, minutes: 0, artist: d.artistName };
        acc[itemKey].count++;
        acc[itemKey].minutes += d.durationMin;
        return acc;
    }, {});
    return Object.entries(grouped)
        .map(([name, values]) => ({ name, ...values }))
        .sort((a, b) => b[metric] - a[metric])
        .slice(0, topN)
        .map(item => ({ ...item, minutes: Math.round(item.minutes) }));
}

function getStartOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(date.setDate(diff)).toISOString().split('T')[0];
}

export function calculateAggregatedTimeline(data, unit = 'week') {
    if (!data || data.length === 0) return [];

    const aggregationMap = data.reduce((acc, d) => {
        let key;
        switch (unit) {
            case 'year':
                key = `${d.year}-01-01`;
                break;
            case 'month':
                key = d.ts.toISOString().substring(0, 7) + '-01';
                break;
            case 'week':
                key = getStartOfWeek(d.ts);
                break;
            case 'day':
            default:
                key = d.date;
                break;
        }
        acc[key] = (acc[key] || 0) + d.durationMin;
        return acc;
    }, {});

    return Object.entries(aggregationMap)
        .map(([date, minutes]) => ({ x: date, y: Math.round(minutes) }))
        .sort((a, b) => new Date(a.x) - new Date(b.x));
}

export function calculateDistribution(data, key) {
    const counts = data.reduce((acc, item) => {
        const value = item[key] || 'Unknown';
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

export function calculateDistributionPercent(data, key) {
    const total = data.length;
    if (total === 0) return [];
    const counts = data.reduce((acc, item) => {
        const value = item[key] || 'Unknown';
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
    return Object.entries(counts)
        .map(([value, count]) => ({
            value,
            percent: ((count / total) * 100).toFixed(2)
        }))
        .sort((a, b) => b.percent - a.percent);
}

// --- ¡FUNCIÓN QUE FALTABA! ---
// Esta función es necesaria para los gráficos de la pestaña "Trends"
export function calculateTemporalDistribution(data, groupBy) {
    const groups = {
        hour: Array(24).fill(0),
        weekday: Array(7).fill(0),
        month: Array(12).fill(0),
        year: {}
    };

    data.forEach(d => {
        groups.hour[d.hour]++;
        groups.weekday[d.weekday]++;
        groups.month[d.month]++;
        groups.year[d.year] = (groups.year[d.year] || 0) + d.durationMin;
    });

    if (groupBy === 'year') {
        return Object.entries(groups.year)
            .sort((a, b) => a[0] - b[0])
            .map(([year, minutes]) => ({ year, minutes: Math.round(minutes) }));
    }
    return groups[groupBy];
}
// --- FIN DE LA FUNCIÓN QUE FALTABA ---

export function calculateWrappedStats(year, fullData) {
    const yearData = fullData.filter(d => d.year === year);
    if (yearData.length === 0) return null;
    const previousData = fullData.filter(d => d.year < year);
    const uniqueTracks = new Set(yearData.map(d => d.trackName));
    const uniqueArtists = new Set(yearData.map(d => d.artistName));
    const uniqueAlbums = new Set(yearData.map(d => `${d.albumName} - ${d.artistName}`));
    const prevTracks = new Set(previousData.map(d => d.trackName));
    const prevArtists = new Set(previousData.map(d => d.artistName));
    const prevAlbums = new Set(previousData.map(d => `${d.albumName} - ${d.artistName}`));
    const isFirstYear = prevArtists.size === 0;
    const newTracks = isFirstYear ? uniqueTracks.size : [...uniqueTracks].filter(t => !prevTracks.has(t)).length;
    const newArtists = isFirstYear ? uniqueArtists.size : [...uniqueArtists].filter(a => !prevArtists.has(a)).length;
    const newAlbums = isFirstYear ? uniqueAlbums.size : [...uniqueAlbums].filter(al => !prevAlbums.has(al)).length;
    const monthlyMinutes = Array(12).fill(0);
    const skippedTracks = yearData.filter(d => d.reasonEnd !== 'trackdone').length;
    yearData.forEach(d => { monthlyMinutes[d.month] += d.durationMin; });
    return {
        totalMinutes: Math.round(yearData.reduce((sum, d) => sum + d.durationMin, 0)),
        topSong: calculateTopItems(yearData, 'trackName', 'count', 5),
        topArtist: calculateTopItems(yearData, 'artistName', 'count', 5),
        topAlbum: calculateTopItems(yearData, 'albumName', 'minutes', 5),
        monthlyMinutes: monthlyMinutes.map(m => Math.round(m)),
        uniques: { tracks: uniqueTracks.size, artists: uniqueArtists.size, albums: uniqueAlbums.size, },
        discoveries: {
            tracks: (newTracks / uniqueTracks.size * 100).toFixed(0),
            artists: (newArtists / uniqueArtists.size * 100).toFixed(0),
            albums: (newAlbums / uniqueAlbums.size * 100).toFixed(0),
        },
        skipRate: (skippedTracks / yearData.length * 100).toFixed(1)
    };
}