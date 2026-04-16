// js/tabs/game.js — Enhanced game with multiple modes

import * as store from '../store.js';
import { esc } from '../utils.js';

const gameContainer = document.getElementById('game-container');
let score = 0;
let rounds = 0;
let streak = 0;
let bestStreak = 0;
let currentChallenge = {};
let gameMode = 'artists';
let gameType = 'higher-lower';
let totalRounds = 10;

export function setupGame() {
    showStartScreen();
}

function showStartScreen() {
    score = 0;
    rounds = 0;
    streak = 0;

    gameContainer.innerHTML = `
        <div class="game-start-screen">
            <div class="game-logo">🎮</div>
            <h2>Spotify Stats Games</h2>
            <p>Test your knowledge of your own listening habits with multiple game modes!</p>

            <div class="game-mode-grid">
                <div class="game-mode-card" data-game="higher-lower">
                    <div class="gm-icon">⬆️⬇️</div>
                    <h3>Higher or Lower</h3>
                    <p>Guess which artist/track you listened to more</p>
                </div>
                <div class="game-mode-card" data-game="guess-year">
                    <div class="gm-icon">📅</div>
                    <h3>Guess the Year</h3>
                    <p>In which year did you listen to this the most?</p>
                </div>
                <div class="game-mode-card" data-game="chain-game">
                    <div class="gm-icon">🔗</div>
                    <h3>Complete the Chain</h3>
                    <p>What did you usually listen to after this track?</p>
                </div>
                <div class="game-mode-card" data-game="timeline">
                    <div class="gm-icon">⏳</div>
                    <h3>First Listen Order</h3>
                    <p>Which track did you discover first?</p>
                </div>
            </div>

            <div class="game-settings">
                <div class="game-setting">
                    <label>Category</label>
                    <select id="game-category">
                        <option value="artists">Artists</option>
                        <option value="tracks">Tracks</option>
                        <option value="albums">Albums</option>
                    </select>
                </div>
                <div class="game-setting">
                    <label>Rounds</label>
                    <select id="game-rounds">
                        <option value="5">5 rounds</option>
                        <option value="10" selected>10 rounds</option>
                        <option value="15">15 rounds</option>
                        <option value="20">20 rounds</option>
                    </select>
                </div>
            </div>
        </div>
    `;

    gameContainer.querySelectorAll('.game-mode-card').forEach(card => {
        card.addEventListener('click', () => {
            gameType = card.dataset.game;
            gameMode = document.getElementById('game-category')?.value || 'artists';
            totalRounds = parseInt(document.getElementById('game-rounds')?.value) || 10;

            // Chain game only for tracks
            if (gameType === 'chain-game') gameMode = 'tracks';
            if (gameType === 'timeline') gameMode = 'tracks';

            startGame();
        });
    });
}

function startGame() {
    score = 0;
    rounds = 0;
    streak = 0;
    bestStreak = 0;
    nextRound();
}

function nextRound() {
    if (rounds >= totalRounds) { showEndScreen(); return; }
    rounds++;

    switch (gameType) {
        case 'higher-lower': renderHigherLower(); break;
        case 'guess-year': renderGuessYear(); break;
        case 'chain-game': renderChainGame(); break;
        case 'timeline': renderTimeline(); break;
        default: renderHigherLower();
    }
}

// ═══════════════════════════════════════════
//  HIGHER OR LOWER
// ═══════════════════════════════════════════
function renderHigherLower() {
    const key = gameMode === 'artists' ? 'artistName' : gameMode === 'albums' ? 'albumName' : 'trackName';
    const topItems = store.calculateTopItems(window.spotifyData.full, key, 'minutes', 200);
    if (topItems.length < 2) { showEndScreen(); return; }

    let i1 = Math.floor(Math.random() * topItems.length);
    let i2 = Math.floor(Math.random() * topItems.length);
    while (i1 === i2) i2 = Math.floor(Math.random() * topItems.length);

    const o1 = topItems[i1], o2 = topItems[i2];
    currentChallenge = { options: [o1, o2], correctIndex: o1.minutes > o2.minutes ? 0 : 1 };

    gameContainer.innerHTML = `
        <div class="game-play-screen">
            ${gameHeader()}
            <h2 class="game-question">Who did you listen to more?</h2>
            <div class="game-options">
                <div class="game-card" data-choice="0">
                    <div class="gc-emoji">${gameMode === 'artists' ? '🎤' : gameMode === 'albums' ? '💿' : '🎵'}</div>
                    <h3>${esc(o1.name)}</h3>
                    ${o1.artistName && gameMode !== 'artists' ? `<p class="gc-sub">${esc(o1.artistName)}</p>` : ''}
                    <div class="gc-hidden-val">? minutes</div>
                </div>
                <div class="game-vs">VS</div>
                <div class="game-card" data-choice="1">
                    <div class="gc-emoji">${gameMode === 'artists' ? '🎤' : gameMode === 'albums' ? '💿' : '🎵'}</div>
                    <h3>${esc(o2.name)}</h3>
                    ${o2.artistName && gameMode !== 'artists' ? `<p class="gc-sub">${esc(o2.artistName)}</p>` : ''}
                    <div class="gc-hidden-val">? minutes</div>
                </div>
            </div>
        </div>`;

    gameContainer.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', handleHigherLowerChoice);
    });
}

