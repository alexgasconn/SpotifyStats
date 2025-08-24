const MIN_MS_PLAYED = 30000; // 30 segundos

export async function processSpotifyZip(zipFile) {
    const jszip = new JSZip();
    const zip = await jszip.loadAsync(zipFile);
    
    const historyFiles = [];
    zip.forEach((relativePath, zipEntry) => {
        if (relativePath.startsWith('MyData/') && relativePath.includes('endsong_') && relativePath.endsWith('.json')) {
            historyFiles.push(zipEntry);
        }
    });

    if (historyFiles.length === 0) {
        throw new Error('No "endsong_...json" files found. Please export "Extended streaming history" from Spotify.');
    }

    const allEntries = await Promise.all(
        historyFiles.map(file => file.async('string').then(JSON.parse))
    );
    
    const processedData = allEntries.flat().map(processEntry).filter(Boolean);
    
    return processedData.sort((a, b) => a.ts - b.ts);
}

function processEntry(entry) {
    if (entry.ms_played < MIN_MS_PLAYED) return null;

    const ts = new Date(entry.ts);

    return {
        ts: ts,
        date: ts.toISOString().split('T')[0],
        trackName: entry.master_metadata_track_name,
        artistName: entry.master_metadata_album_artist_name,
        albumName: entry.master_metadata_album_album_name,
        msPlayed: entry.ms_played,
        durationMin: entry.ms_played / 60000,
        year: ts.getFullYear(),
        month: ts.getMonth(), // 0-11
        day: ts.getDate(),
        hour: ts.getHours(),
        weekday: (ts.getDay() + 6) % 7, // 0=Lunes, 6=Domingo
    };
}

// --- FUNCIONES DE CÁLCULO DE MÉTRICAS ---

export function calculateGlobalKPIs(data) {
    if (data.length === 0) return {};
    const totalMinutes = data.reduce((sum, d) => sum + d.durationMin, 0);
    const uniqueTracks = new Set(data.map(d => d.trackName)).size;
    const uniqueArtists = new Set(data.map(d => d.artistName)).size;
    const uniqueAlbums = new Set(data.map(d => `${d.albumName} - ${d.artistName}`)).size;
    const firstListen = data[0].ts;
    const lastListen = data[data.length - 1].ts;
    
    const dailyMinutes = data.reduce((acc, d) => {
        acc[d.date] = (acc[d.date] || 0) + d.durationMin;
        return acc;
    }, {});
    const mostActiveDay = Object.entries(dailyMinutes).sort((a,b) => b[1] - a[1])[0];

    return {
        totalMinutes: Math.round(totalMinutes),
        totalDays: Math.round(totalMinutes / 1440),
        uniqueTracks,
        uniqueArtists,
        uniqueAlbums,
        firstListen,
        lastListen,
        mostActiveDay: { date: mostActiveDay[0], minutes: Math.round(mostActiveDay[1]) }
    };
}

export function calculateTopItems(data, key, metric = 'minutes', topN = 5) {
    const grouped = data.reduce((acc, d) => {
        const itemKey = (key === 'albumName') ? `${d[key]} - ${d.artistName}` : d[key];
        if (!itemKey) return acc;

        if (!acc[itemKey]) {
            acc[itemKey] = { count: 0, minutes: 0, artist: d.artistName };
        }
        acc[itemKey].count++;
        acc[itemKey].minutes += d.durationMin;
        return acc;
    }, {});

    return Object.entries(grouped)
        .map(([name, values]) => ({ name, ...values }))
        .sort((a, b) => b[metric] - a[minutes])
        .slice(0, topN)
        .map(item => ({ ...item, minutes: Math.round(item.minutes) }));
}

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

export function calculateTimeline(data) {
    const dailyMinutes = data.reduce((acc, d) => {
        acc[d.date] = (acc[d.date] || 0) + d.durationMin;
        return acc;
    }, {});

    return Object.entries(dailyMinutes).map(([date, minutes]) => ({
        x: date,
        y: Math.round(minutes)
    })).sort((a, b) => new Date(a.x) - new Date(b.x));
}