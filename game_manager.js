// game_manager.js - Server-side game logic for MathJack multiplayer
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

class GameManager {
    constructor() {
        // Map to store games by room PIN
        this.games = new Map();
    }

    // Create a new game for a room
    createGame(roomPin, players) {
        const gameState = {
            roomPin,
            players: players.map(p => p.id),
            playerNames: players.reduce((obj, p) => {
                obj[p.id] = p.name;
                return obj;
            }, {}),
            deck: [],
            dealerCards: [],
            playerCards: {}, // Map of player ID to their cards
            scores: {}, // Map of player ID to their score
            dealerScore: 0,
            gameActive: false,
            currentTurn: null,
            readyPlayers: new Set(),
            gameStarted: false,
            playerStayed: {}, // Track if a player has chosen to stay
            winCounts: {} // Track win counts for each player
        };

        // Initialize player cards
        players.forEach(player => {
            gameState.playerCards[player.id] = [];
            gameState.scores[player.id] = 0;
        });

        // Create and shuffle deck
        this.createDeck(gameState);
        
        // Store game
        this.games.set(roomPin, gameState);
        
        return gameState;
    }

    // Create a deck of cards
    createDeck(gameState = null) {
        console.log('Creating a new deck of cards');
        const deck = [];
        // Create a single deck for multiplayer (can increase later if needed)
        for (let suit of suits) {
            for (let value of values) {
                // For each value, get a random expression that equals that value
                const expressions = mathExpressions[value];
                const randomExpression = expressions[Math.floor(Math.random() * expressions.length)];
                
                // Convert value to numeric value for scoring
                let numericValue;
                if (value === 'A') {
                    numericValue = 11;
                } else if (['J', 'Q', 'K'].includes(value)) {
                    numericValue = 10;
                } else {
                    numericValue = parseInt(value, 10);
                }
                
                deck.push({
                    suit,
                    value, // Keep original value for game logic
                    displayValue: randomExpression, // Use math expression for display
                    numericValue, // Add numeric value for scoring
                    hidden: false // Default to not hidden
                });
            }
        }
        
        console.log(`Created deck with ${deck.length} cards`);
        
        // Shuffle the deck
        this.shuffleDeck(deck);
        
        // If gameState is provided, update its deck property
        if (gameState) {
            gameState.deck = deck;
            console.log(`Updated gameState deck with ${deck.length} cards`);
            return;
        }
        
        // Otherwise return the deck
        return deck;
    }

    // Shuffle the deck
    shuffleDeck(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }

    // Mark a player as ready
    playerReady(roomPin, playerId) {
        const gameState = this.games.get(roomPin);
        if (!gameState) return null;

        gameState.readyPlayers.add(playerId);

        // Check if all players are ready
        return gameState.readyPlayers.size === gameState.players.length;
    }

    // Start the game
    startGame(roomPin) {
        const gameState = this.games.get(roomPin);
        if (!gameState) return null;

        gameState.players.forEach(playerId => {
            // Clear any existing cards
            gameState.playerCards[playerId] = [];
            gameState.scores[playerId] = 0;
            // Initialize player stayed status to false
            gameState.playerStayed[playerId] = false;
        });
        gameState.dealerScore = 0;
        gameState.gameActive = true;
        gameState.gameStarted = true;

        // Deal initial cards to each player
        gameState.players.forEach(playerId => {
            // Deal two cards to each player - first card is visible
            gameState.playerCards[playerId].push(this.drawCard(gameState));
            // Second card is hidden from opponents
            gameState.playerCards[playerId].push(this.drawCard(gameState, true));
            
            // Calculate initial score
            gameState.scores[playerId] = this.calculateScore(gameState.playerCards[playerId]);
        });
        
        // Set first player's turn randomly
        const randomIndex = Math.floor(Math.random() * gameState.players.length);
        gameState.currentTurn = gameState.players[randomIndex];
        
        return gameState;
    }

