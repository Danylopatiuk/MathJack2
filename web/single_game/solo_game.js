// MathJack Game Logic
const suits = ['♥', '♦', '♠', '♣'];

// Replace traditional values with mathematical expressions
const mathExpressions = {
'2': ['1+1', '4÷2', '√4', '2', '2^1'],
'3': ['1+2', '9÷3', '√9', '6÷2', '3^1'],
'4': ['2+2', '2×2', '√16', '8÷2', '4^1'],
'5': ['10÷2', '2+3', '√25', '15÷3', '5^1'],
'6': ['3×2', '12÷2', '√36', '3+3', '6^1'],
'7': ['14÷2', '3+4', '√49', '9-2', '7^1'],
'8': ['4×2', '16÷2', '√64', '4+4', '2^3'],
'9': ['3×3', '18÷2', '√81', '6+3', '9^1'],
'10': ['5×2', '20÷2', '√100', '7+3', '10^1'],
'J': ['5+5', '√100', '12−2', '2×5', '8+2'],   // All result in 10
'Q': ['20÷2', '2+8', '√64+2', '12−2', '5×2'], // All result in 10
'K': ['√100', '7+3', '25−15', '2×5', '50÷5'], // All result in 10
'A': ['11', '21−10', '√121', '√100+1', '(√64−3)+6']
};
// Original card values (keeping this for internal game logic)
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
let deck = [];
let dealerCards = [];
let playerCards = [];
let dealerScore = 0;
let playerScore = 0;
let gameActive = false;
let playerBalance = 0;
let runningCount = 0;
let trueCount = 0;
let decksRemaining = 6;
let gamesPlayed = 0;
let playerWins = 0;
let totalProfit = 0;
let gameHistory = [];

// DOM Elements
const dealerCardsEl = document.getElementById('dealer-cards');
const playerCardsEl = document.getElementById('player-cards');
const dealerScoreEl = document.getElementById('dealer-score');
const playerScoreEl = document.getElementById('player-score');
const dealBtn = document.getElementById('deal-btn');
const hitBtn = document.getElementById('hit-btn');
const standBtn = document.getElementById('stand-btn');
const doubleBtn = document.getElementById('double-btn');
const playerBalanceEl = document.getElementById('player-balance');
const currentBetEl = document.getElementById('current-bet');
const betAmountEl = document.getElementById('bet-amount');
const mathHintEl = document.getElementById('hint-text');
const runningCountEl = document.getElementById('running-count');
const trueCountEl = document.getElementById('true-count');
const gamesPlayedEl = document.getElementById('games-played');
const playerWinsEl = document.getElementById('player-wins');
const winRateEl = document.getElementById('win-rate');
const totalProfitEl = document.getElementById('total-profit');
const historyDataEl = document.getElementById('history-data');
const countingProgressEl = document.getElementById('counting-progress');
const countingAccuracyEl = document.getElementById('counting-accuracy');

// Initialize charts
const ctx = document.getElementById('winRateCanvas').getContext('2d');
const winRateChart = new Chart(ctx, {
type: 'line',
data: {
labels: [],
datasets: [{
label: 'Win Rate %',
data: [],
borderColor: '#F59E0B',
backgroundColor: 'rgba(245, 158, 11, 0.1)',
tension: 0.1,
fill: true
}]
},
options: {
responsive: true,
scales: {
y: {
beginAtZero: true,
max: 100,
ticks: {
color: 'rgba(255, 255, 255, 0.7)'
},
grid: {
color: 'rgba(255, 255, 255, 0.1)'
}
},
x: {
ticks: {
color: 'rgba(255, 255, 255, 0.7)'
},
grid: {
color: 'rgba(255, 255, 255, 0.1)'
}
}
},
plugins: {
legend: {
labels: {
color: 'rgba(255, 255, 255, 0.7)'
}
}
}
}
});

const probCtx = document.getElementById('probability-chart').getContext('2d');
const probabilityChart = new Chart(probCtx, {
type: 'bar',
data: {
labels: ['Bust', 'Stand', 'Win'],
datasets: [{
label: 'Probability %',
data: [0, 0, 0],
backgroundColor: [
'rgba(255, 99, 132, 0.7)',
'rgba(54, 162, 235, 0.7)',
'rgba(75, 192, 192, 0.7)'
],
borderColor: [
'rgba(255, 99, 132, 1)',
'rgba(54, 162, 235, 1)',
'rgba(75, 192, 192, 1)'
],
borderWidth: 1
}]
},
options: {
responsive: true,
scales: {
y: {
beginAtZero: true,
max: 100,
ticks: {
color: 'rgba(255, 255, 255, 0.7)'
},
grid: {
color: 'rgba(255, 255, 255, 0.1)'
}
},
x: {
ticks: {
color: 'rgba(255, 255, 255, 0.7)'
},
grid: {
color: 'rgba(255, 255, 255, 0.1)'
}
}
},
plugins: {
legend: {
display: false,
labels: {
color: 'rgba(255, 255, 255, 0.7)'
}
}
}
}
});

