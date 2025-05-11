// multiplayer_game.js - Client-side multiplayer game logic for MathJack

// DOM Elements - will be initialized in initializeMultiplayerGame
let opponentCardsEl;
let playerCardsEl;
let playerScoreEl;
let hitButton;
let standButton;
let playAgainButton;
let mathHintEl;
let opponentScoreEl;

// Game state object to track the current state of the game
const gameState = {
    roomPin: null,
    currentPlayer: null,  // Current player's socket ID
    opponentId: null,     // Opponent's socket ID
    playerCards: {},      // Cards for each player, indexed by socket ID
    playerScore: 0,       // Current player's score
    opponentScore: 0,     // Opponent's score
    gameActive: false,    // Whether the game is active
    currentTurn: null,    // Whose turn it is (socket ID)
    playerStayed: {},     // Track if a player has chosen to "Stay", indexed by socket ID
    isHost: false,        // Whether this player is the host
    winCount: {           // Track wins for each player
        player: 0,
        opponent: 0
    }
};

// Game constants - copied from solo_game.js for reference
const suits = ['♥', '♦', '♠', '♣'];
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
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Initialize socket event listeners for the game
function initializeMultiplayerGame() {
    console.log("Initializing multiplayer game...");
    
    // Use the globally available variables set in multiplayer.html
    socket = window.gameSocket;
    const roomPin = window.gameRoomPin;
    
    if (!socket || !roomPin) {
        console.error("Socket or roomPin not available");
        return;
    }
    
    // Store current room PIN from the waiting room
    gameState.roomPin = roomPin;
    gameState.currentPlayer = socket.id;
    
    // Initialize player stayed status
    gameState.playerStayed[socket.id] = false;
    
    // Listen for players ready update
    socket.on('players-ready-update', ({ readyCount, totalPlayers }) => {
        const playAgainBtn = document.getElementById('play-again-btn');
        if (playAgainBtn && gameState.isHost) {
            playAgainBtn.textContent = `Waiting for players (${readyCount}/${totalPlayers})`;
        }
    });
    
    // Listen for room join event to set host status
    socket.on('room-joined', ({ roomPin, players }) => {
        console.log('Room joined, players:', players);
        players.forEach(player => {
            if (player.id === socket.id) {
                gameState.isHost = player.isHost || false;
                console.log('Is host:', gameState.isHost);
            }
        });
    });

    // Get DOM elements for game controls
    hitButton = document.getElementById('hit-btn');
    standButton = document.getElementById('stand-btn');
    playAgainButton = document.getElementById('play-again-btn');
    mathHintEl = document.getElementById('math-hint');
    opponentCardsEl = document.getElementById('opponent-cards');
    playerCardsEl = document.getElementById('player-cards');
    playerScoreEl = document.getElementById('player-score');
    opponentScoreEl = document.getElementById('opponent-score');
    
    // Get win counter elements
    const playerWinCountEl = document.getElementById('player-wins');
    const opponentWinCountEl = document.getElementById('opponent-wins');
    
    // Initialize win counters if they exist
    if (playerWinCountEl) playerWinCountEl.textContent = '0';
    if (opponentWinCountEl) opponentWinCountEl.textContent = '0';
    
    // Ensure game container is visible
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.style.display = 'block';
    } else {
        console.error("Game container not found");
    }
    
    // Check if all elements were found
    if (!hitButton || !standButton || !opponentCardsEl || !playerCardsEl) {
        console.error("Could not find all required game elements");
        console.log("Elements found:", {
            hitButton, standButton, opponentCardsEl, playerCardsEl, 
            playerScoreEl, opponentScoreEl, mathHintEl
        });
        return;
    }
    
    console.log("Game elements initialized successfully");
    
    // Disable game controls initially
    setControlsEnabled(false);
    
    // Set up socket events for game state updates
    socket.on('game-state-update', handleGameStateUpdate);
    socket.on('your-turn', handleYourTurn);
    socket.on('opponent-turn', handleOpponentTurn);
    socket.on('game-over', handleGameOver);
    socket.on('reset-game', handleResetGame);
    socket.on('waiting-for-opponent', handleWaitingForOpponent);
    
    // Set up button event listeners
    hitButton.addEventListener('click', () => {
        console.log('Hit button clicked');
        if (gameState.gameActive && gameState.currentTurn === socket.id) {
            // Player chooses to Hit
            gameState.playerStayed[socket.id] = false; // Reset stayed status
            socket.emit('player-hit', { roomPin: gameState.roomPin });
            setControlsEnabled(false); // Disable controls until server responds
            
            if (mathHintEl) {
                mathHintEl.textContent = "You chose to Hit. Waiting for server...";
            }
        } else {
            console.log('Cannot hit: game not active or not your turn');
        }
    });
    
    standButton.addEventListener('click', () => {
        console.log('Stand button clicked');
        if (gameState.gameActive && gameState.currentTurn === socket.id) {
            // Player chooses to Stay
            gameState.playerStayed[socket.id] = true;
            
            if (mathHintEl) {
                mathHintEl.textContent = "You chose to Stay. Waiting for opponent...";
            }
            socket.emit('player-stand', { roomPin: gameState.roomPin });
            setControlsEnabled(false); // Disable controls until server responds
        } else {
            console.log('Cannot stand: game not active or not your turn');
        }
    });
    
    // No need for click handler here as it's handled in multiplayer.html
    // Just expose the button to other scripts
    window.playAgainButton = playAgainButton;
    
    // Signal ready to server
    socket.emit('player-ready', { roomPin: gameState.roomPin });
    console.log('Sent player-ready event for room:', roomPin);
    
    // Hide opponent score label initially
    const opponentScoreLabel = document.getElementById('opponent-score-label');
    if (opponentScoreLabel) {
        opponentScoreLabel.style.visibility = 'hidden';
    }
    
    mathHintEl.textContent = "Waiting for both players to be ready...";
}

