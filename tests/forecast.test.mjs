import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateWeekly, mondayKey, scoreF1, seasonalIndices, entityRhythm, discoveryPrior, simulateForecast, evaluateRanking, chooseModel, backtest, buildForecast } from '../js/forecast.js';
import { getForecastData, processSpotifyZip } from '../js/store.js';

function entry(date, artist = 'Artist', track = 'Song', minutes = 2) {
    return { ts: new Date(`${date}T12:00:00`), artistName: artist, trackName: track, durationMin: minutes, msPlayed: minutes * 60000 };
}

test('local Monday-Sunday weeks including year boundary', () => {
    assert.equal(mondayKey(new Date('2024-01-07T23:30:00')), '2024-01-01');
    assert.equal(mondayKey(new Date('2024-01-08T00:30:00')), '2024-01-08');
    assert.equal(mondayKey(new Date('2023-01-01T12:00:00')), '2022-12-26');
});

test('short skips have plays and skips, but no minutes; podcasts excluded', () => {
    const result = aggregateWeekly([entry('2024-01-01'), entry('2024-01-02', 'Artist', 'Song', 0.1), { ...entry('2024-01-03'), isPodcast: true }]);
    const row = result.weeks.get('2024-01-01').get('Artist');
    assert.equal(row.minutes, 2); assert.equal(row.plays, 2); assert.equal(row.skips, 1);
});

test('track identity includes artist and cutoff excludes future observations', () => {
    const result = aggregateWeekly([entry('2024-01-01'), entry('2024-01-02', 'Other'), entry('2024-10-02', 'Future')], { entity: 'tracks', cutoff: '2024-10-01' });
    assert.equal(result.entities.size, 2);
    assert.equal(result.lastDate, '2024-01-02');
});

test('F1 normalized mixed ranking and fastest-lap bonus', () => {
    const rows = [{ key: 'A', minutes: 100, plays: 1, bestSessionMinutes: 10 }, { key: 'B', minutes: 20, plays: 10, bestSessionMinutes: 20 }];
    const ranked = scoreF1(rows, 0);
    assert.equal(ranked[0].key, 'B'); assert.equal(ranked[0].points, 26); assert.equal(ranked[1].points, 18);
    assert.equal(scoreF1(rows, 100)[0].key, 'A');
});

function syntheticHistory() {
    const data = [];
    for (let year = 2021; year <= 2025; year++) {
        const lastMonth = year === 2025 ? 9 : 12;
        for (let month = 1; month <= lastMonth; month++) for (let day = 1; day <= 28; day += 3) {
            for (let artist = 0; artist < 12; artist++) data.push(entry(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, `Artist ${artist}`, `Song ${artist}`, (12 - artist) * (month === 12 ? 3 : 1)));
        }
    }
    return data;
}

test('monthly seasonality only uses previous years', () => {
    const data = syntheticHistory();
    const original = seasonalIndices(aggregateWeekly(data), 2025);
    const changed = seasonalIndices(aggregateWeekly([...data, entry('2025-12-01', 'Future', 'Future', 1000000)]), 2025);
    assert.deepEqual(original, changed);
    assert.ok(original[11] > original[0] * 2);
});

test('EWMA weights recent weeks and zeros out idle weeks', () => {
    const data = [entry('2025-01-06', 'Old', 'Old', 100), entry('2025-09-22', 'Recent', 'Recent', 100)];
    const aggregate = aggregateWeekly(data);
    assert.ok(entityRhythm(aggregate, 'Recent', '2025-10-01').minutes > entityRhythm(aggregate, 'Old', '2025-10-01').minutes);
});

