export const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const DAY_MS = 86400000;

export function localDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDate(value) {
    return new Date(`${value}T00:00:00`);
}

function addDays(value, days) {
    const date = parseDate(value);
    date.setDate(date.getDate() + days);
    return localDate(date);
}

function dayCount(from, to) {
    const first = parseDate(from), last = parseDate(to);
    return Math.round((Date.UTC(last.getFullYear(), last.getMonth(), last.getDate()) - Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) / DAY_MS);
}

export function mondayKey(date) {
    const monday = new Date(date);
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    return localDate(monday);
}

export function scoreF1(rows, minutesWeight = 50) {
    const maxMinutes = Math.max(1, ...rows.map(row => row.minutes));
    const maxPlays = Math.max(1, ...rows.map(row => row.plays));
    const weight = Math.max(0, Math.min(100, minutesWeight)) / 100;
    const ranked = rows.map(row => ({ ...row, score: row.minutes / maxMinutes * weight + row.plays / maxPlays * (1 - weight) }))
        .filter(row => row.minutes > 0 || row.plays > 0)
        .sort((first, second) => second.score - first.score || second.minutes - first.minutes || second.plays - first.plays || first.key.localeCompare(second.key));
    const fastest = ranked.reduce((best, row) => !best || row.bestSessionMinutes > best.bestSessionMinutes ? row : best, null);
    return ranked.map((row, index) => ({ ...row, points: (F1_POINTS[index] || 0) + (index < 10 && row.key === fastest?.key ? 1 : 0) }));
}

export function aggregateWeekly(data, { entity = 'artists', cutoff = '9999-12-31', minutesWeight = 50 } = {}) {
    const weeks = new Map(), entities = new Map(), months = new Map();
    let firstDate = null, lastDate = null;
    for (const entry of data) {
        if (entry.isPodcast || !entry.trackName) continue;
        const timestamp = new Date(entry.ts);
        if (!Number.isFinite(timestamp.getTime())) continue;
        const date = localDate(timestamp);
        if (date > cutoff) continue;
        const name = entity === 'artists' ? (entry.artistName || '').trim() : entry.trackName.trim();
        if (!name) continue;
        const key = entity === 'artists' ? name : `${name}|||${(entry.artistName || '').trim()}`;
        const durationMs = Math.max(0, Number(entry.msPlayed ?? entry.durationMin * 60000) || 0);
        const minutes = durationMs >= 30000 ? durationMs / 60000 : 0;
        const skipped = durationMs < 30000 || !!entry.skipped;
        const week = mondayKey(timestamp);
        if (!weeks.has(week)) weeks.set(week, new Map());
        if (!weeks.get(week).has(key)) weeks.get(week).set(key, { key, minutes: 0, plays: 0, skips: 0, bestSessionMinutes: 0, points: 0 });
        const row = weeks.get(week).get(key);
        row.minutes += minutes;
        row.plays++;
        row.skips += Number(skipped);
        row.bestSessionMinutes = Math.max(row.bestSessionMinutes, minutes);
        if (!entities.has(key)) entities.set(key, { key, name, artist: entity === 'tracks' ? entry.artistName || '' : '', firstDate: date, lastDate: date, years: {} });
        const info = entities.get(key);
        info.firstDate = date < info.firstDate ? date : info.firstDate;
        info.lastDate = date > info.lastDate ? date : info.lastDate;
        const year = timestamp.getFullYear();
        if (!info.years[year]) info.years[year] = { minutes: 0, plays: 0, skips: 0, points: 0 };
        info.years[year].minutes += minutes;
        info.years[year].plays++;
        info.years[year].skips += Number(skipped);
        const month = date.slice(0, 7);
        const totals = months.get(month) || { minutes: 0, plays: 0, skips: 0 };
        totals.minutes += minutes; totals.plays++; totals.skips += Number(skipped);
        months.set(month, totals);
        firstDate = firstDate === null || date < firstDate ? date : firstDate;
        lastDate = lastDate === null || date > lastDate ? date : lastDate;
    }
    for (const [week, rows] of weeks) {
        for (const row of scoreF1([...rows.values()], minutesWeight)) {
            rows.get(row.key).points = row.points;
            const year = Number(week.slice(0, 4)), info = entities.get(row.key);
            if (!info.years[year]) info.years[year] = { minutes: 0, plays: 0, skips: 0, points: 0 };
            info.years[year].points += row.points;
        }
    }
    return { weeks, entities, months, firstDate, lastDate, entity, minutesWeight };
}