// Handle game state updates from server
function handleGameStateUpdate(state) {
    console.log("Received game state update:", state);
    
    // Validate the state object
    if (!state) {
        console.error("Received invalid game state");
        return;
    }
    
    if (!socket) {
        console.error("Socket not initialized");
        socket = window.gameSocket; // Try to recover
        if (!socket) {
            console.error("Could not recover socket reference");
            return;
        }
    }
    
    // Debug card data
    console.log("Player cards for", socket.id, ":", state.playerCards?.[socket.id]);
    gameState.gameActive = state.gameActive;
    gameState.currentTurn = state.currentTurn;
    gameState.opponentId = state.opponentId;
    
    // Update player cards
    if (state.playerCards && state.playerCards[socket.id]) {
        gameState.playerCards[socket.id] = state.playerCards[socket.id];
    }
    
    // Update opponent cards
    if (state.playerCards && state.opponentId && state.playerCards[state.opponentId]) {
        gameState.playerCards[state.opponentId] = state.playerCards[state.opponentId];
    }
    
    // Update scores
    if (state.scores) {
        if (state.scores[socket.id] !== undefined) {
            gameState.playerScore = state.scores[socket.id];
        }
        
        if (state.opponentId && state.scores[state.opponentId] !== undefined) {
            gameState.opponentScore = state.scores[state.opponentId];
        }
    }
    
    // Update player stayed status if provided
    if (state.playerStayed) {
        gameState.playerStayed = state.playerStayed;
    }
    
    // Update player names if available
    if (state.playerNames) {
        gameState.playerNames = state.playerNames;
    }
    
    // Update UI based on game state
    updateCardDisplays();
    updateScores();
    updateTurnIndicator();
    
    // Enable controls if it's player's turn
    setControlsEnabled(state.currentTurn === socket.id && state.gameActive);
    
    // Update math hint
    if (mathHintEl) {
        if (state.currentTurn === socket.id && state.gameActive) {
            // Check if the player has already chosen to stay
            if (gameState.playerStayed[socket.id]) {
                mathHintEl.textContent = "You chose to Stay. Waiting for opponent...";
                mathHintEl.style.color = '#FFA500';
                // Disable controls since player chose to stay
                setControlsEnabled(false);
            } else {
                mathHintEl.textContent = "Your turn! Choose to Hit or Stay.";
                mathHintEl.style.color = '#4CAF50';
                mathHintEl.style.fontWeight = 'bold';
            }
        } else if (state.gameActive) {
            // Check if opponent has chosen to stay
            if (gameState.opponentId && gameState.playerStayed[gameState.opponentId]) {
                mathHintEl.textContent = "Opponent chose to Stay. Waiting for your turn...";
            } else {
                mathHintEl.textContent = "Opponent's turn. Please wait...";
            }
            mathHintEl.style.color = '';
            mathHintEl.style.fontWeight = '';
        }
    }
    
    // Check if both players have chosen to stay
    const bothPlayerStayed = gameState.opponentId && 
                            gameState.playerStayed[socket.id] && 
                            gameState.playerStayed[gameState.opponentId];
                            
    if (bothPlayerStayed && state.gameActive) {
        console.log('Both players have chosen to Stay. Game should end soon.');
    }
    
    console.log('Updated game state:', {
        playerCards: gameState.playerCards[socket.id] ? gameState.playerCards[socket.id].length : 0,
        opponentCards: gameState.playerCards[gameState.opponentId] ? gameState.playerCards[gameState.opponentId].length : 0,
        playerScore: gameState.playerScore,
        opponentScore: gameState.opponentScore,
        currentTurn: gameState.currentTurn === socket.id ? 'player' : 'opponent',
        gameActive: gameState.gameActive,
        playerStayed: gameState.playerStayed
    });
    
    // Force card display update with a slight delay to ensure DOM is ready
    setTimeout(() => {
        // Update UI
        updateCardDisplays();
        updateScores();
        
        // Update turn indicator
        updateTurnIndicator();
        
        // Log that UI has been updated
        console.log("UI updated with new game state");
    }, 100);
}

