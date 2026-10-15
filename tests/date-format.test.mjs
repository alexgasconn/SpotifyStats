import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatDateTime, parseDateInput } from '../js/utils.js';

test('dates use dd/mm/yyyy regardless of input representation', () => {
    assert.equal(formatDate('2025-01-02'), '02/01/2025');
        assert.equal(formatDate('2025-01'), '01/01/2025');
    assert.equal(formatDate(new Date(2025, 0, 2)), '02/01/2025');
    assert.equal(formatDateTime(new Date(2025, 0, 2, 3, 4)), '02/01/2025 03:04');
});

test('date filters parse valid dd/mm/yyyy and reject impossible dates', () => {
    assert.equal(parseDateInput('29/02/2024'), '2024-02-29');
    assert.equal(parseDateInput('29/02/2025'), null);
    assert.equal(parseDateInput('31/04/2025'), null);
    assert.equal(parseDateInput(''), '');
});