export function seasonalIndices(aggregate, year, metric = 'minutes') {
    const totals = Array(12).fill(0), counts = Array(12).fill(0);
    const years = [...new Set([...aggregate.months.keys()].map(month => Number(month.slice(0, 4))))].filter(previous => previous < year);
    for (const previous of years) {
        const available = [...aggregate.months.keys()].filter(month => month.startsWith(`${previous}-`));
        if (available.length < 9) continue;
        const annual = available.reduce((sum, month) => sum + aggregate.months.get(month)[metric], 0);
        const daysInYear = dayCount(`${previous}-01-01`, `${previous + 1}-01-01`);
        if (!annual) continue;
        for (let month = 0; month < 12; month++) {
            const days = new Date(previous, month + 1, 0).getDate();
            const key = `${previous}-${String(month + 1).padStart(2, '0')}`;
            totals[month] += (aggregate.months.get(key)?.[metric] || 0) / days / (annual / daysInYear);
            counts[month]++;
        }
    }
    return totals.map((total, month) => counts[month] ? Math.max(0.25, Math.min(3, total / counts[month])) : 1);
}

export function entityRhythm(aggregate, key, asOf) {
    const lastMonday = mondayKey(parseDate(addDays(asOf, 1)));
    const alpha = 1 - Math.pow(0.5, 1 / 4);
    let minutes = 0, plays = 0, variance = 0, activeWeeks = 0, peak = 0, total = 0, bestSession = 0;
    for (let offset = 104; offset >= 1; offset--) {
        const row = aggregate.weeks.get(addDays(lastMonday, -offset * 7))?.get(key);
        const value = row?.minutes || 0;
        const residual = value - minutes;
        minutes += alpha * residual;
        plays += alpha * ((row?.plays || 0) - plays);
        variance = (1 - alpha) * (variance + alpha * residual * residual);
        if (offset <= 52) {
            total += value;
            activeWeeks += Number((row?.plays || 0) > 0);
            peak = Math.max(peak, value);
            bestSession = Math.max(bestSession, row?.bestSessionMinutes || 0);
        }
    }
    const info = aggregate.entities.get(key);
    const ageWeeks = Math.max(0, dayCount(info.firstDate, asOf) / 7);
    const briefPeak = activeWeeks > 0 && activeWeeks <= 10 && peak > minutes * 1.4;
    const floor = activeWeeks >= 26 ? total / 52 * (aggregate.entity === 'artists' ? 0.35 : 0.15) : 0;
    return { minutes, plays, variance, activeWeeks, ageWeeks, peak, floor, decayHalfLife: briefPeak ? (aggregate.entity === 'tracks' ? 8 : 10) : null, bestSession };
}

export function discoveryPrior(aggregate, metric = 'minutes') {
    const lastYear = Number(aggregate.lastDate?.slice(0, 4));
    const percentages = [], successfulRates = [];
    for (let year = Number(aggregate.firstDate?.slice(0, 4)); year < lastYear; year++) {
        const availableMonths = [...aggregate.months.keys()].filter(month => month.startsWith(`${year}-`));
        if (availableMonths.length < 9) continue;
        const top = [...aggregate.entities.values()].filter(info => (info.years[year]?.[metric] || 0) > 0)
            .sort((first, second) => (second.years[year]?.[metric] || 0) - (first.years[year]?.[metric] || 0)).slice(0, 10);
        if (!top.length) continue;
        const newcomers = top.filter(info => info.firstDate >= `${year}-10-01` && info.firstDate <= `${year}-12-31`);
        percentages.push(newcomers.length / top.length);
        for (const info of newcomers) successfulRates.push((info.years[year]?.minutes || 0) / Math.max(1, dayCount(info.firstDate, `${year}-12-31`) / 7));
    }
    return { top10Share: percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : 0, years: percentages.length, weeklyMinutes: successfulRates.length ? successfulRates.reduce((sum, value) => sum + value, 0) / successfulRates.length : 0 };
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6D2B79F5;
        let value = Math.imul(state ^ state >>> 15, 1 | state);
        value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function normalSampler(random) {
    let spare = null;
    return () => {
        if (spare !== null) { const value = spare; spare = null; return value; }
        const radius = Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12)));
        const angle = 2 * Math.PI * random();
        spare = radius * Math.sin(angle);
        return radius * Math.cos(angle);
    };
}

function lognormal(normal, cv) {
    const sigma = Math.sqrt(Math.log(1 + cv * cv));
    return Math.exp(sigma * normal() - sigma * sigma / 2);
}

export function interval(values) {
    const sorted = Array.from(values).sort((first, second) => first - second);
    const percentile = fraction => {
        const index = (sorted.length - 1) * fraction, lower = Math.floor(index);
        return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
    };
    return sorted.length ? { p10: percentile(0.1), p50: percentile(0.5), p90: percentile(0.9) } : { p10: 0, p50: 0, p90: 0 };
}