// Handle your turn notification
function handleYourTurn() {
    setControlsEnabled(true);
    mathHintEl.textContent = "It's your turn! Hit or Stand?";
    updateTurnIndicator();
}

// Handle opponent's turn notification
function handleOpponentTurn() {
    setControlsEnabled(false);
    mathHintEl.textContent = `${gameState.opponentName} is thinking...`;
    updateTurnIndicator();
}

// Handle waiting for opponent notification
function handleWaitingForOpponent() {
    console.log('Waiting for opponent to press Play Again...');
    
    // Update UI to show waiting status
    if (mathHintEl) {
        mathHintEl.textContent = 'Waiting for opponent to press Play Again...';
        mathHintEl.style.color = '#ffc107'; // Yellow for waiting
    }
    
    // // Disable the play again button to prevent multiple clicks
    // if (playAgainButton) {
    //     playAgainButton.disabled = true;
    //     playAgainButton.textContent = 'Waiting for opponent...';
    // }
}

// Handle game over event
function handleGameOver(data) {
    console.log('Game over:', data);
    
    // Disable controls
    setControlsEnabled(false);
    
    // Reveal all cards
    updateCardDisplays(true);
    
    // Determine winner based on scores
    let resultMessage = '';
    const playerScore = gameState.playerScore;
    const opponentScore = gameState.opponentScore;
    
    // Check if both players have chosen to Stay
    const bothPlayerStayed = gameState.opponentId && 
                            gameState.playerStayed[socket.id] && 
                            gameState.playerStayed[gameState.opponentId];
    
    // Update win counter based on the winner
    if (data.winner === socket.id) {
        // Player wins
        gameState.winCount.player += 1;
        resultMessage = `You win! Your score: ${playerScore}, Opponent's score: ${opponentScore}`;
        
        // Update win counter display
        const playerWinCountEl = document.getElementById('player-wins');
        if (playerWinCountEl) {
            playerWinCountEl.textContent = gameState.winCount.player;
        }
    } else if (data.winner === gameState.opponentId) {
        // Opponent wins
        gameState.winCount.opponent += 1;
        resultMessage = `Opponent wins! Your score: ${playerScore}, Opponent's score: ${opponentScore}`;
        
        // Update win counter display
        const opponentWinCountEl = document.getElementById('opponent-wins');
        if (opponentWinCountEl) {
            opponentWinCountEl.textContent = gameState.winCount.opponent;
        }
    } else {
        // It's a tie
        resultMessage = `It's a tie! Both scores: ${playerScore}`;
    }
    
    // Display result message
    if (mathHintEl) {
        mathHintEl.textContent = resultMessage;
        mathHintEl.style.fontWeight = 'bold';
        mathHintEl.style.color = data.winner === socket.id ? '#4CAF50' : 
                               data.winner === gameState.opponentId ? '#FF5722' : '#FFC107';
    }

    // Show Play Again button only for host
    if (playAgainButton) {
        if (gameState.isHost) {
            // Reset button state and show for host
            playAgainButton.disabled = false;
            playAgainButton.textContent = 'Play Again';
            playAgainButton.style.display = 'block';
            console.log('Play Again button shown for host');

            // Update hint for host
            if (mathHintEl) {
                mathHintEl.textContent = 'Click Play Again to start a new game';
                mathHintEl.style.color = '#28a745'; // Green color to draw attention
            }
        } else {
            // Hide button for non-host players
            playAgainButton.style.display = 'none';
            playAgainButton.disabled = true;
            console.log('Play Again button hidden for non-host');

            // Show waiting message for non-host players
            if (mathHintEl) {
                mathHintEl.textContent = 'Waiting for host to start new game...';
                mathHintEl.style.color = '#6c757d'; // Gray color for waiting state
            }
        }
    }

    // Update scores to show final values
    gameState.gameActive = false;
    updateScores();

    // Show opponent's score element
    if (opponentScoreEl) {
        opponentScoreEl.style.display = 'inline-block';
        opponentScoreEl.textContent = gameState.opponentScore;

        // Add a label before the score
        const sectionTitle = opponentScoreEl.parentElement;
        if (sectionTitle) {
            // Make sure we don't add multiple labels
            if (!document.getElementById('opponent-score-label')) {
                const scoreLabel = document.createElement('span');
                scoreLabel.id = 'opponent-score-label';
                scoreLabel.textContent = ' Score: ';
                opponentScoreEl.before(scoreLabel);
            }
        }
    }
    
    // Use the server-provided message if available, otherwise use our constructed message
    const serverMessage = data.message || 'Game Over';
    
    // Display result message with styling based on win/lose/draw
    if (mathHintEl) {
        mathHintEl.textContent = serverMessage;
        
        // Style based on result
        if (serverMessage.includes('win')) {
            mathHintEl.style.color = '#28a745'; // Green for win
            mathHintEl.style.fontWeight = 'bold';
            mathHintEl.style.fontSize = '24px';
            mathHintEl.style.textShadow = '0 0 10px rgba(40, 167, 69, 0.7)';
        } else if (serverMessage.includes('lose')) {
            mathHintEl.style.color = '#dc3545'; // Red for lose
            mathHintEl.style.fontWeight = 'bold';
            mathHintEl.style.fontSize = '24px';
            mathHintEl.style.textShadow = '0 0 10px rgba(220, 53, 69, 0.7)';
        } else if (serverMessage.includes('draw') || serverMessage.includes('tie')) {
            mathHintEl.style.color = '#ffc107'; // Yellow for draw/tie
            mathHintEl.style.fontWeight = 'bold';
            mathHintEl.style.fontSize = '24px';
            mathHintEl.style.textShadow = '0 0 10px rgba(255, 193, 7, 0.7)';
        } else if (resultMessage.includes('busted')) {
            mathHintEl.style.color = '#dc3545'; // Red for bust
            mathHintEl.style.fontWeight = 'bold';
            mathHintEl.style.fontSize = '24px';
            mathHintEl.style.textShadow = '0 0 10px rgba(220, 53, 69, 0.7)';
        }
    }
    
    // Add animation to show final scores
    const scoreElements = [playerScoreEl, opponentScoreEl];
    scoreElements.forEach(el => {
        if (el) {
            el.style.transition = 'all 0.5s ease';
            el.style.transform = 'scale(1.2)';
            el.style.fontWeight = 'bold';
            setTimeout(() => {
                if (el) el.style.transform = 'scale(1)';
            }, 1000);
        }
    });
}

