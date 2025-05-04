    // Math symbols to use
    const symbols = ['+', '-', '×', '÷', '=', '%', '∑', '∫', 'π', '√'];

    // Function to create a random math symbol
    function createMathSymbol() {
        const symbol = document.createElement('div');
        symbol.className = 'math-symbol';
        symbol.textContent = symbols[Math.floor(Math.random() * symbols.length)];

        // Random starting position
        const startX = Math.random() * window.innerWidth;
        const startY = Math.random() * window.innerHeight;
        symbol.style.left = `${startX}px`;
        symbol.style.top = `${startY}px`;

        // Random size
        const size = Math.random() * 2 + 0.5; // 1-3rem
        symbol.style.fontSize = `${size}rem`;

        // Random movement direction and rotation
        const moveX = (Math.random() - 0.5) * 200;
        const moveY = (Math.random() - 0.5) * 200;
        const rotate = Math.random() * 720 - 360; // -360 to 360 degrees

        symbol.style.setProperty('--move-x', `${moveX}px`);
        symbol.style.setProperty('--move-y', `${moveY}px`);
        symbol.style.setProperty('--rotate', `${rotate}deg`);

        // Random animation duration
        const duration = Math.random() * 15 + 10; // 10-25s
        symbol.style.animationDuration = `${duration}s`;

        // Random delay
        const delay = Math.random() * 5;
        symbol.style.animationDelay = `${delay}s`;

        document.body.appendChild(symbol);

        // Remove the symbol after animation completes
        setTimeout(() => {
            symbol.remove();
        }, (duration + delay) * 1000);
    }

    for (let i = 0; i < 20; i++) {
        createMathSymbol();
    }


    setInterval(createMathSymbol, 500);