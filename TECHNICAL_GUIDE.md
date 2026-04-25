# Spotify Stats Analyzer - Technical Guide

This document is for contributors and maintainers. It explains engineering internals, code contracts, extension patterns, and safe evolution practices.

## Contents

1. Engineering goals
2. Runtime architecture
3. End-to-end lifecycle
4. Core data contracts
5. Store layer function contracts
6. Tab module contracts
7. Chart layer conventions
8. Filter pipeline and state mechanics
9. Detail modal integration contract
10. Adding a new metric safely
11. Adding a new tab safely
12. Testing strategy and fixtures
13. Regression checklist
14. Performance and scalability guidance
15. Reliability and edge-case handling
16. Security and privacy posture
17. Coding standards and contribution guidelines
18. Release and maintenance workflow

---

## 1) Engineering goals

Primary goals of this codebase:

- Process large Spotify history exports entirely client-side.
- Keep analytics deterministic, reproducible, and filter-aware.
- Separate computation from presentation.
- Allow advanced analytics (sequence/session/ranking) without backend dependencies.

Guiding principles:

- Put business logic in the store layer.
- Keep tab files focused on rendering and user interactions.
- Ensure every metric is resilient to sparse/partial data.

---

## 2) Runtime architecture

Main runtime components:

- Shell and layout: [index.html](index.html)
- App bootstrap and orchestration: [js/main.js](js/main.js)
- Analytics engine: [js/store.js](js/store.js)
- Chart render helpers: [js/charts.js](js/charts.js)
- UI composition entrypoint: [js/ui.js](js/ui.js)
- Drill-down modal: [js/detail.js](js/detail.js)
- Tab renderers: [js/tabs](js/tabs)

Architecture boundaries:

- Store layer has no DOM dependencies.
- Tab layer should avoid raw heavy computation when store already provides it.
- Chart helpers own Chart.js instance lifecycle.

---

## 3) End-to-end lifecycle

### 3.1 Upload and parse

Trigger path starts in [js/main.js](js/main.js) from upload actions.

- Read user config from settings panel.
- Call processSpotifyZip from store.
- Receive canonical normalized event array.

### 3.2 Canonical state creation

Main state object:

- window.spotifyData.full
- window.spotifyData.filtered

full holds parsed + transformed timeline sorted by ts.

### 3.3 Filtered projection

Apply global filters in main layer to produce filtered projection.

### 3.4 Render passes

- Base render: overview, trends, wrapped.
- Lazy render for heavy tabs when activated.

### 3.5 Drill-down

Click events pass identity into detail module.
Detail module asks store for per-entity stats and renders modal charts.

---

## 4) Core data contracts

### 4.1 Canonical normalized event shape

Core fields expected across modules:

- ts: Date
- date: local YYYY-MM-DD string
- trackName, artistName, albumName
- episodeName, episodeShowName
- isPodcast
- msPlayed, durationMin
- year, month, hour, weekday
- reasonStart, reasonEnd
- platform, country
- season, timeOfDay
- skipped

### 4.2 Invariants

- ts must be valid Date.
- date is derived in local timezone.
- weekday uses Monday=0 convention.
- arrays passed to timeline functions should already be sorted where sequence matters.

### 4.3 Local date rule

Use local-date formatting for day keys.
Do not use ISO UTC day keys for local-day analytics.

---

## 5) Store layer function contracts

All core computation lives in [js/store.js](js/store.js).

### 5.1 Ingestion

- processSpotifyZip(zipFile, config, onProgress)
  - Input: File object + config
  - Output: sorted normalized events
  - Throws: malformed archive / parse errors / missing history JSON

### 5.2 KPI and top entities

- calculateGlobalKPIs(data)
- calculateTopItems(data, key, metric, topN)

Top items supports scoring by plays, minutes, and F1 points.

### 5.3 Temporal analytics

