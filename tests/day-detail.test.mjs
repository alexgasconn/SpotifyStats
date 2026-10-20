import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDayDetail } from '../js/store.js';

function entry(date, hour, trackName = 'Shared', artistName = 'Artist A', extra = {}) {
    return {
        date, ts: new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`),
        trackName, artistName, albumName: 'Album', durationMin: 2, skipped: false,
        ...extra
    };
}

test('day detail uses local date, aggregates music separately and sorts all listening chronologically', () => {
    const data = [
        entry('2025-01-02', 23, 'Shared', 'Artist B', { skipped: true }),
        entry('2025-01-01', 23),
        entry('2025-01-02', 0),
        entry('2025-01-02', 12, null, '', { isPodcast: true, episodeName: 'Episode', episodeShowName: 'Show', durationMin: 30 }),
        entry('2025-01-02', 1),
        entry('2025-01-03', 0)
    ];
    const originalOrder = [...data];
    const stats = calculateDayDetail('2025-01-02', data);
    assert.equal(stats.type, 'day');
    assert.equal(stats.name, '02/01/2025');
    assert.equal(stats.totalPlays, 4);
    assert.equal(stats.totalMinutes, 36);
    assert.equal(stats.skipRate, '25.0');
    assert.equal(stats.uniqueTracks, 2);
    assert.equal(stats.uniqueArtists, 2);
    assert.equal(stats.podcastPlays, 1);
    assert.equal(stats.firstPlay, '00:00');
    assert.equal(stats.lastPlay, '23:00');
    assert.equal(stats.byHour.length, 24);
    assert.equal(stats.byHour[0], 1);
    assert.equal(stats.byHour[23], 1);
    assert.equal(stats.byHour.reduce((sum, count) => sum + count, 0), 4);
    assert.deepEqual(stats.topTracks.map(({ name, artistName, plays }) => [name, artistName, plays]), [
        ['Shared', 'Artist A', 2], ['Shared', 'Artist B', 1]
    ]);
    assert.deepEqual(stats.topArtists.map(({ name, plays }) => [name, plays]), [['Artist A', 2], ['Artist B', 1]]);
    assert.equal(stats.topAlbums.length, 2);
    assert.deepEqual(stats.history.map(item => item.time), ['00:00', '01:00', '12:00', '23:00']);
    assert.equal(stats.history[2].detailName, 'Show');
    assert.equal(stats.history[2].type, 'podcast');
    assert.equal(stats.history[3].skipped, true);
    assert.deepEqual(data, originalOrder);
    assert.equal(calculateDayDetail('2025-01-04', data), null);
});

test('podcast-only days retain listening history without music rankings', () => {
    const stats = calculateDayDetail('2025-01-02', [
        entry('2025-01-02', 8, null, '', { isPodcast: true, episodeShowName: 'Show' })
    ]);
    assert.equal(stats.totalPlays, 1);
    assert.equal(stats.podcastPlays, 1);
    assert.equal(stats.uniqueTracks, 0);
    assert.deepEqual(stats.topTracks, []);
    assert.deepEqual(stats.topArtists, []);
    assert.deepEqual(stats.topAlbums, []);
});