function observed(info, metric, year = null) {
    return year === null ? Object.values(info.years).reduce((sum, totals) => sum + totals[metric], 0) : info.years[year]?.[metric] || 0;
}

function topObserved(aggregate, metric, year = null) {
    return [...aggregate.entities.values()].filter(info => observed(info, metric, year) > 0)
        .sort((first, second) => observed(second, metric, year) - observed(first, metric, year) || first.key.localeCompare(second.key));
}

function futureIntervals(asOf, finalYear) {
    const result = [];
    let start = addDays(asOf, 1);
    while (start <= `${finalYear}-12-31`) {
        const monday = mondayKey(parseDate(start));
        const sunday = addDays(monday, 6);
        const yearEnd = `${start.slice(0, 4)}-12-31`;
        const end = sunday < yearEnd ? sunday : yearEnd;
        result.push({ start, end, monday, year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) - 1, fraction: (dayCount(start, end) + 1) / 7 });
        start = addDays(end, 1);
    }
    return result;
}

export function simulateForecast(aggregate, { asOf = aggregate.lastDate, metric = 'minutes', simulations = 5000, yearsAhead = 3, seed = 1729, candidateLimit = 80, entityKey = null, onProgress = null } = {}) {
    if (!aggregate.lastDate) return null;
    if (!['minutes', 'plays', 'points'].includes(metric)) throw new Error('Unknown forecast metric');
    if (!Number.isInteger(simulations) || simulations < 1) throw new Error('Invalid simulation count');
    const year = Number(asOf.slice(0, 4));
    const rhythms = new Map([...aggregate.entities.keys()].map(key => [key, entityRhythm(aggregate, key, asOf)]));
    const selected = new Set();
    if (entityKey && aggregate.entities.has(entityKey)) selected.add(entityKey);
    for (const list of [topObserved(aggregate, metric, year).slice(0, 20), topObserved(aggregate, metric).slice(0, 20)]) for (const info of list) selected.add(info.key);
    const recent = [...aggregate.entities.values()].sort((first, second) => rhythms.get(second.key)[metric === 'plays' ? 'plays' : 'minutes'] - rhythms.get(first.key)[metric === 'plays' ? 'plays' : 'minutes']);
    for (const info of recent) { if (selected.size >= candidateLimit) break; selected.add(info.key); }
    const candidates = [...selected].map(key => ({ ...aggregate.entities.get(key), rhythm: rhythms.get(key), unknown: false }));
    const prior = discoveryPrior(aggregate, metric);
    const typicalRate = candidates.slice(0, 10).reduce((sum, info) => sum + info.rhythm.minutes, 0) / Math.max(1, Math.min(10, candidates.length));
    for (let futureYear = year; futureYear <= year + yearsAhead; futureYear++) {
        for (let slot = 0; slot < 10; slot++) candidates.push({ key: `__new_${futureYear}_${slot}`, name: `Undiscovered ${aggregate.entity === 'artists' ? 'artist' : 'song'} ${futureYear} #${slot + 1}`, artist: '', years: {}, firstDate: asOf, unknown: true, arrivalYear: futureYear, rhythm: { minutes: prior.weeklyMinutes || typicalRate, plays: (prior.weeklyMinutes || typicalRate) / 3, variance: typicalRate ** 2, floor: 0, decayHalfLife: aggregate.entity === 'tracks' ? 8 : null, bestSession: 3 } });
    }
    const count = candidates.length;
    const targetIndex = candidates.findIndex(info => info.key === entityKey);
    const steps = futureIntervals(asOf, year + yearsAhead);
    const minuteSeason = seasonalIndices(aggregate, year), playSeason = seasonalIndices(aggregate, year, 'plays');
    const lastMonday = mondayKey(parseDate(addDays(asOf, 1)));
    const recentTotals = Array.from({ length: 8 }, (_, index) => {
        const rows = [...(aggregate.weeks.get(addDays(lastMonday, -(index + 1) * 7))?.values() || [])];
        return { minutes: rows.reduce((sum, row) => sum + row.minutes, 0), plays: rows.reduce((sum, row) => sum + row.plays, 0) };
    });
    const meanMinutes = recentTotals.reduce((sum, row) => sum + row.minutes, 0) / 8;
    const meanPlays = recentTotals.reduce((sum, row) => sum + row.plays, 0) / 8;
    const volumeVariance = recentTotals.reduce((sum, row) => sum + (row.minutes - meanMinutes) ** 2, 0) / 8;
    const volumeCV = Math.max(0.15, Math.min(1.5, Math.sqrt(volumeVariance) / Math.max(1, meanMinutes)));
    const excludedKeys = [...aggregate.entities.keys()].filter(key => !selected.has(key));
    const tailMinutes = excludedKeys.reduce((sum, key) => sum + rhythms.get(key).minutes, 0);
    const tailPlays = excludedKeys.reduce((sum, key) => sum + rhythms.get(key).plays, 0);
    const periods = Array.from({ length: yearsAhead + 1 }, (_, offset) => ({
        year: year + offset,
        annual: candidates.map(() => new Float32Array(simulations)),
        allTime: candidates.map(() => new Float32Array(simulations)),
        annualPositions: candidates.map(() => new Uint32Array(10)),
        allTimePositions: candidates.map(() => new Uint32Array(10)),
        minutes: new Float64Array(simulations), plays: new Float64Array(simulations), allMinutes: new Float64Array(simulations), allPlays: new Float64Array(simulations)
    }));
    const fanMonths = [...new Set(steps.map(step => step.end.slice(0, 7)))];
    const fanSamples = fanMonths.map(() => new Float64Array(simulations));
    const fanAnnualSamples = fanMonths.map(() => new Float64Array(simulations));
    const playSamples = fanMonths.map(() => new Float64Array(simulations));
    const annualPlaySamples = fanMonths.map(() => new Float64Array(simulations));
    const targetPlaySamples = targetIndex >= 0 ? fanMonths.map(() => new Float64Array(simulations)) : [];
    const targetAnnualPlaySamples = targetIndex >= 0 ? fanMonths.map(() => new Float64Array(simulations)) : [];
    const initialMinutes = [...aggregate.months.values()].reduce((sum, month) => sum + month.minutes, 0);
    const initialPlays = [...aggregate.months.values()].reduce((sum, month) => sum + month.plays, 0);
    const observedYearMinutes = [...aggregate.months.entries()].filter(([month]) => month.startsWith(`${year}-`)).reduce((sum, [, month]) => sum + month.minutes, 0);
    const observedYearPlays = [...aggregate.months.entries()].filter(([month]) => month.startsWith(`${year}-`)).reduce((sum, [, month]) => sum + month.plays, 0);
    const random = seededRandom(seed), normal = normalSampler(random);
    const order = Array.from({ length: count }, (_, index) => index);
    const rawMinutes = new Float64Array(count), rawPlays = new Float64Array(count), scores = new Float64Array(count), weeklyPoints = new Float64Array(count);
    const record = (period, run, annual, cumulative, annualMinutes, annualPlays, cumulativeMinutes, cumulativePlays) => {
        period.minutes[run] = annualMinutes; period.plays[run] = annualPlays;
        period.allMinutes[run] = cumulativeMinutes; period.allPlays[run] = cumulativePlays;
        for (let index = 0; index < count; index++) { period.annual[index][run] = annual[index]; period.allTime[index][run] = cumulative[index]; }
        for (const [values, positions] of [[annual, period.annualPositions], [cumulative, period.allTimePositions]]) {
            order.sort((first, second) => values[second] - values[first] || candidates[first].key.localeCompare(candidates[second].key));
            order.slice(0, 10).forEach((index, position) => { if (values[index] > 0) positions[index][position]++; });
        }
    };
    for (let run = 0; run < simulations; run++) {
        let periodIndex = 0;
        let annual = Float64Array.from(candidates, info => observed(info, metric, year));
        const cumulative = Float64Array.from(candidates, info => observed(info, metric));
        let annualMinutes = observedYearMinutes, annualPlays = observedYearPlays, cumulativeMinutes = initialMinutes, cumulativePlays = initialPlays;
        const persistentScale = Float64Array.from(candidates, () => lognormal(normal, 0.35));
        const spikes = new Float64Array(count);
        const arrival = candidates.map(info => {
            if (!info.unknown) return Infinity;
            const quarterStart = `${info.arrivalYear}-10-01`;
            const firstPossible = info.arrivalYear === year && asOf > quarterStart ? asOf : quarterStart;
            const availableFraction = Math.max(0, dayCount(firstPossible, `${info.arrivalYear}-12-31`) / 91);
            if (random() >= prior.top10Share * Math.min(1, availableFraction)) return Infinity;
            return dayCount(asOf, firstPossible) / 7 + random() * Math.max(1, dayCount(firstPossible, `${info.arrivalYear}-12-31`) / 7);
        });
        const annualShock = Array.from({ length: yearsAhead + 1 }, (_, offset) => lognormal(normal, 0.12 + offset * 0.12));
        let previousMonday = '', previousAwards = new Float64Array(count), weekMinutes = new Float64Array(count), weekPlays = new Float64Array(count);
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
            const step = steps[stepIndex];
            if (step.year !== periods[periodIndex].year) {
                record(periods[periodIndex], run, annual, cumulative, annualMinutes, annualPlays, cumulativeMinutes, cumulativePlays);
                periodIndex++; annual = new Float64Array(count); annualMinutes = 0; annualPlays = 0;
            }
            const elapsed = dayCount(asOf, step.start) / 7;
            const volumeNoise = lognormal(normal, volumeCV) * annualShock[periodIndex];
            const projectedMinutes = meanMinutes * minuteSeason[step.month] * step.fraction * volumeNoise;
            const projectedPlays = meanPlays * playSeason[step.month] * step.fraction * volumeNoise;
            let minuteSum = tailMinutes * step.fraction, playSum = tailPlays * step.fraction;
            for (let index = 0; index < count; index++) {
                const info = candidates[index], rhythm = info.rhythm;
                const age = info.unknown ? elapsed - arrival[index] : elapsed;
                if (age < 0) { rawMinutes[index] = 0; rawPlays[index] = 0; continue; }
                const decay = rhythm.decayHalfLife ? Math.pow(0.5, age / rhythm.decayHalfLife) : 1;
                spikes[index] *= 0.65;
                if (random() < 0.015 && rhythm.minutes > 0) spikes[index] = 2 + random() * 3;
                const cv = Math.min(2, Math.max(0.25, Math.sqrt(rhythm.variance) / Math.max(1, rhythm.minutes)));
                const noise = lognormal(normal, cv) * persistentScale[index] * (1 + spikes[index]);
                const rate = rhythm.floor + Math.max(0, rhythm.minutes - rhythm.floor) * decay;
                rawMinutes[index] = rate * noise * step.fraction;
                rawPlays[index] = rhythm.plays * decay * noise * step.fraction;
                minuteSum += rawMinutes[index]; playSum += rawPlays[index];
            }
            const minuteScale = projectedMinutes / Math.max(1e-9, minuteSum), playScale = projectedPlays / Math.max(1e-9, playSum);
            if (metric === 'points' && step.monday !== previousMonday) {
                previousMonday = step.monday;
                const actualWeek = aggregate.weeks.get(step.monday);
                weekMinutes = Float64Array.from(candidates, info => actualWeek?.get(info.key)?.minutes || 0);
                weekPlays = Float64Array.from(candidates, info => actualWeek?.get(info.key)?.plays || 0);
                previousAwards = Float64Array.from(candidates, info => actualWeek?.get(info.key)?.points || 0);
            }
            for (let index = 0; index < count; index++) {
                rawMinutes[index] *= minuteScale; rawPlays[index] *= playScale;
                if (metric === 'points') { weekMinutes[index] += rawMinutes[index]; weekPlays[index] += rawPlays[index]; }
                else {
                    const value = metric === 'minutes' ? rawMinutes[index] : rawPlays[index];
                    annual[index] += value; cumulative[index] += value;
                }
            }
            if (metric === 'points') {
                const maxMinutes = Math.max(1, ...weekMinutes), maxPlays = Math.max(1, ...weekPlays);
                const weight = aggregate.minutesWeight / 100;
                let fastest = -1, fastestMinutes = -1;
                for (let index = 0; index < count; index++) {
                    scores[index] = weekMinutes[index] / maxMinutes * weight + weekPlays[index] / maxPlays * (1 - weight);
                    const session = Math.min(weekMinutes[index], candidates[index].rhythm.bestSession || 3);
                    if (session > fastestMinutes) { fastest = index; fastestMinutes = session; }
                }
                order.sort((first, second) => scores[second] - scores[first] || weekMinutes[second] - weekMinutes[first] || weekPlays[second] - weekPlays[first] || candidates[first].key.localeCompare(candidates[second].key));
                weeklyPoints.fill(0);
                order.slice(0, 10).forEach((index, position) => { if (weekPlays[index] > 0) weeklyPoints[index] = F1_POINTS[position] + Number(index === fastest); });
                const scoringYear = Number(step.monday.slice(0, 4));
                for (let index = 0; index < count; index++) {
                    const delta = weeklyPoints[index] - previousAwards[index];
                    cumulative[index] += delta;
                    if (scoringYear === step.year) annual[index] += delta;
                    previousAwards[index] = weeklyPoints[index];
                }
            }
            annualMinutes += projectedMinutes; annualPlays += projectedPlays;
            cumulativeMinutes += projectedMinutes; cumulativePlays += projectedPlays;
            if (stepIndex === steps.length - 1 || steps[stepIndex + 1].end.slice(0, 7) !== step.end.slice(0, 7)) {
                const monthIndex = fanMonths.indexOf(step.end.slice(0, 7));
                fanSamples[monthIndex][run] = cumulativeMinutes;
                fanAnnualSamples[monthIndex][run] = annualMinutes;
                playSamples[monthIndex][run] = cumulativePlays;
                annualPlaySamples[monthIndex][run] = annualPlays;
                if (targetIndex >= 0 && metric === 'plays') {
                    targetPlaySamples[monthIndex][run] = cumulative[targetIndex];
                    targetAnnualPlaySamples[monthIndex][run] = annual[targetIndex];
                }
            }
        }
        record(periods[periodIndex], run, annual, cumulative, annualMinutes, annualPlays, cumulativeMinutes, cumulativePlays);
        if (run % 100 === 0) onProgress?.(run / simulations);
    }
    const summarize = (samples, positions) => candidates.map((info, index) => ({ key: info.key, name: info.name, artist: info.artist, unknown: info.unknown, observed: observed(info, metric), ...interval(samples[index]), positions: Array.from(positions[index], countAtPosition => countAtPosition / simulations), top10: positions[index].reduce((sum, value) => sum + value, 0) / simulations })).sort((first, second) => second.p50 - first.p50 || second.top10 - first.top10 || first.key.localeCompare(second.key));
    const resultPeriods = periods.map(period => ({
        year: period.year,
        annual: summarize(period.annual, period.annualPositions), allTime: summarize(period.allTime, period.allTimePositions),
        minutes: interval(period.minutes), plays: interval(period.plays), allMinutes: interval(period.allMinutes), allPlays: interval(period.allPlays)
    }));
    const playHistory = [...aggregate.months.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([month, totals]) => ({ month, plays: totals.plays }));
    const playFan = [{ date: asOf, allTime: initialPlays, annual: observedYearPlays }, ...playSamples.map((samples, index) => ({ date: `${fanMonths[index]}-${new Date(Number(fanMonths[index].slice(0, 4)), Number(fanMonths[index].slice(5, 7)), 0).getDate()}`, allTime: interval(samples).p50, annual: interval(annualPlaySamples[index]).p50 }))];
    const entityPlayFan = targetIndex >= 0 && metric === 'plays' ? [{ date: asOf, allTime: observed(candidates[targetIndex], 'plays'), annual: observed(candidates[targetIndex], 'plays', year) }, ...targetPlaySamples.map((samples, index) => ({ date: playFan[index + 1].date, allTime: interval(samples).p50, annual: interval(targetAnnualPlaySamples[index]).p50 }))] : null;
    onProgress?.(1);
    return { entityPlayFan, playHistory, playFan, asOf, metric, entity: aggregate.entity, minutesWeight: aggregate.minutesWeight, simulations, periods: resultPeriods, fan: [{ date: asOf, p10: initialMinutes, p50: initialMinutes, p90: initialMinutes, annual: { p10: observedYearMinutes, p50: observedYearMinutes, p90: observedYearMinutes } }, ...fanSamples.map((samples, index) => ({ date: `${fanMonths[index]}-${new Date(Number(fanMonths[index].slice(0, 4)), Number(fanMonths[index].slice(5, 7)), 0).getDate()}`, ...interval(samples), annual: interval(fanAnnualSamples[index]) }))], remainingMinutes: { p10: resultPeriods[0].minutes.p10 - observedYearMinutes, p50: resultPeriods[0].minutes.p50 - observedYearMinutes, p90: resultPeriods[0].minutes.p90 - observedYearMinutes }, currentYearMinutes: observedYearMinutes, allTimeMinutes: initialMinutes, discoveryPrior: prior, candidateCount: selected.size, knownEntities: aggregate.entities.size, baselineAnnual: topObserved(aggregate, metric, year).map(info => info.key), baselineAllTime: topObserved(aggregate, metric).map(info => info.key) };
}

