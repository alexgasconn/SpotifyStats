// js/ui.js — Thin re-export layer (all logic now lives in js/tabs/*.js and js/utils.js)

import { renderOverview } from './tabs/overview.js';
import { renderTrends } from './tabs/trends.js';
import { renderWrappedContent, populateWrappedFilter } from './tabs/wrapped.js';
import { showLoading, hideLoading, setLoadingProgress } from './utils.js';

export { renderStreaksTab } from './tabs/streaks.js';
export { renderDeepDiveTab } from './tabs/deepdive.js';
export { renderCompareTab } from './tabs/compare.js';
export { renderF1Tab } from './tabs/f1.js';
export { renderExplorerTab } from './tabs/explorer.js';
export { renderViewerTab } from './tabs/viewer.js';
export { populateWrappedFilter, renderWrappedContent };
export { showLoading, hideLoading, setLoadingProgress };

/**
 * Main rendering entry – called after upload and after filter changes.
 * Delegates to the overview, trends and wrapped tab modules.
 */
export function renderUI() {
    renderOverview();
    const data = window.spotifyData?.filtered;
    if (data) renderTrends(data);
    renderWrappedContent();
}