// Event Listeners
dealBtn.addEventListener('click', () => {
playButtonSound();
dealCards();
});

hitBtn.addEventListener('click', () => {
playButtonSound();
hitPlayer();
});

standBtn.addEventListener('click', () => {
playButtonSound();
stand();
});

doubleBtn.addEventListener('click', () => {
playButtonSound();
doubleDown();
});
betAmountEl.addEventListener('input', updateBetAmount);

// Game Functions
function updateBetAmount() {
currentBet = parseInt(betAmountEl.value);
currentBetEl.textContent = currentBet;
}

function createDeck() {
deck = [];
for (let i = 0; i < decksRemaining; i++) {
for (let suit of suits) {
for (let value of values) {
// For each value, get a random expression that equals that value
const expressions = mathExpressions[value];
const randomExpression = expressions[Math.floor(Math.random() * expressions.length)];
deck.push({
suit,
value, // Keep original value for game logic
displayValue: randomExpression // Use math expression for display
});
}
}
}
shuffleDeck();
}

function shuffleDeck() {
for (let i = deck.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[deck[i], deck[j]] = [deck[j], deck[i]];
}
}

function dealCards() {
if (gameActive) return;

// Reset game state
dealerCards = [];
playerCards = [];
dealerScore = 0;
playerScore = 0;
gameActive = true;

// Create new deck if less than 1/4 remains
if (deck.length < 52 * decksRemaining / 4) {
createDeck();
runningCount = 0;
trueCount = 0;
updateCountDisplay();
mathHintEl.textContent = "Equations shuffled! Count reset.";
}

// Deal initial cards
playerCards.push(drawCard());
dealerCards.push(drawCard());
playerCards.push(drawCard());
dealerCards.push(drawCard(true)); // Dealer's second card is hidden

// Update displays
updateCardDisplays();
updateScores();

// Check for mathJack (21)
if (playerScore === 21) {
setTimeout(() => {
stand(true); // Player has mathJack, dealer plays
}, 1000);
}

// Enable/disable buttons
dealBtn.disabled = true;
hitBtn.disabled = false;
standBtn.disabled = false;
doubleBtn.disabled = playerCards.length > 2 || playerBalance < currentBet;

// Update hint
mathHintEl.textContent = "Solve the equations and make your move: Draw, Stay, or Double!";

// Update probability chart
updateProbabilityChart();
}

function drawCard(hidden = false) {
if (deck.length === 0) {
createDeck();
}
const card = deck.pop();

// Update count based on card value
if (!hidden) {
updateCount(card.value);
}

return { ...card, hidden };
}

function updateCount(cardValue) {
// Hi-Lo counting system
if (['2', '3', '4', '5', '6'].includes(cardValue)) {
runningCount += 1;
} else if (['10', 'J', 'Q', 'K', 'A'].includes(cardValue)) {
runningCount -= 1;
}

// Calculate true count
const estimatedDecksRemaining = Math.max(1, Math.floor(deck.length / 52));
trueCount = Math.floor(runningCount / estimatedDecksRemaining);

updateCountDisplay();
}

function updateCountDisplay() {
runningCountEl.textContent = runningCount;
trueCountEl.textContent = trueCount;

// Update counting accuracy (simulated for demo)
const accuracy = Math.min(100, Math.max(0, 70 + trueCount * 5));
countingProgressEl.style.width = `${accuracy}%`;
countingAccuracyEl.textContent = `${accuracy}%`;
}

function hitPlayer() {
if (!gameActive) return;

playerCards.push(drawCard());
updateCardDisplays();
updateScores();

// Check for bust
if (playerScore > 21) {
endGame("Bust! Your sum went over 21.");
return;
}

// Disable double down after first hit
doubleBtn.disabled = true;

// Update probability chart
updateProbabilityChart();
}

function stand(hasMathJack = false) {
if (!gameActive) return;

// Reveal dealer's hidden card
dealerCards.forEach(card => card.hidden = false);
updateCardDisplays();

// Dealer plays
dealerPlay(hasMathJack);
}

function doubleDown() {
if (!gameActive || playerCards.length > 2 || playerBalance < currentBet) return;

// Double the bet
playerBalance -= currentBet;
currentBet *= 2;
updateBalance();
currentBetEl.textContent = currentBet;

// Take one more card
hitPlayer();

// Stand automatically
if (playerScore <= 21) {
setTimeout(() => {
stand();
}, 500);
}
}

