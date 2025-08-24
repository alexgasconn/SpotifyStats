// js/store.js

const MIN_MS_PLAYED = 30000;

export async function processSpotifyZip(zipFile) {
    const jszip = new JSZip();
    const zip = await jszip.loadAsync(zipFile);
    
    const historyFiles = [];
    zip.forEach((relativePath, zipEntry) => {
        if (relativePath.includes('Streaming_History_Audio_') && relativePath.endsWith('.json')) {
            historyFiles.push(zipEntry);
        }
    });

    if (historyFiles.length === 0) {
        throw new Error('No "Streaming_History_Audio_....json" files found. Please ensure you exported "Extended streaming history".');
    }

    const allEntries = await Promise.all(
        historyFiles.map(file => file.async('string').then(JSON.parse))
    );
    
    const processedData = allEntries.flat().map(processEntry).filter(Boolean);
    
    return processedData.sort((a, b) => a.ts - b.ts);
}

function processEntry(entry) {
    // Los campos aquí son del formato "Extended Streaming History"
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
        hour: ts.getHours(),
        weekday: (ts.getDay() + 6) % 7, // 0=Lunes
        // --- ¡NUEVO CAMPO AÑADIDO! ---
        // Guardamos si la canción fue terminada o no.
        reasonEnd: entry.reason_end 
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
    
    // --- ¡NUEVOS CÁLCULOS! ---
    const skippedTracks = data.filter(d => d.reasonEnd !== 'trackdone').length;
    const skipRate = (skippedTracks / data.length * 100).toFixed(1);
    const diversity = (uniqueArtists / data.length * 1000).toFixed(2); // Multiplicado por 1000 para un número más legible

    return {
        totalMinutes: Math.round(totalMinutes),
        totalDays: Math.round(totalMinutes / 1440),
        uniqueTracks,
        uniqueArtists,
        minutesPerDay: Math.round(totalMinutes / activeDays) || 0,
        activeDays,
        // --- ¡NUEVAS MÉTRICAS DEVUELTAS! ---
        skipRate,
        diversity
    };
}

// El resto de funciones (calculateTopItems, calculateTemporalDistribution, etc.) están bien y no necesitan cambios.
// Las copio aquí para que tengas el archivo completo.

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
        .sort((a, b) => b[metric] - a[metric])
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