export function buildEntityForecast(data, { entity = 'artists', entityKey, ...options } = {}) {
    const matching = data.filter(entry => {
        const key = entity === 'artists' ? (entry.artistName || '').trim() : `${(entry.trackName || '').trim()}|||${(entry.artistName || '').trim()}`;
        return key === entityKey;
    });
    const history = aggregateWeekly(matching, { entity, cutoff: options.asOf || localDate(new Date()) });
    if (!history.entities.has(entityKey)) return null;
    const result = buildForecast(data, { ...options, entity, entityKey, metric: 'plays' });
    if (!result) return null;
    const year = Number(result.asOf.slice(0, 4));
    const allTime = [...history.months.values()].reduce((sum, month) => sum + month.plays, 0);
    const annual = [...history.months.entries()].filter(([month]) => month.startsWith(`${year}-`)).reduce((sum, [, month]) => sum + month.plays, 0);
    const share = result.playFan[0].annual ? annual / result.playFan[0].annual : 0;
    const playFan = result.validation.selected === 'hybrid' ? result.entityPlayFan : result.playFan.map(point => ({
        date: point.date,
        allTime: allTime + Math.max(0, point.allTime - result.playFan[0].allTime) * share,
        annual: Number(point.date.slice(0, 4)) === year ? annual + Math.max(0, point.annual - result.playFan[0].annual) * share : point.annual * share
    }));
    return { asOf: result.asOf, entity, entityKey, simulations: result.simulations, validation: { selected: result.validation.selected, reason: result.validation.reason }, periods: result.periods.map(period => ({ year: period.year })), playHistory: [...history.months.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([month, totals]) => ({ month, plays: totals.plays })), playFan };
}

