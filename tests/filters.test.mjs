import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { formatDate, parseDateInput } from '../js/utils.js';

const mainSource = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const decode = value => value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

class Element {
    constructor(id) {
        this.id = id;
        this.value = id.endsWith('-mode') ? 'include' : '';
        this.options = [];
        this.listeners = new Map();
        this.classList = { add() { }, remove() { }, toggle() { return false; } };
        this.scrollTop = 0;
        this.dataset = {};
    }
    addEventListener(type, callback) {
        this.listeners.set(type, callback);
    }
    setCustomValidity(message) { this.validationMessage = message; }
    reportValidity() { return !this.validationMessage; }
    fire(type) {
        return this.listeners.get(type)?.({ target: this });
    }
    get selectedOptions() {
        return this.options.filter(option => option.selected);
    }
    set innerHTML(value) {
        this.markup = value;
        this.options = [...value.matchAll(/<option value="([^"]*)"([^>]*)>(.*?)<\/option>/gs)].map(([, value, attrs, label]) => ({
            value: decode(value), label: decode(label), selected: attrs.includes(' selected'), disabled: attrs.includes(' disabled')
        }));
        this.buttons = [...value.matchAll(/<button data-key="([^"]*)"/g)].map(([, key]) => {
            const button = new Element('');
            button.dataset.key = key;
            return button;
        });
    }
    get innerHTML() {
        return this.markup || '';
    }
    querySelectorAll() {
        return this.buttons || [];
    }
}

function entry(id, country, artistName, albumName, trackName) {
    return { id, date: '2025-01-01', year: 2025, season: 'winter', platform: 'desktop', timeOfDay: 'morning', skipped: false, country, artistName, albumName, trackName };
}

const history = [
    entry(1, 'ES', 'A', 'One', 'First'),
    entry(2, 'FR', 'A', 'Two', 'Second'),
    entry(3, 'US', 'B', 'One', 'Third'),
    entry(4, 'ES', 'B', 'Two', 'Fourth'),
    { ...entry(5, 'DE', null, null, null), isPodcast: true }
];

async function dashboard(data = history) {
    const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element(id)]));
    const document = {
        getElementById: id => elements.get(id) || null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(type, callback) { if (type === 'DOMContentLoaded') callback(); }
    };
    const context = {
        document, window: {}, console, formatDate, parseDateInput,
        setTimeout: callback => callback(),
        processSpotifyZip: async () => data
    };
    for (const name of [
        'setF1Weight', 'showLoading', 'hideLoading', 'setLoadingProgress', 'renderUI', 'renderStreaksTab',
        'renderDeepDiveTab', 'renderF1Tab', 'renderExplorerTab', 'renderViewerTab', 'renderCompareTab',
        'populateWrappedFilter', 'renderWrappedContent', 'setupGame', 'openDetail', 'closeDetail',
        'renderCalendarTab', 'renderForecastTab', 'resetForecast'
    ]) context[name] = () => { };
    context.podcasts = { renderPodcastUI() { } };
    context.alert = message => { throw new Error(message); };
    vm.runInNewContext(mainSource, context);

    const get = id => elements.get(id);
    async function upload(nextData) {
        context.processSpotifyZip = async () => nextData;
        get('zip-input').files = [{}];
        await get('zip-input').fire('change');
    }
    await upload(data);
    return {
        get, upload,
        ids: () => Array.from(context.window.spotifyData.filtered, row => row.id),
        apply: () => get('apply-filter-btn').fire('click'),
        select(key, values) {
            const select = get(`${key}-filter`);
            select.options.forEach(option => { option.selected = values.includes(option.value); });
            select.fire('change');
        },
        mode(key, value) {
            get(`${key}-filter-mode`).value = value;
            get(`${key}-filter-mode`).fire('change');
        },
        search(key, query) {
            get(`${key}-filter-search`).value = query;
            get(`${key}-filter-search`).fire('input');
        },
        remove(key) {
            get('active-filter-pills').buttons.find(button => button.dataset.key === key).fire('click');
        }
    };
}

test('countries are multi-select; selection is a union retained while searching', async () => {
    assert.match(html, /id="country-filter" multiple/);
    const app = await dashboard();
    app.select('country', ['ES', 'FR']);
    app.search('country', 'ES');
    app.apply();
    assert.deepEqual(app.ids(), [1, 2, 4]);
    assert.match(app.get('country-filter-meta').textContent, /^2 selected/);
    assert.match(app.get('active-filter-pills').innerHTML, /Country: <strong>ES, FR/);
    app.remove('country');
    assert.deepEqual(app.ids(), [1, 2, 3, 4, 5]);
    assert.equal(app.get('country-filter-search').value, '');
    assert.equal(app.get('country-filter').selectedOptions.length, 0);
});

test('global date filters display and accept dd/mm/yyyy while validating impossible dates', async () => {
    const data = [
        { ...entry(1, 'ES', 'A', 'One', 'First'), date: '2025-01-02' },
        { ...entry(2, 'FR', 'A', 'Two', 'Second'), date: '2025-02-03' }
    ];
    const app = await dashboard(data);
    assert.equal(app.get('date-from').value, '02/01/2025');
    assert.equal(app.get('date-to').value, '03/02/2025');
    app.get('date-from').value = '03/02/2025';
    app.get('date-to').value = '03/02/2025';
    app.apply();
    assert.deepEqual(app.ids(), [2]);
    app.get('date-from').value = '31/02/2025';
    app.apply();
    assert.deepEqual(app.ids(), [2]);
    assert.match(app.get('date-from').validationMessage, /dd\/mm\/yyyy/);
});