function handleHigherLowerChoice(e) {
    const chosen = parseInt(e.currentTarget.dataset.choice);
    const correct = currentChallenge.correctIndex;
    const cards = gameContainer.querySelectorAll('.game-card');
    cards.forEach(c => c.removeEventListener('click', handleHigherLowerChoice));

    const isCorrect = chosen === correct;
    if (isCorrect) { score++; streak++; bestStreak = Math.max(bestStreak, streak); }
    else streak = 0;

    cards[chosen].classList.add(isCorrect ? 'correct' : 'incorrect');
    cards[correct].classList.add('correct');

    cards[0].querySelector('.gc-hidden-val').textContent = `${currentChallenge.options[0].minutes.toLocaleString()} minutes`;
    cards[1].querySelector('.gc-hidden-val').textContent = `${currentChallenge.options[1].minutes.toLocaleString()} minutes`;
    cards[0].querySelector('.gc-hidden-val').classList.add('revealed');
    cards[1].querySelector('.gc-hidden-val').classList.add('revealed');

    showFeedback(isCorrect);
    setTimeout(nextRound, 2000);
}

// ═══════════════════════════════════════════
//  GUESS THE YEAR
// ═══════════════════════════════════════════
function renderGuessYear() {
    const key = gameMode === 'artists' ? 'artistName' : gameMode === 'albums' ? 'albumName' : 'trackName';
    const data = window.spotifyData.full.filter(d => !d.isPodcast && d.trackName);
    const topItems = store.calculateTopItems(data, key, 'plays', 150);
    if (!topItems.length) { showEndScreen(); return; }

    const item = topItems[Math.floor(Math.random() * Math.min(topItems.length, 80))];

    // Calculate plays per year for this item
    const yearPlays = {};
    data.forEach(d => {
        const val = gameMode === 'artists' ? d.artistName : gameMode === 'albums' ? d.albumName : d.trackName;
        if (val === item.name || (gameMode === 'tracks' && val === item.name && d.artistName === item.artistName)) {
            yearPlays[d.year] = (yearPlays[d.year] || 0) + 1;
        }
    });

    const years = Object.entries(yearPlays).sort((a, b) => b[1] - a[1]);
    if (years.length < 2) { nextRound(); return; }

    const correctYear = years[0][0];
    const allYears = [...new Set(data.map(d => d.year))].sort();

    // Pick 3 wrong options
    const wrongYears = allYears.filter(y => String(y) !== String(correctYear));
    const shuffled = wrongYears.sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [correctYear, ...shuffled].sort(() => Math.random() - 0.5);

    currentChallenge = { correctYear: String(correctYear), item };

    gameContainer.innerHTML = `
        <div class="game-play-screen">
            ${gameHeader()}
            <h2 class="game-question">In which year did you listen to this the most?</h2>
            <div class="game-subject">
                <div class="gs-emoji">${gameMode === 'artists' ? '🎤' : '🎵'}</div>
                <div class="gs-name">${esc(item.name)}</div>
                ${item.artistName && gameMode !== 'artists' ? `<div class="gs-sub">${esc(item.artistName)}</div>` : ''}
            </div>
            <div class="game-year-options">
                ${options.map(y => `<button class="year-option-btn" data-year="${y}">${y}</button>`).join('')}
            </div>
        </div>`;

    gameContainer.querySelectorAll('.year-option-btn').forEach(btn => {
        btn.addEventListener('click', handleYearChoice);
    });
}

function handleYearChoice(e) {
    const chosen = e.target.dataset.year;
    const correct = currentChallenge.correctYear;
    const btns = gameContainer.querySelectorAll('.year-option-btn');
    btns.forEach(b => b.removeEventListener('click', handleYearChoice));

    const isCorrect = String(chosen) === String(correct);
    if (isCorrect) { score++; streak++; bestStreak = Math.max(bestStreak, streak); }
    else streak = 0;

    btns.forEach(b => {
        if (String(b.dataset.year) === String(correct)) b.classList.add('correct');
        if (String(b.dataset.year) === String(chosen) && !isCorrect) b.classList.add('incorrect');
    });

    showFeedback(isCorrect);
    setTimeout(nextRound, 2000);
}