function dealerPlay(hasMathJack) {
// Calculate dealer's score (revealing hidden card)
updateScores(true);

// Check for dealer mathJack
if (dealerScore === 21 && dealerCards.length === 2 && !hasMathJack) {
endGame("Instructor has MathJack!");
return;
}

// Dealer hits on soft 17
while (dealerScore < 17 || (dealerScore === 17 && isSoft(dealerCards))) {
dealerCards.push(drawCard());
updateCardDisplays();
updateScores(true);

// Check for dealer bust
if (dealerScore > 21) {
endGame("Instructor busts! You win.");
return;
}
}

// Compare scores
compareScores();
}

function compareScores() {
if (playerScore > 21) {
endGame("Bust! Your sum went over 21.");
} else if (dealerScore > 21) {
endGame("Instructor busts! You win.");
} else if (playerScore > dealerScore) {
endGame("You win!");
} else if (playerScore < dealerScore) {
endGame("Instructor wins.");
} else {
endGame("Draw! It's a tie.");
}
}

function endGame(result) {
gameActive = false;

// Reveal all cards
dealerCards.forEach(card => card.hidden = false);
updateCardDisplays();
updateScores(true);

// Calculate point change
let pointChange = 0;
if (result.includes("win") || result.includes("busts")) {
pointChange = 1;
playerBalance += 1;
playerWins++;
} else if (result.includes("Instructor wins")) {
if (playerBalance > 0) {
pointChange = -1;
playerBalance -= 1;
}
}

gamesPlayed++;
updateBalance();
updateStats();

// Add to history
addToHistory(result, pointChange);

// Show game result modal
const resultModal = document.getElementById('game-result-modal');
const resultTitle = document.getElementById('result-title');
const resultPlayerCards = document.getElementById('result-player-cards');
const resultDealerCards = document.getElementById('result-dealer-cards');
const resultPoints = document.getElementById('result-points');
const resultTotalPoints = document.getElementById('result-total-points');

resultTitle.textContent = result;
resultPlayerCards.textContent = playerCards.map(c => c.displayValue).join(', ');
resultDealerCards.textContent = dealerCards.map(c => c.displayValue).join(', ');
resultPoints.textContent = pointChange >= 0 ? `+${pointChange}` : pointChange;
resultPoints.className = pointChange > 0 ? 'points-gain' : 'points-loss';
resultTotalPoints.textContent = playerBalance;

resultModal.style.display = 'flex';

// Enable continue button
const continueBtn = document.getElementById('continue-btn');
continueBtn.onclick = () => {
resultModal.style.display = 'none';
dealBtn.disabled = false;
hitBtn.disabled = true;
standBtn.disabled = true;
doubleBtn.disabled = true;
};

// Update hint
mathHintEl.textContent = result;
}

function updateCardDisplays() {
dealerCardsEl.innerHTML = '';
playerCardsEl.innerHTML = '';

dealerCards.forEach((card, index) => {
const cardEl = createCardElement(card, index === 1 && card.hidden);
dealerCardsEl.appendChild(cardEl);
});

playerCards.forEach(card => {
const cardEl = createCardElement(card);
playerCardsEl.appendChild(cardEl);
});
}

function createCardElement(card, isHidden = false) {
const cardEl = document.createElement('div');
cardEl.className = 'playing-card dealt-card';

if (isHidden) {
cardEl.innerHTML = '<div class="card-back_2"></div>';
return cardEl;
}

cardEl.innerHTML = `
  <div class="card-value ${['♥', '♦'].includes(card.suit) ? 'heart' : 'spade'} ${card.displayValue.length > 6 ? 'long-equation' : ''} ${card.displayValue.length > 8 ? 'very-long-equation' : ''}">
      ${card.displayValue}${card.suit}
  </div>
  <div class="probability-display" style="display: none;"></div>
  <div class="card-tooltip">Equals: ${card.value}, Count: ${getCardCountValue(card.value)}</div>
`;

return cardEl;
}

function getCardCountValue(cardValue) {
if (['2', '3', '4', '5', '6'].includes(cardValue)) return '+1';
if (['10', 'J', 'Q', 'K', 'A'].includes(cardValue)) return '-1';
return '0';
}

function updateScores(includeDealer = false) {
playerScore = calculateScore(playerCards);
playerScoreEl.textContent = playerScore;

if (includeDealer) {
dealerScore = calculateScore(dealerCards);
dealerScoreEl.textContent = dealerScore;
} else {
// For dealer, only show the value of the up card
const upCard = dealerCards.find(card => !card.hidden);
dealerScoreEl.textContent = upCard ? calculateScore([upCard]) : '0';
}
}

