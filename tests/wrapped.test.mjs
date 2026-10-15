import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { calculateWrappedStats } from '../js/store.js';
import { esc } from '../js/utils.js';

function entry(year, month, trackName, artistName = 'Artist', durationMin = 2) {
    return {
        year, month, trackName, artistName, durationMin, albumName: 'Album',
        ts: new Date(year, month, 1, 12), date: `${year}-${String(month + 1).padStart(2, '0')}-01`,
        hour: 12, weekday: 0, timeOfDay: 'afternoon', skipped: false
    };
}

const repeat = (count, row) => Array.from({ length: count }, () => ({ ...row }));

function history() {
    return [
        ...repeat(50, entry(2024, 0, 'Previous year')),
        ...repeat(4, entry(2025, 0, 'Shared', 'Artist A')),
        ...repeat(3, entry(2025, 0, 'Shared', 'Artist B')),
        ...repeat(2, entry(2025, 0, 'Third')),
        entry(2025, 0, 'Fourth'),
        entry(2025, 1, 'February only'),
        ...repeat(10, { ...entry(2025, 0, 'Podcast'), isPodcast: true }),
        ...repeat(10, entry(2025, 0, null))
    ];
}

test('monthly top 3 use selected-year music, separate same-named songs and keep empty months', () => {
    const stats = calculateWrappedStats(2025, history());
    assert.equal(stats.monthlyTopSongs.length, 12);
    assert.deepEqual(stats.monthlyTopSongs[0].songs.map(({ name, artistName, plays }) => [name, artistName, plays]), [
        ['Shared', 'Artist A', 4], ['Shared', 'Artist B', 3], ['Third', 'Artist', 2]
    ]);
    assert.equal(stats.monthlyTopSongs[1].songs.length, 1);
    assert.equal(stats.monthlyTopSongs[1].songs[0].name, 'February only');
    assert.deepEqual(stats.monthlyTopSongs[11], { month: 'Dec', songs: [] });
    assert.equal(stats.monthlyPlays[0], 10);
    assert.equal(stats.monthlyMinutes[0], 20);
    assert.equal(stats.comparePrev.available, true);
    assert.equal(calculateWrappedStats(2026, history()), null);
});

test('monthly song ties follow the existing alphabetical ranking', () => {
    const stats = calculateWrappedStats(2025, [
        entry(2025, 0, 'Z'), entry(2025, 0, 'B'), entry(2025, 0, 'A'), entry(2025, 0, 'C')
    ]);
    assert.deepEqual(stats.monthlyTopSongs[0].songs.map(song => song.name), ['A', 'B', 'C']);
});

test('Wrapped summarizes podcast listening time and ranks the top five shows', () => {
    const podcasts = Array.from({ length: 6 }, (_, index) => ({
        ...entry(2025, 0, null, '', index + 1),
        isPodcast: true,
        episodeShowName: `Show ${index < 5 ? index + 1 : 1}`
    }));
    const stats = calculateWrappedStats(2025, [...history(), ...podcasts]);
    assert.equal(stats.podcastMinutes, 21);
    assert.deepEqual(stats.topPodcasts.map(({ name, plays }) => [name, plays]), [
        ['Show 1', 2], ['Show 2', 1], ['Show 3', 1], ['Show 4', 1], ['Show 5', 1]
    ]);
});

test('monthly volume chart has only the selected year and retains monthly tooltip counts', () => {
    const configs = [];
    class Chart {
        static register() {}
        constructor(canvas, config) { configs.push(config); }
    }
    const context = vm.createContext({ Chart, ChartDataLabels: {}, document: { getElementById: () => ({}) } });
    vm.runInContext(readFileSync(new URL('../js/charts.js', import.meta.url), 'utf8').replace(/^export /gm, ''), context);
    const stats = calculateWrappedStats(2025, history());
    context.renderWrappedMonthlyChart(stats.monthlyMinutes, 2025, stats.monthlyPlays);
    const config = configs[0];
    assert.equal(config.type, 'bar');
    assert.equal(config.data.labels.length, 12);
    assert.equal(config.data.datasets.length, 1);
    assert.equal(config.data.datasets[0].label, '2025');
    assert.deepEqual(Array.from(config.data.datasets[0].data), stats.monthlyMinutes);
    assert.equal(config.options.plugins.tooltip.callbacks.label({
        dataset: config.data.datasets[0], raw: 20, dataIndex: 0
    }), '2025: 20 min · 10 plays');
});

test('Wrapped renders all months, escaped clickable songs, and selected-year chart label', () => {
    const data = history();
    data.push(entry(2025, 1, '<Song & ">', 'Artist & "'));
    data.push({ ...entry(2025, 2, null, '', 90), isPodcast: true, episodeShowName: 'Wrapped podcast' });
    const stats = calculateWrappedStats(2025, data);
    const calls = [];
    const details = [];
    const button = { dataset: { detailName: '<Song & ">', detailType: 'track', detailExtra: 'Artist & "' }, addEventListener(type, callback) { this.click = callback; } };
    const container = { innerHTML: '', querySelectorAll: () => [button] };
    const context = vm.createContext({
        store: { calculateWrappedStats }, esc,
        charts: { renderWrappedMonthlyChart: (...args) => calls.push(args) },
        openDetail: (...args) => details.push(args),
        window: { spotifyData: { full: data } },
        document: { getElementById: id => id === 'wrapped-year-filter' ? { value: '2025' } : container }
    });
    vm.runInContext(readFileSync(new URL('../js/tabs/wrapped.js', import.meta.url), 'utf8')
        .replace(/^import .*$/gm, '').replace(/^export /gm, ''), context);
    context.renderWrappedContent();
    assert.match(container.innerHTML, /Top 3 songs each month/);
    assert.match(container.innerHTML, /Top podcasts/);
    assert.match(container.innerHTML, /1 h 30 min total/);
    assert.match(container.innerHTML, /Wrapped podcast/);
    assert.equal((container.innerHTML.match(/class="wc-month-songs"/g) || []).length, 12);
    assert.equal((container.innerHTML.match(/No songs played this month/g) || []).length, 10);
    assert.match(container.innerHTML, /aria-label="Monthly listening minutes for 2025"/);
    assert.doesNotMatch(container.innerHTML, /Monthly listening minutes for 2025 and/);
    assert.match(container.innerHTML, /&lt;Song &amp; &quot;&gt;/);
    assert.deepEqual(calls[0], [stats.monthlyMinutes, 2025, stats.monthlyPlays]);
    button.click();
    assert.deepEqual(details[0], ['<Song & ">', 'track', 'Artist & "', data]);
});
