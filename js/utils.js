// js/utils.js — Shared utility functions

export function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function escAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function showLoading(message) {
    const el = document.getElementById('loading-message');
    if (el) el.textContent = message;
    setLoadingProgress(0);
    document.getElementById('loading-overlay')?.classList.remove('hidden');
}

export function setLoadingProgress(progress = 0, message = null) {
    const p = Math.max(0, Math.min(100, Math.round(progress)));
    const bar = document.getElementById('loading-progress-bar');
    const txt = document.getElementById('loading-progress-text');
    const msg = document.getElementById('loading-message');
    if (bar) bar.style.width = `${p}%`;
    if (txt) txt.textContent = `${p}%`;
    if (message && msg) msg.textContent = message;
}

export function hideLoading() {
    setLoadingProgress(0);
    document.getElementById('loading-overlay')?.classList.add('hidden');
}

export function fmt(n) {
    return Number(n).toLocaleString();
}