    // Draw a card from the deck
    drawCard(gameState, hidden = false) {
        // Check if we need to create a new deck
        if (!gameState.deck || gameState.deck.length === 0) {
            console.log('Deck is empty, creating a new one');
            // If deck is empty, create and shuffle a new deck
            this.createDeck(gameState);
        }
        
        // Make sure we have cards in the deck
        if (!gameState.deck || gameState.deck.length === 0) {
            console.error('Failed to create deck, creating a random card as fallback');
            
            // Create a fallback card with a random value if deck creation failed
            const randomSuit = suits[Math.floor(Math.random() * suits.length)];
            const randomValue = values[Math.floor(Math.random() * values.length)];
            const expressions = mathExpressions[randomValue];
            const randomExpression = expressions[Math.floor(Math.random() * expressions.length)];
            
            // Calculate numeric value
            let numericValue;
            if (randomValue === 'A') {
                numericValue = 11;
            } else if (['J', 'Q', 'K'].includes(randomValue)) {
                numericValue = 10;
            } else {
                numericValue = parseInt(randomValue, 10);
            }
            
            return {
                suit: randomSuit,
                value: randomValue,
                displayValue: randomExpression,
                numericValue: numericValue,
                hidden: hidden
            };
        }
        
        // Draw the top card
        const card = gameState.deck.pop();
        console.log('Drew card:', card);
        
        // Mark as hidden if needed
        if (hidden && card) {
            card.hidden = true;
        }
        
        return card;
    }

    // Calculate score for a hand
    calculateScore(cards) {
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

        // Adjust for aces if over 21
        while (score > 21 && aces > 0) {
            score -= 10;
            aces--;
        }

        return score;
    }

    // Player hits (takes a card)
    playerHit(roomPin, playerId) {
        const gameState = this.games.get(roomPin);
        if (!gameState || !gameState.gameActive || gameState.currentTurn !== playerId) return null;

        // Draw a card for the player
        const card = this.drawCard(gameState);
        if (!card) return null;

        gameState.playerCards[playerId].push(card);
        
        // Calculate new score
        gameState.scores[playerId] = this.calculateScore(gameState.playerCards[playerId]);

        // Check if player busted (score > 21)
        if (gameState.scores[playerId] > 21) {
            gameState.gameActive = false;
            return gameState;
        }

        // Reset any previous 'stay' decision when hitting
        gameState.playerStayed[playerId] = false;

        // Move to next player's turn
        this.nextPlayerTurn(gameState);
        
        return gameState;
    }

    // Player stands
    playerStand(roomPin, playerId) {
        const gameState = this.games.get(roomPin);
        if (!gameState || !gameState.gameActive || gameState.currentTurn !== playerId) return null;

        // Mark this player as stayed
        gameState.playerStayed[playerId] = true;

        // Check if all players have chosen to stay
        const allPlayerStayed = gameState.players.every(player => gameState.playerStayed[player]);

        if (allPlayerStayed) {
            // End the game if all players have chosen to stay
            gameState.gameActive = false;
            // Determine the winner
            const scores = gameState.scores;
            let winner = null;
            let highestScore = -1;

            // Find the highest score that doesn't exceed 21
            for (const player of gameState.players) {
                const score = scores[player];
                if (score <= 21 && score > highestScore) {
                    highestScore = score;
                    winner = player;
                }
            }

            gameState.winner = winner;
            return gameState;
        }

        // Move to next player's turn if not all players have stayed
        this.nextPlayerTurn(gameState);
        return gameState;
    }

    // Move to next player's turn
    nextPlayerTurn(gameState) {
        if (!gameState || !gameState.players || !gameState.currentTurn) return;
        
        const currentIndex = gameState.players.indexOf(gameState.currentTurn);
        if (currentIndex === -1) return;
        
        // Get the next player in the array (cycling back to the beginning if needed)
        const nextIndex = (currentIndex + 1) % gameState.players.length;
        gameState.currentTurn = gameState.players[nextIndex];
    }

    // Determine game results
    determineResults(gameState) {
        const results = {};
        const scores = {};
        let winner = null;
        
        // Get all player scores
        gameState.players.forEach(playerId => {
            scores[playerId] = gameState.scores[playerId];
        });
        
        // Check if both players have chosen to stay
        const bothPlayerStayed = gameState.players.every(player => gameState.playerStayed[player]);
        
        // Find the winner
        let maxScore = 0;
        let winners = [];
        
        // First check for busts
        const validPlayers = gameState.players.filter(playerId => scores[playerId] <= 21);
        
        if (validPlayers.length === 0) {
            // All players busted
            gameState.players.forEach(playerId => {
                results[playerId] = "Everyone busted! It's a draw.";
            });
        } else {
            // Find highest score among valid players
            validPlayers.forEach(playerId => {
                if (scores[playerId] > maxScore) {
                    maxScore = scores[playerId];
                    winners = [playerId];
                } else if (scores[playerId] === maxScore) {
                    winners.push(playerId);
                }
            });
            
            // Assign results
            gameState.players.forEach(playerId => {
                if (scores[playerId] > 21) {
                    results[playerId] = "You busted! Your sum went over 21.";
                } else if (winners.includes(playerId)) {
                    if (winners.length === 1) {
                        results[playerId] = "You win! +1 point";
                        winner = playerId;
                        
                        // Update win counts
                        gameState.winCounts[playerId] = (gameState.winCounts[playerId] || 0) + 1;
                    } else {
                        results[playerId] = "It's a tie!";
                    }
                } else {
                    results[playerId] = "You lose! Opponent had a better hand.";
                }
            });
        }
        
        return results;
    }