- calculateAggregatedTimeline(data, unit)
- calculateSkipRateTrend(data, unit)
- calculateTemporalDistribution(data, groupBy)
- calculateSeasonDistribution(data)
- calculateDistributionPercent(data, key)
- calculateWeekdayHourMatrix(data)

### 5.4 Streak analytics

- calculateListeningStreaks(data)
- calculateArtistDailyStreaks(data, topN)
- calculateTrackDailyStreaks(data, topN)
- calculateAlbumDailyStreaks(data, topN)
- calculateArtistGapStreaks(data, topN)
- calculateTrackGapStreaks(data, topN)
- calculateAlbumGapStreaks(data, topN)
- calculateBestPeriods(data)

### 5.5 Behavioral and sequence analytics

- calculateDeepInsights(data)
- calculateListeningSessions(data, gapMinutes)
- calculateListeningChains(data)

### 5.6 Competitive analytics

- calculateF1Championship(data, mode, selectedYear, topN)
- calculateArtistComparison(data, artistA, artistB, options)

### 5.7 Viewer analytics

- getViewerEntities(data, entityType, topN)
- calculateViewerAccumulatedSeries(data, options)

### 5.8 Detail analytics

- calculateTrackDetail
- calculateArtistDetail
- calculateAlbumDetail
- calculatePodcastDetail

### 5.9 Wrapped analytics

- calculateWrappedStats(year, fullData)

### 5.10 Contract expectations

Every store function should:

- Accept sparse/empty arrays and return safe defaults.
- Avoid side effects.
- Keep output stable given equal input.
- Prefer plain serializable objects.

---

## 6) Tab module contracts

Tab modules in [js/tabs](js/tabs) should follow this contract:

- Read from window.spotifyData.filtered unless explicitly full-history behavior is intended.
- Delegate heavy computation to store.
- Render idempotently.
- Rebind local listeners after each render pass.

Expected renderer signatures:

- renderOverview()
- renderTrends(data)
- renderStreaksTab()
- renderDeepDiveTab()
- renderF1Tab()
- renderWrappedContent()
- renderExplorerTab(data)
- renderViewerTab()
- renderCompareTab()
- renderPodcastUI(data)
- renderCalendarTab()

---

## 7) Chart layer conventions

Chart rendering is centralized in [js/charts.js](js/charts.js).

Conventions:

- Destroy previous chart instance before create.
- Keep tooltip and axis formatting consistent.
- Avoid embedding analytics logic in chart helpers.

When adding a chart helper:

- Name by intent, not by page.
- Accept precomputed data structure.
- Keep function pure relative to given canvas id.

---

## 8) Filter pipeline and state mechanics

Global filter flow is orchestrated in [js/main.js](js/main.js).

Mechanics:

- Build predicates from controls.
- Apply predicates to full array once.
- Assign filtered state.
- Trigger rerender for all affected tabs.

Design note:

- Filters are global, not per-tab.
- Pills mirror active filter state and support granular clear actions.

---

## 9) Detail modal integration contract

Entry points call openDetail(name, type, extra, fullData) from [js/detail.js](js/detail.js).

Type values:

- track
- artist
- album
- podcast

Requirements:

- Caller must pass enough identity fields.
- For track/album, extra usually carries artist disambiguator.

---

## 10) Adding a new metric safely

### Step-by-step

1. Implement metric in store.
2. Define exact input assumptions.
3. Return defensive defaults for empty/sparse data.
4. Add usage in target tab.
5. Add tooltip/label semantics to charts.
6. Verify behavior under filters and date range slicing.

### Design checklist

- Deterministic output?
- Unit convention clear (plays/minutes/percent)?
- Filter-aware?
- Timezone-safe for day/week keys?
- No accidental podcast/music leakage?

---

## 11) Adding a new tab safely

### 11.1 Shell wiring

- Add nav button and tab panel in [index.html](index.html).

### 11.2 Module wiring

