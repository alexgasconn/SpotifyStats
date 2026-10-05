import { buildForecast, buildEntityForecast } from './forecast.js';

let data = [];
const cache = new Map();

self.onmessage = event => {
    const { type, id, options } = event.data;
    if (type === 'init') { data = event.data.data; cache.clear(); return; }
    if (type !== 'forecast' && type !== 'entityForecast') return;
    try {
        const key = JSON.stringify([type, options]);
        if (cache.has(key)) { self.postMessage({ type: 'result', id, result: cache.get(key), cached: true }); return; }
        const build = type === 'entityForecast' ? buildEntityForecast : buildForecast;
        const result = build(data, { ...options, onProgress: progress => self.postMessage({ type: 'progress', id, ...progress }) });
        cache.set(key, result);
        self.postMessage({ type: 'result', id, result, cached: false });
    } catch (error) { self.postMessage({ type: 'error', id, message: error.message }); }
};