function calculateScore(cards) {
let score = 0;
let aces = 0;

cards.filter(card => !card.hidden).forEach(card => {
if (card.value === 'A') {
score += 11;
aces++;
} else if (['K', 'Q', 'J'].includes(card.value)) {
score += 10;
} else {
score += parseInt(card.value);
}
});

// Adjust for aces if over 21
while (score > 21 && aces > 0) {
score -= 10;
aces--;
}

return score;
}

function isSoft(cards) {
let score = 0;
let aces = 0;

cards.forEach(card => {
if (card.value === 'A') {
score += 11;
aces++;
} else if (['K', 'Q', 'J'].includes(card.value)) {
score += 10;
} else {
score += parseInt(card.value);
}
});

// Check if any ace is being counted as 11
return aces > 0 && score <= 21;
}

function updateBalance() {
playerBalanceEl.textContent = playerBalance;
}

function updateStats() {
gamesPlayedEl.textContent = gamesPlayed;
playerWinsEl.textContent = playerWins;

const winRate = gamesPlayed > 0 ? Math.round((playerWins / gamesPlayed) * 100) : 0;
winRateEl.textContent = `${winRate}%`;

totalProfitEl.textContent = `${totalProfit}`;

// Update win rate chart
updateWinRateChart();
}

function addToHistory(result, profit) {
const gameResult = {
number: gamesPlayed,
playerHand: `${playerScore} (${playerCards.map(c => c.hidden ? '?' : c.displayValue).join(', ')})`,
dealerHand: `${dealerScore} (${dealerCards.map(c => c.displayValue).join(', ')})`,
result,
profit: profit >= 0 ? `+${profit}` : `-${Math.abs(profit)}`
};

gameHistory.unshift(gameResult);
if (gameHistory.length > 10) gameHistory.pop();

updateHistoryTable();
}

function updateHistoryTable() {
historyDataEl.innerHTML = '';

if (gameHistory.length === 0) {
historyDataEl.innerHTML = '<tr><td colspan="5" class="text-center">No games played yet</td></tr>';
return;
}

gameHistory.forEach(game => {
const row = document.createElement('tr');
row.innerHTML = `
      <td>${game.number}</td>
      <td>${game.playerHand}</td>
      <td>${game.dealerHand}</td>
      <td>${game.result}</td>
      <td class="${game.profit.startsWith('+') ? 'text-success' : 'text-danger'}">${game.profit}</td>
  `;
historyDataEl.appendChild(row);
});
}

function updateWinRateChart() {
const labels = Array.from({ length: gamesPlayed }, (_, i) => i + 1);
const winRates = [];
let wins = 0;

for (let i = 0; i < gamesPlayed; i++) {
if (gameHistory.find(g => g.number === i + 1 && g.result.includes("win"))) {
wins++;
}
winRates.push(Math.round((wins / (i + 1)) * 100));
}

winRateChart.data.labels = labels;
winRateChart.data.datasets[0].data = winRates;
winRateChart.update();
}

function updateProbabilityChart() {
if (!gameActive) return;

// Simplified probabilities for demo
const bustProb = Math.min(100, Math.max(0, (playerScore - 11) * 10));
const standProb = Math.min(100, Math.max(0, 100 - bustProb));
const winProb = Math.min(100, Math.max(0, standProb * 0.7));

probabilityChart.data.datasets[0].data = [bustProb, standProb, winProb];
probabilityChart.update();
}

document.addEventListener('click', (event) => {
if (event.target.classList.contains('math-symbol')) {
// Make math symbols interactive when clicked
event.target.style.transform = 'scale(1.5) rotate(360deg)';
event.target.style.transition = 'transform 0.5s ease';

// Return to normal after animation
setTimeout(() => {
event.target.style.transform = '';
}, 500);
}
});

// Tutorial for first-time users
function showTutorial() {
const hasSeenTutorial = localStorage.getItem('seenTutorial');
if (!hasSeenTutorial) {
document.getElementById('instruction-modal').style.display = 'flex';
mathHintEl.innerHTML = "<strong>Welcome to MathJack!</strong> Practice math while playing a card game. Solve equations to get the best score!";
localStorage.setItem('seenTutorial', 'true');
} else {
document.getElementById('instruction-modal').style.display = 'none';
}
}

// Initialize the game
createDeck();
updateBalance();
updateStats();
showTutorial();

// Add this function at the start of the script section
function playButtonSound() {
const sound = document.getElementById('buttonClickSound');
sound.currentTime = 0; // Reset sound to start
sound.volume = 0.5; // Set volume to 50%
sound.play();
}

function closeInstructions() {
document.getElementById('instruction-modal').style.display = 'none';
}