- Create module in [js/tabs](js/tabs).
- Export render function.
- Re-export via [js/ui.js](js/ui.js) if needed.
- Add lazy render branch in [js/main.js](js/main.js).

### 11.3 State and filters

- Read from filtered data unless explicitly full-history semantics are needed.
- Respect global controls automatically by design.

### 11.4 Performance

- Prefer lazy render for expensive tabs.
- Avoid scanning full dataset repeatedly inside loops when one pre-aggregation can serve.

---

## 12) Testing strategy and fixtures

This repository currently has no automated tests. Recommended plan:

### 12.1 Unit tests for store

Target all pure functions in [js/store.js](js/store.js).

Suggested harness:

- Vitest or Jest

### 12.2 Golden fixtures

Create small deterministic JSON fixtures covering:

- mixed music/podcast events
- missing metadata fields
- edge timestamps across year/week boundaries
- heavy skip behavior
- sparse single-day datasets

### 12.3 Example assertions

- Weekly keys are Monday-start.
- F1 ranking ties are deterministic.
- Skip rate calculations preserve denominator conventions.
- Streak and gap outputs stable across repeated runs.

### 12.4 UI smoke tests

Optional Playwright smoke paths:

- upload fixture ZIP
- apply key filters
- switch tabs
- open detail modal
- export CSV from explorer

---

## 13) Regression checklist

Before merging feature changes:

1. Upload and parse still succeeds for representative ZIP exports.
2. Global filter controls still propagate to all major tabs.
3. Top lists and detail modal remain clickable.
4. F1 slider changes standings and week tables predictably.
5. Compare weighted winner changes when custom weights change.
6. Viewer play/pause/scrub controls remain responsive.
7. Explorer pagination and CSV export still function.
8. Calendar day-detail overlay still opens and closes cleanly.

---

## 14) Performance and scalability guidance

Hotspots:

- first load parse and normalize
- repeated grouping in heavy tabs
- chart recreation under frequent control changes

Recommendations:

- add memoization for repeated aggregations keyed by filter hash
- move heavy computations to Web Workers
- cache intermediate group maps for large arrays
- consider table virtualization for very large history views

---

## 15) Reliability and edge-case handling

Required resilience patterns:

- always guard divide-by-zero
- handle empty arrays with explicit fallback rendering
- preserve deterministic sorting under equal metric values
- sanitize UI-injected strings

Known caveats currently observed:

- year extraction in one streaks calendar path references endTime, which may be absent in normalized events.
- deep-dive habits section reads shuffle/offline flags that are not explicitly persisted by canonical normalization.

---

## 16) Security and privacy posture

Current posture:

- analytics is local and client-side
- no backend upload pipeline in the main app

Hardening recommendation:

- remove third-party analytics script tag from [index.html](index.html) in strict privacy deployments

---

## 17) Coding standards and contribution guidelines

Standards:

- Keep store functions side-effect free.
- Keep tab modules thin and view-oriented.
- Use clear unit suffixes in variable names where ambiguity exists.
- Avoid silent behavior changes in scoring formulas.
- Preserve existing naming conventions and data shapes where possible.

PR guidance:

- include concise rationale for metric changes
- mention expected impact on existing tabs
- include before/after screenshots for visual changes
- include sample fixture output for algorithm changes

---

## 18) Release and maintenance workflow

Suggested release flow:

1. Run regression checklist.
2. Verify dashboard behavior on at least one large multi-year export.
3. Validate Streamlit path still launches if touched.
4. Tag release notes by area:
   - ingestion
   - analytics
   - UX
   - visualization

Maintenance priorities:

- add test coverage for store contracts first
- then harden integration tests around filter propagation and tab switching
- then optimize heavy computations for larger datasets

---

## Quick Contributor Map

- First place to understand data flow: [js/main.js](js/main.js)
- First place to extend analytics: [js/store.js](js/store.js)
- First place to add visuals: [js/charts.js](js/charts.js)
- First place to add a new feature panel: [js/tabs](js/tabs)