export function forecastPlaySeries(result, { year = result.periods[0].year, scope = 'annual', cumulative = true } = {}) {
    const history = new Map(result.playHistory.map(row => [row.month, row.plays]));
    const firstMonth = scope === 'allTime' ? result.playHistory[0]?.month : `${year}-01`;
    const cutoffMonth = result.asOf.slice(0, 7);
    const endMonth = `${year}-12`;
    const points = [];
    let running = 0;
    if (firstMonth) {
        let month = firstMonth;
        while (month <= cutoffMonth && month <= endMonth) {
            const plays = history.get(month) || 0;
            running += plays;
            const monthEnd = `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()}`;
            points.push({ date: month === cutoffMonth ? result.asOf : monthEnd, actual: cumulative ? running : plays, predicted: null });
            const next = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1);
            month = localDate(next).slice(0, 7);
        }
    }
    let previous = result.playFan[0];
    const projected = [];
    for (const point of result.playFan.slice(1)) {
        const month = point.date.slice(0, 7);
        const monthly = point.allTime - previous.allTime + (month === cutoffMonth ? history.get(month) || 0 : 0);
        previous = point;
        if (Number(point.date.slice(0, 4)) > year || (scope === 'annual' && Number(point.date.slice(0, 4)) !== year)) continue;
        projected.push({ date: point.date, actual: null, predicted: cumulative ? point[scope] : Math.max(0, monthly) });
    }
    if (projected.length) {
        if (points.length) points[points.length - 1].predicted = points[points.length - 1].actual;
        else if (cumulative && scope === 'annual') points.push({ date: `${year}-01-01`, actual: null, predicted: 0 });
    }
    points.push(...projected);
    return { dates: points.map(point => point.date), actual: points.map(point => point.actual), predicted: points.map(point => point.predicted) };
}