// Initialize or re-initialize game elements
function initializeGameElements() {
    // Get DOM elements for game controls if not already set
    if (!hitButton) hitButton = document.getElementById('hit-btn');
    if (!standButton) standButton = document.getElementById('stand-btn');
    if (!playAgainButton) playAgainButton = document.getElementById('play-again-btn');
    if (!mathHintEl) mathHintEl = document.getElementById('math-hint');
    if (!opponentCardsEl) opponentCardsEl = document.getElementById('opponent-cards');
    if (!playerCardsEl) playerCardsEl = document.getElementById('player-cards');
    if (!playerScoreEl) playerScoreEl = document.getElementById('player-score');
    if (!opponentScoreEl) opponentScoreEl = document.getElementById('opponent-score');
    
    // Ensure opponent score is hidden when initializing
    if (opponentScoreEl) {
        opponentScoreEl.style.display = 'none';
    }
    
    // Return true if all elements are found
    return !!(hitButton && standButton && playerCardsEl && opponentCardsEl && 
              playerScoreEl && opponentScoreEl && mathHintEl);
}

// Handle reset game notification
function handleResetGame() {
    console.log('Current game state before reset:', JSON.stringify(gameState));
    
    // Ensure game elements are initialized
    if (!initializeGameElements()) {
        console.error('Failed to initialize game elements');
        return;
    }
    
    // Reset game state
    gameState.gameActive = false;
    gameState.currentTurn = null;
    gameState.playerCards = {};
    if (!gameState.playerCards[socket.id]) {
        gameState.playerCards[socket.id] = [];
    }
    if (gameState.opponentId && !gameState.playerCards[gameState.opponentId]) {
        gameState.playerCards[gameState.opponentId] = [];
    }
    
    console.log('Game state after reset:', JSON.stringify(gameState));
    
    
    // Reset player stayed status
    gameState.playerStayed = {};
    gameState.playerStayed[socket.id] = false;
    if (gameState.opponentId) {
        gameState.playerStayed[gameState.opponentId] = false;
    }
    
    // Clear cards
    if (opponentCardsEl) {
        opponentCardsEl.innerHTML = '';
    }
    
    if (playerCardsEl) {
        playerCardsEl.innerHTML = '';
    }
    
    // Cards are already reset above
    
    // Save current win counts if they exist
    const playerWins = gameState.playerWins || 0;
    const opponentWins = gameState.opponentWins || 0;
    
    // Reset game state but preserve win counts
    gameState.playerCards = {};
    gameState.playerCards[socket.id] = [];
    if (gameState.opponentId) {
        gameState.playerCards[gameState.opponentId] = [];
    }
    gameState.playerScore = 0;
    gameState.opponentScore = 0;
    gameState.gameActive = false;
    gameState.currentTurn = '';
    gameState.playerWins = playerWins;
    gameState.opponentWins = opponentWins;
    
    // Reset UI elements
    updateCardDisplays();
    updateScores();
    
    // Reset action buttons
    if (hitButton) hitButton.disabled = true;
    if (standButton) standButton.disabled = true;
    
    // Hide play again button during reset
    if (playAgainButton) {
        playAgainButton.style.display = 'none';
    }
    
    // Reset hint box
    if (mathHintEl) {
        mathHintEl.textContent = 'Waiting for new game...';
        mathHintEl.style.color = '#6c757d';
    }
    
    // Reset scores display
    if (playerScoreEl) playerScoreEl.textContent = '0';
    if (opponentScoreEl) {
        opponentScoreEl.textContent = '0';
        opponentScoreEl.style.display = 'none';
    }
}
    
    // Update hint message
    if (mathHintEl) {
        mathHintEl.textContent = "Waiting for both players to be ready...";
        mathHintEl.style.color = ''; // Reset color
        mathHintEl.style.fontWeight = '';
        mathHintEl.style.fontSize = '';
        mathHintEl.style.textShadow = '';
    }
    
    // Reset any visual effects
    const playerSection = document.getElementById('player-section');
    const opponentSection = document.getElementById('opponent-section');
    if (playerSection) playerSection.classList.remove('timeout-effect', 'active-turn');
    if (opponentSection) opponentSection.classList.remove('timeout-effect', 'active-turn');
    
    // Hide opponent score
    if (opponentScoreEl) {
        opponentScoreEl.style.display = 'none';
    }
    
    // Signal ready to server
    socket.emit('player-ready', { roomPin: gameState.roomPin });
    
    console.log('Reset game and waiting for players to be ready');