test('short-lived track peaks decay; long-term artists keep a background floor', () => {
    const data = Array.from({ length: 40 }, (_, index) => { const date = new Date(2025, 0, 6 + index * 7); return entry(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`); });
    const rhythm = entityRhythm(aggregateWeekly(data), 'Artist', '2025-10-20');
    assert.ok(rhythm.floor > 0); assert.equal(rhythm.decayHalfLife, null);
    const peak = aggregateWeekly([entry('2025-09-01', 'Artist', 'New', 100)], { entity: 'tracks' });
    assert.equal(entityRhythm(peak, 'New|||Artist', '2025-10-01').decayHalfLife, 8);
});

test('Monte Carlo is deterministic, conserves volume and returns position probabilities', () => {
    const aggregate = aggregateWeekly(syntheticHistory(), { cutoff: '2025-10-01' });
    const options = { asOf: '2025-10-01', simulations: 40, yearsAhead: 3, seed: 42 };
    const first = simulateForecast(aggregate, options), second = simulateForecast(aggregate, options);
    assert.deepEqual(first, second);
    assert.equal(first.periods.length, 4);
    for (const period of first.periods) {
        assert.ok(period.minutes.p10 <= period.minutes.p50 && period.minutes.p50 <= period.minutes.p90);
        assert.ok(period.allMinutes.p50 >= period.minutes.p50);
        assert.ok(period.annual.every(row => row.p10 >= 0 && row.top10 >= 0 && row.top10 <= 1));
        for (let position = 0; position < 10; position++) assert.ok(Math.abs(period.annual.reduce((sum, row) => sum + row.positions[position], 0) - 1) < 1e-8);
    }
    for (let index = 1; index < first.fan.length; index++) assert.ok(first.fan[index].p50 >= first.fan[index - 1].p50);
    assert.ok(first.remainingMinutes.p10 >= 0);
});

test('F1 and plays simulations are finite, and completed year has no remaining volume', () => {
    const aggregate = aggregateWeekly(syntheticHistory(), { cutoff: '2024-12-31' });
    for (const metric of ['points', 'plays']) {
        const result = simulateForecast(aggregate, { asOf: '2024-12-31', metric, simulations: 8, yearsAhead: 1 });
        assert.equal(result.remainingMinutes.p50, 0);
        assert.ok(result.periods.every(period => period.annual.every(row => Number.isFinite(row.p50))));
    }
});

test('ranking metrics handle tied missing ranks and model must beat baseline', () => {
    const actual = ['A', 'B', 'C', 'D'];
    assert.deepEqual(evaluateRanking(actual, actual), { top3: 1, top10: 1, spearman: 1 });
    assert.ok(evaluateRanking([...actual].reverse(), actual).spearman < 0);
    const baseline = { top3: 0.5, top10: 0.5, spearman: 0 };
    assert.equal(chooseModel([{ available: true, baseline, hybrid: baseline }]).selected, 'baseline');
    assert.equal(chooseModel([{ available: true, baseline, hybrid: { top3: 0.7, top10: 0.8, spearman: 0.5 } }]).selected, 'hybrid');
    assert.equal(chooseModel([]).selected, 'baseline');
});

test('backtesting ignores data after cutoff and marks incomplete years unavailable', () => {
    const data = syntheticHistory();
    const result = backtest(data, { simulations: 10 });
    assert.equal(result.rows[2].available, false);
    const initial = result.rows[0].predictedTop10;
    const changed = backtest([...data, entry('2023-12-31', 'Future only', 'Future only', 100000)], { simulations: 10 });
    assert.deepEqual(changed.rows[0].predictedTop10, initial);
    assert.ok(result.rows[0].cutoff === '2023-10-01');
});

test('Forecast import retains short plays without changing existing dashboard filters', async () => {
    const previous = globalThis.JSZip;
    const raw = [60000, 10000].map(ms_played => ({ ts: '2025-01-01T12:00:00Z', ms_played, master_metadata_track_name: 'Song', master_metadata_album_artist_name: 'Artist' }));
    globalThis.JSZip = class { async loadAsync() { return { forEach: callback => callback('endsong_0.json', { name: 'endsong_0.json', async: async () => JSON.stringify(raw) }) }; } };
    try {
        const dashboard = await processSpotifyZip({}, { minPlayMs: 30000 });
        assert.equal(dashboard.length, 1);
        assert.equal(getForecastData().length, 2);
        const forecast = aggregateWeekly(getForecastData());
        assert.equal(forecast.weeks.get('2024-12-30').get('Artist').minutes, 1);
    } finally { globalThis.JSZip = previous; }
});

test('model selection cannot use future validation labels beyond the forecast cutoff', () => {
    const data = syntheticHistory();
    const options = { asOf: '2023-10-01', simulations: 8, yearsAhead: 0 };
    const before = buildForecast(data, options);
    const changed = buildForecast([...data, entry('2024-12-31', 'Future', 'Future', 99999)], options);
    assert.deepEqual(before, changed);
    assert.equal(before.validation.rows[0].available, false);
});

test('F1 baseline replaces, rather than double-counts, the observed partial week', () => {
    const result = buildForecast([entry('2026-12-30')], { metric: 'points', asOf: '2026-12-30', yearsAhead: 0, simulations: 4 });
    assert.equal(result.validation.selected, 'baseline');
    assert.equal(result.periods[0].annual[0].p50, 25);
    assert.equal(result.periods[0].annual[0].positions, null);
});

test('worker caches identical requests and invalidates after new data', async () => {
    const previous = globalThis.self;
    const messages = [];
    globalThis.self = { postMessage: message => messages.push(message) };
    try {
        await import('../js/forecast-worker.js');
        const send = message => globalThis.self.onmessage({ data: message });
        send({ type: 'init', data: syntheticHistory() });
        const options = { simulations: 4, yearsAhead: 0, metric: 'minutes', entity: 'artists' };
        send({ type: 'forecast', id: 1, options });
        assert.equal(messages.at(-1).cached, false);
        send({ type: 'forecast', id: 2, options });
        assert.equal(messages.at(-1).cached, true);
        assert.equal(messages.at(-1).id, 2);
        send({ type: 'init', data: [entry('2026-10-01')] });
        send({ type: 'forecast', id: 3, options });
        assert.equal(messages.at(-1).cached, false);
        assert.equal(messages.at(-1).result.asOf, '2026-10-01');
    } finally { globalThis.self = previous; }
});

test('Sunday cutoff includes the just-completed week in EWMA and volume', () => {
    const aggregate = aggregateWeekly([entry('2026-10-04', 'Artist', 'Song', 100)]);
    assert.ok(entityRhythm(aggregate, 'Artist', '2026-10-04').minutes > 0);
    assert.equal(entityRhythm(aggregate, 'Artist', '2026-10-03').minutes, 0);
    const result = simulateForecast(aggregate, { asOf: '2026-10-04', simulations: 5, yearsAhead: 0 });
    assert.ok(result.remainingMinutes.p50 > 0);
});

test('truncated initial Q4 does not create a false 100% newcomer prior', () => {
    const aggregate = aggregateWeekly([entry('2021-10-01'), entry('2021-12-31'), entry('2022-01-01')]);
    assert.equal(discoveryPrior(aggregate).years, 0);
    assert.equal(discoveryPrior(aggregate).top10Share, 0);
});

test('a persistent mid-year leader change beats the frozen-ranking baseline', () => {
    const data = [];
    for (let year = 2021; year <= 2026; year++) for (let month = 1; month <= (year === 2026 ? 9 : 12); month++) {
        data.push(entry(`${year}-${String(month).padStart(2, '0')}-28`, month <= 6 ? 'Former leader' : 'Rising leader', 'Song', month <= 6 ? 100 : 150));
    }
    const result = buildForecast(data, { asOf: '2025-10-01', simulations: 100, yearsAhead: 0 });
    assert.equal(result.validation.selected, 'hybrid');
    assert.equal(result.periods[0].annual[0].name, 'Rising leader');
    assert.ok(result.periods[0].annual[0].positions);
    assert.ok(result.validation.hybrid.spearman > result.validation.baseline.spearman);
});