export function evaluateRanking(predicted, actual) {
    const top3 = actual.slice(0, 3), top10 = actual.slice(0, 10);
    const overlap = (first, second) => first.filter(key => second.includes(key)).length / Math.max(1, second.length);
    const predictedTop = predicted.slice(0, 10);
    const union = [...new Set([...predictedTop, ...top10])];
    const rank = (list, key) => list.includes(key) ? list.indexOf(key) + 1 : (list.length + 1 + union.length) / 2;
    const first = union.map(key => rank(predictedTop, key)), second = union.map(key => rank(top10, key));
    const mean = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const firstMean = mean(first), secondMean = mean(second);
    const covariance = first.reduce((sum, value, index) => sum + (value - firstMean) * (second[index] - secondMean), 0);
    const denominator = Math.sqrt(first.reduce((sum, value) => sum + (value - firstMean) ** 2, 0) * second.reduce((sum, value) => sum + (value - secondMean) ** 2, 0));
    return { top3: overlap(predicted.slice(0, 3), top3), top10: overlap(predictedTop, top10), spearman: denominator ? covariance / denominator : predictedTop.join('|') === top10.join('|') ? 1 : 0 };
}

export function chooseModel(rows) {
    const available = rows.filter(row => row.available);
    if (!available.length) return { selected: 'baseline', reason: 'No complete backtesting years available.' };
    const average = source => Object.fromEntries(['top3', 'top10', 'spearman'].map(key => [key, available.reduce((sum, row) => sum + row[source][key], 0) / available.length]));
    const hybrid = average('hybrid'), baseline = average('baseline');
    const score = result => result.top3 * 0.25 + result.top10 * 0.5 + (result.spearman + 1) * 0.125;
    const improves = hybrid.top3 >= baseline.top3 - 1e-9 && hybrid.top10 >= baseline.top10 - 1e-9 && score(hybrid) > score(baseline) + 1e-9;
    return { selected: improves ? 'hybrid' : 'baseline', reason: improves ? 'Hybrid improves aggregate validation without reducing top-3 or top-10 accuracy.' : 'Hybrid does not improve the validated baseline.', hybrid, baseline };
}