// Enable/disable game controls
function setControlsEnabled(enabled) {
    console.log('Setting controls enabled:', enabled);
    
    if (hitButton && standButton) {
        hitButton.disabled = !enabled;
        standButton.disabled = !enabled;
        
        // Add/remove active class for visual feedback
        if (enabled) {
            hitButton.classList.add('active-button');
            standButton.classList.add('active-button');
            console.log('Controls activated');
        } else {
            hitButton.classList.remove('active-button');
            standButton.classList.remove('active-button');
            console.log('Controls deactivated');
        }
    } else {
        console.error('Hit or stand buttons not found');
    }
}

// Update turn indicator
function updateTurnIndicator() {
    const playerSection = document.querySelector('.player-section');
    const opponentSection = document.querySelector('.opponent-section');
    
    if (playerSection && opponentSection) {
        // Remove active indicators
        playerSection.classList.remove('active-turn');
        opponentSection.classList.remove('active-turn');
        
        // Add active indicator to current player
        if (gameState.currentTurn === socket.id) {
            playerSection.classList.add('active-turn');
        } else if (gameState.currentTurn === gameState.opponentId) {
            opponentSection.classList.add('active-turn');
        }
    }
}

// Update card displays with animation
function updateCardDisplays(showAll = false) {
    console.log("Updating card displays...");
    
    // Ensure game elements are initialized
    if (!initializeGameElements()) {
        console.error('Failed to initialize game elements for card display update');
        return;
    }
    
    // Log the current game state
    console.log("Current game state:", {
        playerCards: gameState.playerCards,
        opponentId: gameState.opponentId,
        currentPlayer: gameState.currentPlayer
    });
    
    // Clear existing cards
    opponentCardsEl.innerHTML = '';
    playerCardsEl.innerHTML = '';
    
    // Make sure the card containers are visible
    opponentCardsEl.style.display = 'flex';
    playerCardsEl.style.display = 'flex';
    
    // Create opponent cards (shown in opponent section)
    if (gameState.playerCards && gameState.playerCards[gameState.opponentId] && gameState.playerCards[gameState.opponentId].length > 0) {
        // Add each opponent card
        gameState.playerCards[gameState.opponentId].forEach((card, index) => {
            try {
                const cardEl = createCardElement(card, !showAll && index > 0);
                opponentCardsEl.appendChild(cardEl);
                console.log(`Opponent card ${index} added:`, card);
            } catch (error) {
                console.error(`Error creating opponent card ${index}:`, error);
            }
        });
    } else {
        console.log("No opponent cards to display");
        // Add empty state message
        const emptyStateEl = document.createElement('div');
        emptyStateEl.textContent = 'Waiting for cards...';
        emptyStateEl.style.color = 'white';
        emptyStateEl.style.fontStyle = 'italic';
        emptyStateEl.style.padding = '20px';
        opponentCardsEl.appendChild(emptyStateEl);
    }
    
    // Create player cards
    if (gameState.playerCards && gameState.playerCards[socket.id] && gameState.playerCards[socket.id].length > 0) {
        // Add each player card
        gameState.playerCards[socket.id].forEach((card, index) => {
            try {
                const cardEl = createCardElement(card, false); // Player always sees their own cards
                playerCardsEl.appendChild(cardEl);
                console.log(`Player card ${index} added:`, card);
            } catch (error) {
                console.error(`Error creating player card ${index}:`, error);
            }
        });
    } else {
        console.log("No player cards to display");
        // Add empty state message
        const emptyStateEl = document.createElement('div');
        emptyStateEl.textContent = 'Waiting for cards...';
        emptyStateEl.style.color = 'white';
        emptyStateEl.style.fontStyle = 'italic';
        emptyStateEl.style.padding = '20px';
        playerCardsEl.appendChild(emptyStateEl);
    }
    
    // Update scores directly
    // Update opponent score
    if (opponentScoreEl) {
        opponentScoreEl.textContent = gameState.opponentScore;
    }
    
    if (playerScoreEl) {
        playerScoreEl.textContent = gameState.playerScore;
    }
}

