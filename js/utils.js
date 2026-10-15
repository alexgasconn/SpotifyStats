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

export function formatDate(value) {
    if (value === null || value === undefined || value === '') return '';
    let date;
    if (value instanceof Date) {
        date = value;
    } else {
        const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const monthOnly = String(value).match(/^(\d{4})-(\d{2})$/);
        date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
            : monthOnly ? new Date(Number(monthOnly[1]), Number(monthOnly[2]) - 1, 1)
                : new Date(value);
    }
    if (!Number.isFinite(date.getTime())) return '';
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

export function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return `${formatDate(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function parseDateInput(value) {
    const match = String(value || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return value ? null : '';
    const [, dayText, monthText, yearText] = match;
    const day = Number(dayText), month = Number(monthText), year = Number(yearText);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return `${yearText}-${monthText}-${dayText}`;
}