export function backtest(data, { entity = 'artists', metric = 'minutes', simulations = 5000, minutesWeight = 50, years = [2023, 2024, 2025], onProgress = null } = {}) {
    const complete = aggregateWeekly(data, { entity, minutesWeight });
    const rows = [];
    for (const year of years) {
        const cutoff = `${year}-10-01`;
        if (!complete.lastDate || complete.lastDate < `${year}-12-31` || complete.firstDate > `${year}-01-01`) {
            rows.push({ year, available: false, reason: 'Incomplete year or missing January-October history.' }); continue;
        }
        const training = aggregateWeekly(data, { entity, cutoff, minutesWeight });
        const actual = aggregateWeekly(data, { entity, cutoff: `${year}-12-31`, minutesWeight });
        if (!training.lastDate || !topObserved(actual, metric, year).length) { rows.push({ year, available: false, reason: 'Insufficient observations.' }); continue; }
        onProgress?.(`Backtesting ${year}`);
        const prediction = simulateForecast(training, { asOf: cutoff, metric, simulations, yearsAhead: 0, seed: year });
        const predicted = prediction.periods[0].annual.filter(row => row.p50 > 0).map(row => row.key);
        const actualRanking = topObserved(actual, metric, year).map(info => info.key);
        const baselineRanking = topObserved(training, metric, year).map(info => info.key);
        rows.push({ year, available: true, cutoff, hybrid: evaluateRanking(predicted, actualRanking), baseline: evaluateRanking(baselineRanking, actualRanking), predictedTop10: predicted.slice(0, 10), actualTop10: actualRanking.slice(0, 10), baselineTop10: baselineRanking.slice(0, 10) });
    }
    return { rows, ...chooseModel(rows) };
}