for (const [key, value, included, excluded] of [
    ['artist', 'A', [1, 2], [3, 4, 5]],
    ['album', 'One', [1, 3], [2, 4, 5]],
    ['track', 'First', [1], [2, 3, 4, 5]]
]) {
    test(`${key}: include, exclude, empty exclusion and pill removal`, async () => {
        const app = await dashboard();
        app.mode(key, 'exclude');
        app.apply();
        assert.deepEqual(app.ids(), [1, 2, 3, 4, 5]);
        app.select(key, [value]);
        app.mode(key, 'include');
        app.apply();
        assert.deepEqual(app.ids(), included);
        app.mode(key, 'exclude');
        app.search(key, 'not a match');
        app.apply();
        assert.deepEqual(app.ids(), excluded);
        assert.match(app.get(`${key}-filter-meta`).textContent, /^1 excluded/);
        assert.match(app.get('active-filter-pills').innerHTML, /All except/);
        app.remove(key);
        assert.deepEqual(app.ids(), [1, 2, 3, 4, 5]);
        assert.equal(app.get(`${key}-filter-mode`).value, 'include');
        assert.equal(app.get(`${key}-filter-search`).value, '');
    });
}

test('country and independent entity modes intersect with existing filters', async () => {
    const app = await dashboard();
    app.select('country', ['ES', 'FR']);
    app.select('artist', ['A', 'B']);
    app.select('album', ['One']);
    app.mode('album', 'exclude');
    app.select('track', ['Second']);
    app.mode('track', 'exclude');
    app.apply();
    assert.deepEqual(app.ids(), [4]);
    app.get('skip-filter').value = 'skipped';
    app.apply();
    assert.deepEqual(app.ids(), []);
});

test('Reset and new uploads clear multi-selects, searches and exclusion modes', async () => {
    const app = await dashboard();
    for (const action of [() => app.get('reset-filters-btn').fire('click'), () => app.upload(history)]) {
        app.select('country', ['ES']);
        app.search('country', 'ES');
        for (const key of ['artist', 'album', 'track']) {
            app.mode(key, 'exclude');
            app.select(key, [key === 'artist' ? 'A' : key === 'album' ? 'One' : 'First']);
            app.search(key, 'not a match');
        }
        await action();
        app.apply();
        assert.deepEqual(app.ids(), [1, 2, 3, 4, 5]);
        for (const key of ['country', 'artist', 'album', 'track']) {
            assert.equal(app.get(`${key}-filter`).selectedOptions.length, 0);
            assert.equal(app.get(`${key}-filter-search`).value, '');
            if (key !== 'country') assert.equal(app.get(`${key}-filter-mode`).value, 'include');
        }
    }
});

test('entity names round-trip special characters and remain escaped in exclusion pills', async () => {
    const name = 'A & " <tag>';
    const app = await dashboard([entry(1, 'ES', name, 'One', 'First'), history[2]]);
    app.select('artist', [name]);
    app.mode('artist', 'exclude');
    app.apply();
    assert.deepEqual(app.ids(), [3]);
    assert.match(app.get('active-filter-pills').innerHTML, /All except A &amp; &quot; &lt;tag&gt;/);
});

test('country bars use a logarithmic X axis and preserve exact counts, including one play', () => {
    const configs = [];
    class Chart {
        static register() { }
        constructor(canvas, config) { configs.push(config); }
        destroy() { }
    }
    const context = vm.createContext({
        Chart, ChartDataLabels: {}, formatDate,
        document: { getElementById: () => ({}), querySelector: () => null }
    });
    const source = readFileSync(new URL('../js/charts.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '');
    vm.runInContext(source, context);
    const rows = [{ value: 'ES', count: 10000, percent: 99.99 }, { value: 'FR', count: 1, percent: 0.01 }];
    context.renderBarChart('test', rows, 'Country');
    assert.equal(configs.at(-1).options.scales.x.type, 'linear');
    context.charts = new Proxy({}, { get: (_, key) => key === 'renderBarChart' ? context.renderBarChart : () => { } });
    context.store = new Proxy({}, { get: (_, key) => () => key === 'calculateDistributionPercent' ? rows : [] });
    context.document.getElementById = id => id === 'country-chart' ? {} : null;
    vm.runInContext(readFileSync(new URL('../js/tabs/trends.js', import.meta.url), 'utf8')
        .replace(/^import .*$/gm, '').replace(/^export /gm, ''), context);
    context.renderTrends([]);
    const config = configs.at(-1);
    assert.equal(config.options.indexAxis, 'y');
    assert.equal(config.options.scales.x.type, 'logarithmic');
    assert.ok(config.options.scales.x.min > 0 && config.options.scales.x.min < 1);
    assert.deepEqual(Array.from(config.data.datasets[0].data), [10000, 1]);
    assert.equal(config.options.plugins.tooltip.callbacks.label({ raw: 1 }), '1 plays');
    context.renderBarChart('country-chart', [], 'Country', 'logarithmic');
    assert.equal(configs.at(-1).data.datasets[0].data.length, 0);
});