    // Get game state for a specific player
    getGameStateForPlayer(roomPin, playerId) {
        const gameState = this.games.get(roomPin);
        if (!gameState) return null;

        // Find opponent ID
        const opponentId = gameState.players.find(id => id !== playerId);
        
        // Prepare player cards to send
        const playerCardsToSend = {};
        
        // Player's own cards (all visible to them)
        if (gameState.playerCards[playerId] && Array.isArray(gameState.playerCards[playerId])) {
            playerCardsToSend[playerId] = gameState.playerCards[playerId].map(card => ({
                suit: card.suit,
                value: card.value,
                displayValue: card.displayValue,
                hidden: false // Player sees all their own cards
            }));
        } else {
            playerCardsToSend[playerId] = [];
        }
        
        // Opponent's cards (hidden cards stay hidden until game is over)
        if (opponentId && gameState.playerCards[opponentId] && Array.isArray(gameState.playerCards[opponentId])) {
            playerCardsToSend[opponentId] = gameState.playerCards[opponentId].map(card => {
                // If game is over, reveal all cards
                // If game is not active (game over), reveal all cards
                // Otherwise, respect the hidden property of the card
                const isHidden = card.hidden && gameState.gameActive;
                return {
                    suit: card.suit,
                    value: isHidden ? '' : card.value, // Hide value if card is hidden and game is active
                    displayValue: isHidden ? '' : card.displayValue, // Hide display value if card is hidden and game is active
                    hidden: isHidden // This will be false when game is over, revealing all cards
                };
            });
        } else if (opponentId) {
            playerCardsToSend[opponentId] = [];
        }
        
        return {
            roomPin: gameState.roomPin,
            deck: gameState.deck.length, // Just send the count of remaining cards
            playerCards: playerCardsToSend,
            scores: gameState.scores,
            gameActive: gameState.gameActive,
            currentTurn: gameState.currentTurn,
            opponentId: opponentId,
            playerNames: gameState.playerNames,
            playerStayed: gameState.playerStayed, // Include player stayed status
            winCounts: gameState.winCounts, // Include win counts
            result: !gameState.gameActive ? this.determineResults(gameState)[playerId] : null
        };
    }

    // Get the next player in turn
    getNextPlayer(gameState, currentPlayerId) {
        if (!gameState || !gameState.players || gameState.players.length < 2) {
            return null;
        }
        
        // Find the index of the current player
        const currentIndex = gameState.players.indexOf(currentPlayerId);
        if (currentIndex === -1) {
            return null;
        }
        
        // Get the next player in the array (cycling back to the beginning if needed)
        const nextIndex = (currentIndex + 1) % gameState.players.length;
        return gameState.players[nextIndex];
    }

    // Mark a player as ready
    playerReady(roomPin, playerId) {
        const gameState = this.games.get(roomPin);
        if (!gameState) return false;
        
        // Mark this player as ready
        gameState.readyPlayers.add(playerId);
        
        // Check if all players are ready
        return gameState.readyPlayers.size === gameState.players.length;
    }

    // Reset the game for a new round
    resetGame(roomPin) {
        const gameState = this.games.get(roomPin);
        if (!gameState) return null;

        // Save win counts before reset
        const winCounts = gameState.winCounts || {};
        
        // Reset ready players
        gameState.readyPlayers = new Set();
        gameState.gameStarted = false;
        gameState.gameActive = false;
        gameState.currentTurn = null;
        gameState.turnStartTime = null;
        if (gameState.turnTimer) {
            clearTimeout(gameState.turnTimer);
            gameState.turnTimer = null;
        }
        
        // Clear player cards and scores
        gameState.players.forEach(playerId => {
            gameState.playerCards[playerId] = [];
            gameState.scores[playerId] = 0;
            // Reset player stayed status to false
            gameState.playerStayed[playerId] = false;
        });
        
        // Reset and shuffle the deck
        gameState.deck = this.createDeck();
        this.shuffleDeck(gameState.deck);
        
        // Restore win counts
        gameState.winCounts = winCounts;
        
        console.log('Game reset complete. Game state:', {
            gameActive: gameState.gameActive,
            players: gameState.players.length,
            readyPlayers: gameState.readyPlayers.size,
            deck: gameState.deck.length,
            winCounts
        });

        return gameState;
    }

    // Shuffle the deck
    shuffleDeck(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }
}

module.exports = GameManager;