export function buildForecast(data, options = {}) {
    const { entity = 'artists', metric = 'minutes', simulations = 5000, minutesWeight = 50, onProgress = null } = options;
    const cutoff = options.asOf || localDate(new Date());
    const knownData = data.filter(entry => {
        const timestamp = new Date(entry.ts);
        return Number.isFinite(timestamp.getTime()) && localDate(timestamp) <= cutoff;
    });
    const aggregate = aggregateWeekly(knownData, { entity, minutesWeight, cutoff });
    if (!aggregate.lastDate) return null;
    const validation = backtest(knownData, { entity, metric, simulations, minutesWeight, onProgress: status => onProgress?.({ status }) });
    const result = simulateForecast(aggregate, { ...options, asOf: options.asOf || aggregate.lastDate, onProgress: fraction => onProgress?.({ status: 'Monte Carlo', fraction }) });
    if (validation.selected === 'baseline') {
        for (const period of result.periods) for (const [scope, keys] of [['annual', result.baselineAnnual], ['allTime', result.baselineAllTime]]) {
            const rows = new Map(period[scope].map(row => [row.key, row]));
            const year = Number(result.asOf.slice(0, 4));
            const totals = [...aggregate.entities.values()].reduce((sum, info) => sum + observed(info, metric, year), 0);
            const allObserved = [...aggregate.entities.values()].reduce((sum, info) => sum + observed(info, metric), 0);
            const observedTotal = scope === 'annual' ? (period.year === year ? totals : 0) : allObserved;
            const volume = metric === 'minutes' ? (scope === 'annual' ? period.minutes : period.allMinutes) : (scope === 'annual' ? period.plays : period.allPlays);
            const weeks = new Set(futureIntervals(result.asOf, period.year).filter(step => scope === 'allTime' || Number(step.monday.slice(0, 4)) === period.year).map(step => step.monday));
            period[scope] = keys.map(key => rows.get(key)).filter(Boolean).map((row, index) => {
                const info = aggregate.entities.get(row.key);
                const before = scope === 'annual' ? observed(info, metric, period.year) : observed(info, metric);
                const share = totals ? observed(info, metric, year) / totals : 0;
                const partialMonday = mondayKey(parseDate(result.asOf));
                const partialPoints = weeks.has(partialMonday) ? aggregate.weeks.get(partialMonday)?.get(row.key)?.points || 0 : 0;
                const values = Object.fromEntries(['p10', 'p50', 'p90'].map(percentile => [percentile, metric === 'points' ? before + (F1_POINTS[index] || 0) * weeks.size - partialPoints : before + Math.max(0, volume[percentile] - observedTotal) * share]));
                return { ...row, ...values, top10: null, positions: null };
            });
        }
    }
    return { ...result, validation };
}