// ═══════════════════════════════════════════
//  CHAIN GAME
// ═══════════════════════════════════════════
function renderChainGame() {
    const chains = store.calculateListeningChains(window.spotifyData.full);
    const trackChains = chains.trackChains;
    if (trackChains.length < 4) { showEndScreen(); return; }

    // Pick a random chain with count >= 3
    const usable = trackChains.filter(c => c.count >= 3);
    if (usable.length < 4) { nextRound(); return; }

    const chain = usable[Math.floor(Math.random() * Math.min(usable.length, 30))];
    const correctAnswer = chain.to;

    // Get wrong answers from other chains
    const allTos = [...new Set(trackChains.map(c => c.to))].filter(t => t !== correctAnswer);
    const wrongAnswers = allTos.sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [correctAnswer, ...wrongAnswers].sort(() => Math.random() - 0.5);

    currentChallenge = { correctAnswer, chain };

    gameContainer.innerHTML = `
        <div class="game-play-screen">
            ${gameHeader()}
            <h2 class="game-question">What did you usually listen to after this?</h2>
            <div class="game-subject">
                <div class="gs-emoji">🎵</div>
                <div class="gs-name">${esc(chain.from)}</div>
                <div class="gs-sub">${esc(chain.fromArtist || '')}</div>
            </div>
            <div class="game-chain-options">
                ${options.map(o => `<button class="chain-option-btn" data-answer="${o.replace(/"/g, '&quot;')}">${esc(o)}</button>`).join('')}
            </div>
        </div>`;

    gameContainer.querySelectorAll('.chain-option-btn').forEach(btn => {
        btn.addEventListener('click', handleChainChoice);
    });
}

function handleChainChoice(e) {
    const chosen = e.target.dataset.answer;
    const correct = currentChallenge.correctAnswer;
    const btns = gameContainer.querySelectorAll('.chain-option-btn');
    btns.forEach(b => b.removeEventListener('click', handleChainChoice));

    const isCorrect = chosen === correct;
    if (isCorrect) { score++; streak++; bestStreak = Math.max(bestStreak, streak); }
    else streak = 0;

    btns.forEach(b => {
        if (b.dataset.answer === correct) b.classList.add('correct');
        if (b.dataset.answer === chosen && !isCorrect) b.classList.add('incorrect');
    });

    showFeedback(isCorrect);
    setTimeout(nextRound, 2000);
}

// ═══════════════════════════════════════════
//  TIMELINE / FIRST LISTEN ORDER
// ═══════════════════════════════════════════
function renderTimeline() {
    const data = window.spotifyData.full.filter(d => !d.isPodcast && d.trackName);
    const topItems = store.calculateTopItems(data, 'trackName', 'plays', 200);
    if (topItems.length < 2) { showEndScreen(); return; }

    // Pick two tracks with different first-play dates
    const firstPlayMap = {};
    const sorted = [...data].sort((a, b) => a.ts - b.ts);
    sorted.forEach(d => {
        const key = `${d.trackName}|||${d.artistName}`;
        if (!firstPlayMap[key]) firstPlayMap[key] = d.date;
    });

    let attempts = 0;
    let t1, t2;
    do {
        t1 = topItems[Math.floor(Math.random() * Math.min(topItems.length, 100))];
        t2 = topItems[Math.floor(Math.random() * Math.min(topItems.length, 100))];
        attempts++;
    } while (attempts < 50 && (t1.name === t2.name || firstPlayMap[`${t1.name}|||${t1.artistName}`] === firstPlayMap[`${t2.name}|||${t2.artistName}`]));

    const d1 = firstPlayMap[`${t1.name}|||${t1.artistName}`] || '9999';
    const d2 = firstPlayMap[`${t2.name}|||${t2.artistName}`] || '9999';
    const correctIndex = d1 <= d2 ? 0 : 1;

    currentChallenge = { options: [t1, t2], correctIndex, dates: [d1, d2] };

    gameContainer.innerHTML = `
        <div class="game-play-screen">
            ${gameHeader()}
            <h2 class="game-question">Which track did you discover first?</h2>
            <div class="game-options">
                <div class="game-card" data-choice="0">
                    <div class="gc-emoji">🎵</div>
                    <h3>${esc(t1.name)}</h3>
                    <p class="gc-sub">${esc(t1.artistName || '')}</p>
                    <div class="gc-hidden-val">First: ???</div>
                </div>
                <div class="game-vs">VS</div>
                <div class="game-card" data-choice="1">
                    <div class="gc-emoji">🎵</div>
                    <h3>${esc(t2.name)}</h3>
                    <p class="gc-sub">${esc(t2.artistName || '')}</p>
                    <div class="gc-hidden-val">First: ???</div>
                </div>
            </div>
        </div>`;

    gameContainer.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', handleTimelineChoice);
    });
}

function handleTimelineChoice(e) {
    const chosen = parseInt(e.currentTarget.dataset.choice);
    const correct = currentChallenge.correctIndex;
    const cards = gameContainer.querySelectorAll('.game-card');
    cards.forEach(c => c.removeEventListener('click', handleTimelineChoice));

    const isCorrect = chosen === correct;
    if (isCorrect) { score++; streak++; bestStreak = Math.max(bestStreak, streak); }
    else streak = 0;

    cards[chosen].classList.add(isCorrect ? 'correct' : 'incorrect');
    cards[correct].classList.add('correct');

    cards[0].querySelector('.gc-hidden-val').textContent = `First: ${currentChallenge.dates[0]}`;
    cards[1].querySelector('.gc-hidden-val').textContent = `First: ${currentChallenge.dates[1]}`;
    cards[0].querySelector('.gc-hidden-val').classList.add('revealed');
    cards[1].querySelector('.gc-hidden-val').classList.add('revealed');

    showFeedback(isCorrect);
    setTimeout(nextRound, 2000);
}

// ═══════════════════════════════════════════
//  SHARED UI HELPERS
// ═══════════════════════════════════════════
function gameHeader() {
    const typeNames = { 'higher-lower': '⬆️⬇️ Higher or Lower', 'guess-year': '📅 Guess the Year', 'chain-game': '🔗 Complete the Chain', 'timeline': '⏳ First Listen Order' };
    return `<div class="game-header">
        <div class="game-mode-label">${typeNames[gameType] || 'Game'}</div>
        <div class="game-stats-row">
            <span class="game-round">Round ${rounds}/${totalRounds}</span>
            <span class="game-score">Score: ${score}</span>
            <span class="game-streak">${streak > 1 ? `🔥 ${streak} streak` : ''}</span>
        </div>
        <div class="game-progress-bar"><div class="game-progress-fill" style="width:${Math.round((rounds / totalRounds) * 100)}%"></div></div>
    </div>`;
}

function showFeedback(isCorrect) {
    const existing = gameContainer.querySelector('.game-feedback');
    if (existing) existing.remove();
    const fb = document.createElement('div');
    fb.className = `game-feedback ${isCorrect ? 'fb-correct' : 'fb-wrong'}`;
    fb.textContent = isCorrect ? (streak > 2 ? `🔥 ${streak} in a row!` : '✓ Correct!') : '✗ Wrong!';
    gameContainer.querySelector('.game-play-screen')?.appendChild(fb);
}

function showEndScreen() {
    const pct = totalRounds > 0 ? Math.round((score / totalRounds) * 100) : 0;
    let emoji = '😐';
    let verdict = 'Not bad!';
    if (pct >= 90) { emoji = '🏆'; verdict = 'You really know your music!'; }
    else if (pct >= 70) { emoji = '🎉'; verdict = 'Great job!'; }
    else if (pct >= 50) { emoji = '👍'; verdict = 'Nice try!'; }
    else { emoji = '💪'; verdict = 'Keep listening!'; }

    gameContainer.innerHTML = `
        <div class="game-end-screen">
            <div class="ge-emoji">${emoji}</div>
            <h2>Game Over!</h2>
            <p class="ge-verdict">${verdict}</p>
            <div class="ge-score-ring">
                <div class="ge-score-val">${score}/${totalRounds}</div>
                <div class="ge-score-pct">${pct}%</div>
            </div>
            <div class="ge-stats">
                <div class="ge-stat"><span>Best Streak</span><strong>🔥 ${bestStreak}</strong></div>
                <div class="ge-stat"><span>Accuracy</span><strong>${pct}%</strong></div>
            </div>
            <div class="ge-actions">
                <button class="game-button" id="play-again-btn">Play Again</button>
                <button class="game-button game-button-secondary" id="change-mode-btn">Change Mode</button>
            </div>
        </div>`;

    document.getElementById('play-again-btn')?.addEventListener('click', startGame);
    document.getElementById('change-mode-btn')?.addEventListener('click', showStartScreen);
}
