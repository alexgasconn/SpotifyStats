import * as store from './store.js';

const gameContainer = document.getElementById('game-container');
let score = 0;
let rounds = 0;
let currentChallenge = {};
let gameMode = 'artists'; // 'artists' or 'tracks'

export function setupGame() {
    showStartScreen();
}

function showStartScreen() {
    gameContainer.innerHTML = `
        <div id="game-start-screen">
            <h2>Who Did You Listen To More?</h2>
            <p>Test your knowledge of your own listening habits. Choose between two artists or tracks to guess which one you've played more.</p>
            <button class="game-button" id="start-artist-game">Play with Artists</button>
            <button class="game-button" id="start-track-game">Play with Tracks</button>
        </div>
    `;
    document.getElementById('start-artist-game').addEventListener('click', () => startGame('artists'));
    document.getElementById('start-track-game').addEventListener('click', () => startGame('tracks'));
}

function startGame(mode) {
    score = 0;
    rounds = 0;
    gameMode = mode;
    nextRound();
}

function nextRound() {
    if (rounds >= 10) {
        showEndScreen();
        return;
    }
    rounds++;
    
    // Generar un nuevo desafío
    currentChallenge = generateChallenge();

    gameContainer.innerHTML = `
        <div id="game-main-screen">
            <div class="game-header">
                <div class="game-round">Round: ${rounds}/10</div>
                <div class="game-score">Score: ${score}</div>
            </div>
            <h2>Who did you listen to more?</h2>
            <div class="game-options">
                <div class="game-card" data-choice="0">
                    <h3>${currentChallenge.options[0].name}</h3>
                    ${gameMode === 'tracks' ? `<p>${currentChallenge.options[0].artist}</p>` : ''}
                </div>
                <div class="game-card" data-choice="1">
                    <h3>${currentChallenge.options[1].name}</h3>
                    ${gameMode === 'tracks' ? `<p>${currentChallenge.options[1].artist}</p>` : ''}
                </div>
            </div>
        </div>
    `;

    document.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', handleChoice);
    });
}

function generateChallenge() {
    const key = gameMode === 'artists' ? 'artistName' : 'trackName';
    const topItems = store.calculateTopItems(window.spotifyData.full, key, 'minutes', 200);
    
    // Elegir dos items distintos al azar
    let index1 = Math.floor(Math.random() * topItems.length);
    let index2 = Math.floor(Math.random() * topItems.length);
    while (index1 === index2) {
        index2 = Math.floor(Math.random() * topItems.length);
    }

    const option1 = topItems[index1];
    const option2 = topItems[index2];

    return {
        options: [option1, option2],
        correctIndex: option1.minutes > option2.minutes ? 0 : 1
    };
}

function handleChoice(event) {
    const chosenIndex = parseInt(event.currentTarget.dataset.choice);
    const correctIndex = currentChallenge.correctIndex;
    const cards = document.querySelectorAll('.game-card');

    // Desactivar clics
    cards.forEach(card => card.removeEventListener('click', handleChoice));

    if (chosenIndex === correctIndex) {
        score++;
        cards[chosenIndex].classList.add('correct');
    } else {
        cards[chosenIndex].classList.add('incorrect');
        cards[correctIndex].classList.add('correct');
    }

    // Mostrar los minutos reales
    cards[0].innerHTML += `<p>${currentChallenge.options[0].minutes.toLocaleString()} minutes</p>`;
    cards[1].innerHTML += `<p>${currentChallenge.options[1].minutes.toLocaleString()} minutes</p>`;
    
    setTimeout(nextRound, 2500); // Esperar 2.5 segundos antes de la siguiente ronda
}

function showEndScreen() {
    gameContainer.innerHTML = `
        <div id="game-end-screen">
            <h2>Game Over!</h2>
            <p>Your final score is:</p>
            <div class="game-score" style="font-size: 4rem; margin: 2rem 0;">${score} / 10</div>
            <button class="game-button" id="play-again-btn">Play Again</button>
        </div>
    `;
    document.getElementById('play-again-btn').addEventListener('click', showStartScreen);
}