// Create a super simple card element that will definitely display
function createCardElement(card, isHidden = false) {
    console.log('Creating card with:', card, 'isHidden:', isHidden);
    
    // Validate card object
    if (!card) {
        console.error('Invalid card object');
        card = { suit: '♠', value: '', displayValue: '' };
    }
    
    // Create the card element
    const cardEl = document.createElement('div');
    
    // Apply styles directly to ensure visibility
    cardEl.style.width = '120px';
    cardEl.style.height = '180px';
    cardEl.style.backgroundColor = isHidden ? '#6c757d' : 'white';
    cardEl.style.color = 'black';
    cardEl.style.borderRadius = '10px';
    cardEl.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.5)';
    cardEl.style.margin = '10px';
    cardEl.style.display = 'flex';
    cardEl.style.flexDirection = 'column';
    cardEl.style.justifyContent = 'center';
    cardEl.style.alignItems = 'center';
    cardEl.style.position = 'relative';
    cardEl.style.border = '2px solid black';
    cardEl.style.fontSize = '20px';
    cardEl.style.fontWeight = 'bold';
    
    // If card is hidden, just show back of card with the new checkerboard pattern
    if (isHidden) {
        // Remove any existing background color
        cardEl.style.backgroundColor = '#181212';
        cardEl.style.borderRadius = '2px';
        
        // Apply the checkerboard pattern
        cardEl.style.backgroundImage = `
            linear-gradient(45deg, #aa0000 25%, transparent 25%),
            linear-gradient(-45deg, #aa0000 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #aa0000 75%),
            linear-gradient(-45deg, transparent 75%, #aa0000 75%)
        `;
        cardEl.style.backgroundSize = '20px 20px';
        cardEl.style.backgroundPosition = '0 0, 0 10px, 10px -10px, -10px 0px';
        
        return cardEl;
    }
    
    // Get card properties with fallbacks
    const suit = card.suit || '♠';
    const displayValue = card.displayValue || '';
    const value = card.value || '';
    
    // Set text color based on suit
    const textColor = ['♥', '♦'].includes(suit) ? 'red' : 'black';
    
    // Create card content
    const valueText = document.createElement('div');
    valueText.style.fontSize = '24px';
    valueText.style.color = textColor;
    valueText.style.textAlign = 'center';
    valueText.style.padding = '10px';
    valueText.textContent = displayValue + suit;
    
    // Create value indicator
    const valueIndicator = document.createElement('div');
    valueIndicator.style.position = 'absolute';
    valueIndicator.style.top = '5px';
    valueIndicator.style.left = '5px';
    valueIndicator.style.fontSize = '16px';
    valueIndicator.style.color = textColor;
    valueIndicator.textContent = value + suit;
    
    // Add elements to card
    cardEl.appendChild(valueIndicator);
    cardEl.appendChild(valueText);
    
    
    return cardEl;
}

// Update score displays
function updateScores() {
    console.log('Updating scores:', {
        playerScore: gameState.playerScore,
        opponentScore: gameState.opponentScore,
        gameActive: gameState.gameActive
    });
    
    // Only show player score during gameplay
    const playerScoreToDisplay = gameState.gameActive ? '' : gameState.playerScore;
    
    // Update player score
    if (playerScoreEl) {
        playerScoreEl.textContent = playerScoreToDisplay;
        console.log('Updated player score display');
    } else {
        console.error('Player score element not found');
        // Try to find it by selector as fallback
        const scoreEl = document.getElementById('player-score');
        if (scoreEl) {
            scoreEl.textContent = playerScoreToDisplay;
            console.log('Updated player score via fallback');
            // Save reference for future updates
            playerScoreEl = scoreEl;
        }
    }
    
    // For opponent score, we'll handle it in the handleGameOver function
    // since we're using display:none/block instead of changing the content
    if (opponentScoreEl && !gameState.gameActive) {
        // Only update the content if the game is over
        opponentScoreEl.textContent = gameState.opponentScore;
        opponentScoreEl.style.display = 'block';
    } else if (opponentScoreEl) {
        opponentScoreEl.style.display = 'none';
    }
}


// Play button sound (if available)
function playButtonSound() {
    const sound = document.getElementById('buttonClickSound');
    if (sound) {
        sound.currentTime = 0; // Reset sound to start
        sound.volume = 0.5; // Set volume to 50%
        sound.play().catch(e => console.log('Sound play error:', e));
    }
}

// Add some CSS for turn indication
const style = document.createElement('style');
style.textContent = `
    .active-turn {
        box-shadow: 0 0 15px 5px rgba(255, 215, 0, 0.7);
        transition: box-shadow 0.3s ease;
    }
    
    .dealer-section, .player-section {
        padding: 15px;
        border-radius: 10px;
        transition: all 0.3s ease;
    }
`;
document.head.appendChild(style);