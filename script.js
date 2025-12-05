// Data Storage Keys
const STORAGE_KEYS = {
    PLAYERS: 'insider_players',
    PLAYER_GROUPS: 'insider_player_groups',
    WORDS: 'insider_words',
    SCORES: 'insider_scores',
    CURRENT_GAME: 'insider_current_game',
    LAST_RESET: 'insider_last_reset',
    LANGUAGE: 'insider_language',
    USED_WORDS: 'insider_used_words'
};

// Current language
let currentLanguage = 'en';

// Game State
let currentGame = null;
let selectedGroupId = null;
let currentEditingGroupId = null;

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();

    // Load language preference
    const savedLanguage = localStorage.getItem(STORAGE_KEYS.LANGUAGE);
    if (savedLanguage && (savedLanguage === 'th' || savedLanguage === 'en')) {
        currentLanguage = savedLanguage;
    }

    // Apply translations
    applyTranslations();

    // Set selected group from current game if available
    if (currentGame && currentGame.groupId) {
        selectedGroupId = currentGame.groupId;
    }

    // Always show home screen on load
    showScreen('homeScreen');

    renderGroups();
    renderWords();
    updateGroupSelection();
    updateScoreboard('game');
    updateLastResetDate();
});

// ==================== DATA MANAGEMENT ====================

async function loadData() {
    // Load player groups
    if (!localStorage.getItem(STORAGE_KEYS.PLAYER_GROUPS)) {
        localStorage.setItem(STORAGE_KEYS.PLAYER_GROUPS, JSON.stringify([]));
    }

    // Load words from words.js into localStorage
    try {
        const wordsModule = await import('./words.js');
        const allWordsFromFile = [
            ...wordsModule.marine_animals,
            ...wordsModule.land_animals,
            ...wordsModule.items,
            ...wordsModule.others
        ];

        // Get existing words from localStorage
        const existingWords = getWords();

        // Merge words from words.js with existing words (avoid duplicates)
        const mergedWords = [...existingWords];
        allWordsFromFile.forEach(word => {
            if (!mergedWords.includes(word)) {
                mergedWords.push(word);
            }
        });

        // Store merged words in localStorage
        localStorage.setItem(STORAGE_KEYS.WORDS, JSON.stringify(mergedWords));
    } catch (error) {
        console.error('Error loading words from words.js:', error);
        // Initialize empty if words.js fails to load
        if (!localStorage.getItem(STORAGE_KEYS.WORDS)) {
            localStorage.setItem(STORAGE_KEYS.WORDS, JSON.stringify([]));
        }
    }

    // Load scores
    if (!localStorage.getItem(STORAGE_KEYS.SCORES)) {
        localStorage.setItem(STORAGE_KEYS.SCORES, JSON.stringify([]));
    }

    // Load current game
    const savedGame = localStorage.getItem(STORAGE_KEYS.CURRENT_GAME);
    if (savedGame) {
        currentGame = JSON.parse(savedGame);
    }

    // Initialize used words tracking
    checkAndResetUsedWords();
}

function saveData() {
    if (currentGame) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_GAME, JSON.stringify(currentGame));
    }
}

// ==================== PLAYER GROUP MANAGEMENT ====================

function getGroups() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAYER_GROUPS));
}

function saveGroups(groups) {
    localStorage.setItem(STORAGE_KEYS.PLAYER_GROUPS, JSON.stringify(groups));
}

function addGroup() {
    const input = document.getElementById('groupNameInput');
    const name = input.value.trim();

    if (!name) {
        alert('Please enter a group name');
        return;
    }

    const groups = getGroups();
    if (groups.some(g => g.name.toLowerCase() === name.toLowerCase())) {
        alert('Group already exists');
        return;
    }

    groups.push({
        id: Date.now(),
        name: name,
        players: []
    });
    saveGroups(groups);
    input.value = '';
    renderGroups();
}

function updateGroup(groupId) {
    const groups = getGroups();
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const newName = prompt('Enter new group name:', group.name);
    if (newName && newName.trim()) {
        group.name = newName.trim();
        saveGroups(groups);
        renderGroups();
        updateGroupSelection();
    }
}

function deleteGroup(groupId) {
    if (confirm('Are you sure you want to delete this group? All players in this group will also be deleted.')) {
        const groups = getGroups();
        const index = groups.findIndex(g => g.id === groupId);
        if (index !== -1) {
            groups.splice(index, 1);
            saveGroups(groups);
            renderGroups();

            // Clear selection if deleted group was selected
            if (selectedGroupId === groupId) {
                selectedGroupId = null;
                const dropdown = document.getElementById('groupDropdown');
                if (dropdown) {
                    dropdown.value = '';
                }
            }

            updateGroupSelection();

            if (currentEditingGroupId === groupId) {
                currentEditingGroupId = null;
                document.getElementById('playersInGroupSection').style.display = 'none';
            }

            // Update scoreboard
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab) {
                const tabText = activeTab.textContent.trim();
                if (tabText === 'Current Game') {
                    updateScoreboard('game');
                } else if (tabText === 'Today') {
                    updateScoreboard('today');
                } else if (tabText === 'All Time') {
                    updateScoreboard('alltime');
                }
            }
        }
    }
}

function selectGroupForEditing(groupId) {
    currentEditingGroupId = groupId;
    const groups = getGroups();
    const group = groups.find(g => g.id === groupId);
    if (group) {
        const lang = translations[currentLanguage] || translations.en;
        const playersInText = lang['Players in'] || 'Players in';
        document.getElementById('currentGroupTitle').textContent = `${playersInText} "${group.name}"`;
        document.getElementById('playersInGroupSection').style.display = 'block';
        renderPlayersInGroup(groupId);
    }
}

function renderGroups() {
    const container = document.getElementById('groupsList');
    const groups = getGroups();

    if (groups.length === 0) {
        container.innerHTML = '<div class="empty-state">No groups added yet. Create a group to add players.</div>';
        return;
    }

    container.innerHTML = groups.map(group => `
        <div class="list-item">
            <span><strong>${group.name}</strong> (${group.players.length} players)</span>
            <div class="list-item-actions">
                <button class="btn-edit" onclick="selectGroupForEditing(${group.id})">Edit Players</button>
                <button class="btn-edit" onclick="updateGroup(${group.id})">Rename</button>
                <button class="btn-delete" onclick="deleteGroup(${group.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

function addPlayerToGroup() {
    if (!currentEditingGroupId) {
        alert('Please select a group first');
        return;
    }

    const input = document.getElementById('playerNameInput');
    const name = input.value.trim();

    if (!name) {
        alert('Please enter a player name');
        return;
    }

    const groups = getGroups();
    const group = groups.find(g => g.id === currentEditingGroupId);
    if (!group) return;

    if (group.players.some(p => p.toLowerCase() === name.toLowerCase())) {
        alert('Player already exists in this group');
        return;
    }

    group.players.push(name);
    saveGroups(groups);
    input.value = '';
    renderPlayersInGroup(currentEditingGroupId);
    renderGroups();
}

function updatePlayerInGroup(index) {
    if (!currentEditingGroupId) return;

    const groups = getGroups();
    const group = groups.find(g => g.id === currentEditingGroupId);
    if (!group) return;

    const newName = prompt('Enter new name:', group.players[index]);
    if (newName && newName.trim()) {
        group.players[index] = newName.trim();
        saveGroups(groups);
        renderPlayersInGroup(currentEditingGroupId);
        renderGroups();
    }
}

function deletePlayerInGroup(index) {
    if (!currentEditingGroupId) return;

    if (confirm('Are you sure you want to delete this player?')) {
        const groups = getGroups();
        const group = groups.find(g => g.id === currentEditingGroupId);
        if (group) {
            group.players.splice(index, 1);
            saveGroups(groups);
            renderPlayersInGroup(currentEditingGroupId);
            renderGroups();
        }
    }
}

function renderPlayersInGroup(groupId) {
    const container = document.getElementById('playersList');
    const groups = getGroups();
    const group = groups.find(g => g.id === groupId);

    if (!group || group.players.length === 0) {
        container.innerHTML = '<div class="empty-state">No players in this group yet</div>';
        return;
    }

    container.innerHTML = group.players.map((player, index) => `
        <div class="list-item">
            <span>${player}</span>
            <div class="list-item-actions">
                <button class="btn-edit" onclick="updatePlayerInGroup(${index})">Edit</button>
                <button class="btn-delete" onclick="deletePlayerInGroup(${index})">Delete</button>
            </div>
        </div>
    `).join('');
}

function updateGroupSelection() {
    const groups = getGroups();
    const dropdown = document.getElementById('groupDropdown');
    const lang = translations[currentLanguage] || translations.en;

    // Clear existing options except the first one
    const placeholderText = lang['-- Select a group --'] || '-- Select a group --';
    dropdown.innerHTML = `<option value="" data-i18n="-- Select a group --">${placeholderText}</option>`;

    // Add groups to dropdown
    groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = `${group.name} (${group.players.length} players)`;
        if (selectedGroupId === group.id) {
            option.selected = true;
        }
        dropdown.appendChild(option);
    });

    // Show/hide dropdown container based on whether groups exist
    const container = document.querySelector('.group-dropdown-container');
    if (groups.length === 0) {
        container.style.display = 'none';
    } else {
        container.style.display = 'block';
    }
}

function selectGroupFromDropdown(groupId) {
    if (groupId === '') {
        selectedGroupId = null;
        // Hide players section if no group selected
        document.getElementById('playersInGroupSection').style.display = 'none';
        currentEditingGroupId = null;
    } else {
        selectedGroupId = parseInt(groupId);
        // If on Players tab, automatically show players for selected group
        const playersTab = document.getElementById('playersTabContent');
        if (playersTab && playersTab.classList.contains('active')) {
            selectGroupForEditing(selectedGroupId);
        }
    }

    // Update scoreboard to show scores for selected group
    // Find the active scoreboard tab button
    const activeScoreboardTab = document.querySelector('.scoreboard-tabs .tab-btn.active');
    if (activeScoreboardTab) {
        const tabText = activeScoreboardTab.textContent.trim();
        if (tabText === 'Current Game') {
            updateScoreboard('game');
        } else if (tabText === 'Today') {
            updateScoreboard('today');
        } else if (tabText === 'All Time') {
            updateScoreboard('alltime');
        } else {
            // Default to 'game' if text doesn't match
            updateScoreboard('game');
        }
    } else {
        // If no scoreboard tab is active, check if we're on main tab and update default
        const mainTabContent = document.getElementById('mainTabContent');
        if (mainTabContent && mainTabContent.classList.contains('active')) {
            // Default to 'game' if on main tab but no scoreboard tab selected
            updateScoreboard('game');
        }
    }
}

// ==================== WORD MANAGEMENT ====================

function getWords() {
    const words = localStorage.getItem(STORAGE_KEYS.WORDS);
    return words ? JSON.parse(words) : [];
}

// ==================== USED WORDS TRACKING ====================

function checkAndResetUsedWords() {
    const today = new Date().toISOString().split('T')[0];
    const usedWordsData = localStorage.getItem(STORAGE_KEYS.USED_WORDS);

    if (!usedWordsData) {
        // Initialize with today's date
        localStorage.setItem(STORAGE_KEYS.USED_WORDS, JSON.stringify({
            date: today,
            words: []
        }));
        return;
    }

    const data = JSON.parse(usedWordsData);

    // If it's a new day, reset the used words list
    if (data.date !== today) {
        localStorage.setItem(STORAGE_KEYS.USED_WORDS, JSON.stringify({
            date: today,
            words: []
        }));
    }
}

function getUsedWordsToday() {
    checkAndResetUsedWords();
    const data = JSON.parse(localStorage.getItem(STORAGE_KEYS.USED_WORDS));
    return data.words || [];
}

function markWordAsUsed(word) {
    checkAndResetUsedWords();
    const data = JSON.parse(localStorage.getItem(STORAGE_KEYS.USED_WORDS));

    // Add word if not already in the list
    if (!data.words.includes(word)) {
        data.words.push(word);
        localStorage.setItem(STORAGE_KEYS.USED_WORDS, JSON.stringify(data));
    }
}

function getAvailableWords() {
    const allWords = getWords();
    const usedWords = getUsedWordsToday();

    // Return words that haven't been used today
    return allWords.filter(word => !usedWords.includes(word));
}

function saveWords(words) {
    localStorage.setItem(STORAGE_KEYS.WORDS, JSON.stringify(words));
}

function addWord() {
    const input = document.getElementById('wordInput');
    const word = input.value.trim();

    if (!word) {
        alert('Please enter a word');
        return;
    }

    const words = getWords();
    if (words.some(w => w.toLowerCase() === word.toLowerCase())) {
        alert('Word already exists');
        return;
    }

    words.push(word);
    saveWords(words);
    input.value = '';
    renderWords();
}

function deleteWord(index) {
    if (confirm('Are you sure you want to delete this word?')) {
        const words = getWords();
        words.splice(index, 1);
        saveWords(words);
        renderWords();
    }
}

function renderWords() {
    const container = document.getElementById('wordsList');
    const words = getWords();

    if (words.length === 0) {
        container.innerHTML = '<div class="empty-state">No words added yet</div>';
        return;
    }

    container.innerHTML = words.map((word, index) => `
        <div class="list-item">
            <span>${word}</span>
            <div class="list-item-actions">
                <button class="btn-delete" onclick="deleteWord(${index})">Delete</button>
            </div>
        </div>
    `).join('');
}

// ==================== TAB MANAGEMENT ====================

function showMainTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.main-tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    // Show/hide tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tabName === 'main') {
        document.getElementById('mainTabContent').classList.add('active');
    } else if (tabName === 'words') {
        document.getElementById('wordsTabContent').classList.add('active');
    } else if (tabName === 'players') {
        document.getElementById('playersTabContent').classList.add('active');
        // If a group is selected, show its players
        if (selectedGroupId) {
            selectGroupForEditing(selectedGroupId);
        } else {
            document.getElementById('playersInGroupSection').style.display = 'none';
        }
    } else if (tabName === 'statistics') {
        document.getElementById('statisticsTabContent').classList.add('active');
    }
}

// ==================== GAME MANAGEMENT ====================

async function startGame() {
    const groups = getGroups();

    // Check if group is selected
    if (!selectedGroupId) {
        alert('Please select a player group first');
        return;
    }

    const selectedGroup = groups.find(g => g.id === selectedGroupId);
    if (!selectedGroup) {
        alert('Selected group not found');
        return;
    }

    const players = selectedGroup.players;

    if (players.length < 3) {
        alert('You need at least 3 players in the selected group to start a game');
        return;
    }

    // Check for custom word input
    const customWordInput = document.getElementById('customWordInput');
    let selectedWord = null;

    if (customWordInput && customWordInput.value.trim()) {
        // Use custom word if provided
        selectedWord = customWordInput.value.trim();
        // Clear the input for next time
        customWordInput.value = '';
    } else {
        // Get random word from words.js
        try {
            const wordsModule = await import('./words.js');
            const allWordsFromFile = [
                ...wordsModule.marine_animals,
                ...wordsModule.land_animals,
                ...wordsModule.items,
                ...wordsModule.others
            ];

            if (allWordsFromFile.length === 0) {
                alert('No words available in words.js');
                return;
            }

            // Select random word from words.js
            const randomWordIndex = Math.floor(Math.random() * allWordsFromFile.length);
            selectedWord = allWordsFromFile[randomWordIndex];
        } catch (error) {
            console.error('Error loading words from words.js:', error);
            // Fallback to localStorage words
            const availableWords = getAvailableWords();
            if (availableWords.length === 0) {
                const allWords = getWords();
                if (allWords.length === 0) {
                    alert('Please add at least one word');
                    return;
                } else {
                    alert('All words have been used today. Please wait until tomorrow or add more words.');
                    return;
                }
            }
            const randomWordIndex = Math.floor(Math.random() * availableWords.length);
            selectedWord = availableWords[randomWordIndex];
            markWordAsUsed(selectedWord);
        }
    }

    if (!selectedWord) {
        alert('Unable to select a word. Please try again.');
        return;
    }

    // Select insiders (1 if <=6 players, 2 if >6 players)
    const numInsiders = players.length > 6 ? 2 : 1;
    const insiders = [];
    const availablePlayers = [...players];

    for (let i = 0; i < numInsiders; i++) {
        const randomIndex = Math.floor(Math.random() * availablePlayers.length);
        insiders.push(availablePlayers[randomIndex]);
        availablePlayers.splice(randomIndex, 1);
    }

    // Create game object
    currentGame = {
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        word: selectedWord,
        insiders: insiders,
        players: players,
        groupId: selectedGroupId,
        groupName: selectedGroup.name,
        rounds: []
    };

    saveData();

    // Show countdown
    showCountdown();
}

function showCountdown() {
    showScreen('countdownScreen');
    const countdownNumber = document.getElementById('countdownNumber');
    let count = 3;

    countdownNumber.textContent = count;

    const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownNumber.textContent = count;
        } else {
            clearInterval(countdownInterval);
            countdownNumber.textContent = 'GO!';
            setTimeout(() => {
                showScreen('gameScreen');
                renderGameScreen();
            }, 500);
        }
    }, 1000);
}

function renderGameScreen() {
    if (!currentGame) return;

    const wordElement = document.getElementById('currentWord');
    if (wordElement) {
        wordElement.textContent = currentGame.word || '-';
    }

    // Hide image container (removed image feature)
    const imgContainer = document.getElementById('wordImageContainer');
    if (imgContainer) {
        imgContainer.style.display = 'none';
    }

    // Render insiders
    const insidersContainer = document.getElementById('insidersList');
    if (insidersContainer && currentGame.insiders) {
        insidersContainer.innerHTML = currentGame.insiders.map(insider => `
            <div class="insider-badge">🎭 ${insider}</div>
        `).join('');
    }

    // Render players
    const playersContainer = document.getElementById('gamePlayersList');
    if (playersContainer && currentGame.players) {
        playersContainer.innerHTML = currentGame.players.map(player => `
            <div class="player-badge">${player}</div>
        `).join('');
    }
}

function endRound() {
    if (!currentGame) return;
    showScreen('endGameScreen');
}

function finishGame() {
    if (!currentGame) return;

    // Show final summary
    showGameSummary();
}

async function randomizeNewRound() {
    if (!currentGame) return false;

    const groups = getGroups();
    const selectedGroup = groups.find(g => g.id === currentGame.groupId);
    if (!selectedGroup) return false;

    const players = selectedGroup.players;

    // Get random word from words.js
    let selectedWord = null;
    try {
        const wordsModule = await import('./words.js');
        const allWordsFromFile = [
            ...wordsModule.marine_animals,
            ...wordsModule.land_animals,
            ...wordsModule.items,
            ...wordsModule.others
        ];

        if (allWordsFromFile.length === 0) {
            alert('No words available in words.js');
            return false;
        }

        // Select random word from words.js
        const randomWordIndex = Math.floor(Math.random() * allWordsFromFile.length);
        selectedWord = allWordsFromFile[randomWordIndex];
    } catch (error) {
        console.error('Error loading words from words.js:', error);
        alert('Unable to load words from words.js');
        return false;
    }

    if (!selectedWord) {
        alert('Unable to select a word. Please try again.');
        return false;
    }

    // Select new insiders (1 if <=6 players, 2 if >6 players)
    const numInsiders = players.length > 6 ? 2 : 1;
    const insiders = [];
    const availablePlayers = [...players];

    for (let i = 0; i < numInsiders; i++) {
        const randomIndex = Math.floor(Math.random() * availablePlayers.length);
        insiders.push(availablePlayers[randomIndex]);
        availablePlayers.splice(randomIndex, 1);
    }

    // Update current game with new word and insiders
    currentGame.word = selectedWord;
    currentGame.insiders = insiders;
    currentGame.players = players; // Update players list in case it changed

    saveData();
    return true;
}

function recordWin(winner) {
    if (!currentGame) return;

    // Record round
    const roundNumber = currentGame.rounds.length + 1;
    const roundData = {
        round: roundNumber,
        winner: winner,
        timestamp: new Date().toISOString()
    };
    currentGame.rounds.push(roundData);

    // Update scores
    updateScores(winner);

    // Save game state
    saveData();

    // Show round summary
    showRoundSummary(roundData);
}

function showRoundSummary(roundData) {
    if (!currentGame) return;

    const scores = JSON.parse(localStorage.getItem(STORAGE_KEYS.SCORES));
    const today = new Date().toISOString().split('T')[0];
    const groupId = currentGame.groupId;
    const gameScores = {};

    // Calculate current game scores (only for current group)
    scores.forEach(score => {
        if (score.groupId === groupId) {
            if (score.games && score.games[currentGame.id]) {
                gameScores[score.player] = score.games[currentGame.id];
            }
        }
    });

    // Sort by score
    const sortedGameScores = Object.entries(gameScores)
        .sort((a, b) => b[1] - a[1])
        .map(([player, score]) => ({ player, score }));

    // Count rounds by winner
    const roundsByWinner = {
        insiders: currentGame.rounds.filter(r => r.winner === 'insiders').length,
        players: currentGame.rounds.filter(r => r.winner === 'players').length
    };

    const winnerText = roundData.winner === 'insiders' ? 'Insiders' : 'Players';
    const content = `
        <div class="summary-item">
            <h3>Round ${roundData.round} Results</h3>
            <p><strong>Winner:</strong> ${winnerText}</p>
            <p><strong>Word Used:</strong> ${currentGame.word}</p>
            <p><strong>Insiders:</strong> ${currentGame.insiders.join(', ')}</p>
        </div>
        
        <div class="summary-item">
            <h3>Game Progress</h3>
            <p><strong>Total Rounds:</strong> ${currentGame.rounds.length}</p>
            <p><strong>Insiders Wins:</strong> ${roundsByWinner.insiders}</p>
            <p><strong>Players Wins:</strong> ${roundsByWinner.players}</p>
        </div>
        
        <div class="summary-item">
            <h3>Current Game Scores</h3>
            ${sortedGameScores.length > 0 ?
            sortedGameScores.map(item => `
                    <div class="score-item">
                        <span class="score-item-name">${item.player}</span>
                        <span class="score-item-value">${item.score} point${item.score !== 1 ? 's' : ''}</span>
                    </div>
                `).join('') :
            '<div class="empty-state">No scores yet</div>'
        }
        </div>
    `;

    document.getElementById('roundSummaryContent').innerHTML = content;
    showScreen('roundSummaryScreen');
}

function continueToNextRound() {
    if (!currentGame) return;

    // Randomize new word and insiders for next round
    const randomized = randomizeNewRound();

    if (!randomized) {
        // If randomization failed (e.g., no more words), show final summary instead
        showGameSummary();
        return;
    }

    // Save game state after randomization
    saveData();

    // Show countdown before next round
    showCountdown();
}

function updateScores(winner) {
    const scores = JSON.parse(localStorage.getItem(STORAGE_KEYS.SCORES));
    const today = new Date().toISOString().split('T')[0];
    const groupId = currentGame.groupId;

    if (winner === 'insiders') {
        currentGame.insiders.forEach(insider => {
            updatePlayerScore(scores, insider, today, currentGame.id, groupId);
        });
    } else {
        currentGame.players.forEach(player => {
            if (!currentGame.insiders.includes(player)) {
                updatePlayerScore(scores, player, today, currentGame.id, groupId);
            }
        });
    }

    localStorage.setItem(STORAGE_KEYS.SCORES, JSON.stringify(scores));
}

function updatePlayerScore(scores, playerName, date, gameId, groupId) {
    // Create unique key combining player name and group ID
    const playerKey = `${playerName}_${groupId}`;
    let playerScore = scores.find(s => s.playerKey === playerKey);

    if (!playerScore) {
        playerScore = {
            playerKey: playerKey,
            player: playerName,
            groupId: groupId,
            games: {},
            dailyScores: {},
            allTime: 0
        };
        scores.push(playerScore);
    }

    // Update per game score
    if (!playerScore.games[gameId]) {
        playerScore.games[gameId] = 0;
    }
    playerScore.games[gameId]++;

    // Update daily score
    if (!playerScore.dailyScores[date]) {
        playerScore.dailyScores[date] = 0;
    }
    playerScore.dailyScores[date]++;

    // Update all-time score
    playerScore.allTime++;
}

function showGameSummary() {
    if (!currentGame) return;

    const scores = JSON.parse(localStorage.getItem(STORAGE_KEYS.SCORES));
    const today = new Date().toISOString().split('T')[0];
    const groupId = currentGame.groupId;
    const gameScores = {};
    const todayScores = {};

    // Calculate game scores (only for current group)
    scores.forEach(score => {
        if (score.groupId === groupId) {
            if (score.games && score.games[currentGame.id]) {
                gameScores[score.player] = score.games[currentGame.id];
            }
            if (score.dailyScores && score.dailyScores[today]) {
                todayScores[score.player] = score.dailyScores[today];
            }
        }
    });

    // Sort by score
    const sortedGameScores = Object.entries(gameScores)
        .sort((a, b) => b[1] - a[1])
        .map(([player, score]) => ({ player, score }));

    const sortedTodayScores = Object.entries(todayScores)
        .sort((a, b) => b[1] - a[1])
        .map(([player, score]) => ({ player, score }));

    // Count rounds by winner
    const roundsByWinner = {
        insiders: currentGame.rounds.filter(r => r.winner === 'insiders').length,
        players: currentGame.rounds.filter(r => r.winner === 'players').length
    };

    const content = `
        <div class="summary-item">
            <h3>Game Information</h3>
            <p><strong>Group:</strong> ${currentGame.groupName || 'N/A'}</p>
            <p><strong>Total Rounds:</strong> ${currentGame.rounds.length}</p>
            <p><strong>Insiders Wins:</strong> ${roundsByWinner.insiders}</p>
            <p><strong>Players Wins:</strong> ${roundsByWinner.players}</p>
        </div>
        
        <div class="summary-item">
            <h3>Current Game Scores</h3>
            ${sortedGameScores.length > 0 ?
            sortedGameScores.map(item => `
                    <div class="score-item">
                        <span class="score-item-name">${item.player}</span>
                        <span class="score-item-value">${item.score} point${item.score !== 1 ? 's' : ''}</span>
                    </div>
                `).join('') :
            '<div class="empty-state">No scores yet</div>'
        }
        </div>
        
        <div class="summary-item">
            <h3>Today's Scores</h3>
            ${sortedTodayScores.length > 0 ?
            sortedTodayScores.map(item => `
                    <div class="score-item">
                        <span class="score-item-name">${item.player}</span>
                        <span class="score-item-value">${item.score} point${item.score !== 1 ? 's' : ''}</span>
                    </div>
                `).join('') :
            '<div class="empty-state">No scores yet</div>'
        }
        </div>
    `;

    document.getElementById('gameSummaryContent').innerHTML = content;
    showScreen('summaryScreen');
}

function startNewGame() {
    // Clear current game
    currentGame = null;
    localStorage.removeItem(STORAGE_KEYS.CURRENT_GAME);
    backToHome();
}

function checkActiveGame() {
    // This function can be used to check if there's an active game
    // but won't automatically switch screens - user must manually continue
    return currentGame !== null;
}

// ==================== SCOREBOARD ====================

function showScoreboard(type) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // If called programmatically, find the button by type
        const buttons = document.querySelectorAll('.tab-btn');
        buttons.forEach(btn => {
            const text = btn.textContent.trim();
            if ((type === 'game' && text === 'Current Game') ||
                (type === 'today' && text === 'Today') ||
                (type === 'alltime' && text === 'All Time')) {
                btn.classList.add('active');
            }
        });
    }

    updateScoreboard(type);
}

function updateScoreboard(type) {
    const container = document.getElementById('scoreboardContent');
    const scores = JSON.parse(localStorage.getItem(STORAGE_KEYS.SCORES));
    const today = new Date().toISOString().split('T')[0];
    const lang = translations[currentLanguage] || translations.en;

    // Get current group ID (from current game or selected group)
    let currentGroupId = null;
    if (currentGame && currentGame.groupId) {
        currentGroupId = currentGame.groupId;
    } else if (selectedGroupId) {
        currentGroupId = selectedGroupId;
    }

    let scoreData = {};

    if (type === 'game') {
        if (currentGame && currentGroupId) {
            // Show current game scores (only for current group)
            scores.forEach(score => {
                if (score.groupId === currentGroupId && score.games && score.games[currentGame.id]) {
                    scoreData[score.player] = score.games[currentGame.id];
                }
            });
        } else {
            container.innerHTML = `<div class="empty-state">${lang['No active game'] || 'No active game'}</div>`;
            return;
        }
    } else if (type === 'today') {
        // Show today's scores (only for selected/current group)
        if (currentGroupId) {
            scores.forEach(score => {
                if (score.groupId === currentGroupId && score.dailyScores && score.dailyScores[today]) {
                    scoreData[score.player] = score.dailyScores[today];
                }
            });
        } else {
            container.innerHTML = `<div class="empty-state">${lang['Please select a group to view scores'] || 'Please select a group to view scores'}</div>`;
            return;
        }
    } else if (type === 'alltime') {
        // Show all-time scores (only for selected/current group)
        if (currentGroupId) {
            scores.forEach(score => {
                if (score.groupId === currentGroupId && score.allTime > 0) {
                    scoreData[score.player] = score.allTime;
                }
            });
        } else {
            container.innerHTML = `<div class="empty-state">${lang['Please select a group to view scores'] || 'Please select a group to view scores'}</div>`;
            return;
        }
    }

    const sortedScores = Object.entries(scoreData)
        .sort((a, b) => b[1] - a[1])
        .map(([player, score]) => ({ player, score }));

    if (sortedScores.length === 0) {
        container.innerHTML = `<div class="empty-state">${lang['No scores yet'] || 'No scores yet'}</div>`;
        return;
    }

    container.innerHTML = sortedScores.map(item => `
        <div class="score-item">
            <span class="score-item-name">${item.player}</span>
            <span class="score-item-value">${item.score} point${item.score !== 1 ? 's' : ''}</span>
        </div>
    `).join('');
}

function showAllTimeScores() {
    const scores = JSON.parse(localStorage.getItem(STORAGE_KEYS.SCORES));
    const allTimeScores = {};

    // Get current group ID
    let currentGroupId = null;
    if (currentGame && currentGame.groupId) {
        currentGroupId = currentGame.groupId;
    } else if (selectedGroupId) {
        currentGroupId = selectedGroupId;
    }

    // Filter by group if available
    scores.forEach(score => {
        if (score.allTime > 0) {
            if (!currentGroupId || score.groupId === currentGroupId) {
                // If same player name exists in multiple groups, sum them up
                if (allTimeScores[score.player]) {
                    allTimeScores[score.player] += score.allTime;
                } else {
                    allTimeScores[score.player] = score.allTime;
                }
            }
        }
    });

    const sortedScores = Object.entries(allTimeScores)
        .sort((a, b) => b[1] - a[1])
        .map(([player, score]) => ({ player, score }));

    const content = `
        <div class="summary-item">
            <h3>All-Time Leaderboard</h3>
            ${sortedScores.length > 0 ?
            sortedScores.map((item, index) => `
                    <div class="score-item">
                        <span class="score-item-name">${index + 1}. ${item.player}</span>
                        <span class="score-item-value">${item.score} point${item.score !== 1 ? 's' : ''}</span>
                    </div>
                `).join('') :
            '<div class="empty-state">No scores yet</div>'
        }
        </div>
    `;

    document.getElementById('allTimeScoresContent').innerHTML = content;
    showScreen('allTimeScoresScreen');
}

// ==================== SCREEN NAVIGATION ====================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function backToHome() {
    showScreen('homeScreen');
    updateScoreboard('game');
}

// ==================== RESET STATISTICS ====================

function resetStatistics() {
    if (!confirm('Are you sure you want to reset ALL statistics? This cannot be undone!')) {
        return;
    }

    // Clear all scores
    localStorage.setItem(STORAGE_KEYS.SCORES, JSON.stringify([]));

    // Record reset date
    const resetDate = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.LAST_RESET, resetDate);

    // Update display
    updateLastResetDate();
    updateScoreboard('game');

    alert('All statistics have been reset!');
}

function updateLastResetDate() {
    const lastReset = localStorage.getItem(STORAGE_KEYS.LAST_RESET);
    const resetDateElement = document.getElementById('lastResetDate');

    if (!resetDateElement) return;

    const lang = translations[currentLanguage] || translations.en;

    if (lastReset) {
        const date = new Date(lastReset);
        const locale = currentLanguage === 'th' ? 'th-TH' : 'en-US';
        const formattedDate = date.toLocaleDateString(locale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        resetDateElement.textContent = `${lang['Last reset:'] || 'Last reset:'} ${formattedDate}`;
    } else {
        resetDateElement.textContent = lang['Never reset'] || 'Never reset';
    }
}

// ==================== ENTER KEY SUPPORT ====================

document.getElementById('playerNameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addPlayerToGroup();
    }
});

document.getElementById('wordInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addWord();
    }
});

document.getElementById('groupNameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addGroup();
    }
});

// Add Enter key support for custom word input
const customWordInput = document.getElementById('customWordInput');
if (customWordInput) {
    customWordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            startGame();
        }
    });
}

// ==================== LANGUAGE MANAGEMENT ====================

function switchLanguage(lang) {
    if (lang !== 'th' && lang !== 'en') return;

    currentLanguage = lang;
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);

    // Update language button states
    document.getElementById('langBtnEn').classList.toggle('active', lang === 'en');
    document.getElementById('langBtnTh').classList.toggle('active', lang === 'th');

    // Apply translations
    applyTranslations();

    // Update dynamic content that might have been rendered
    updateGroupSelection();
    updateScoreboard('game');
}

function applyTranslations() {
    if (!translations || !translations[currentLanguage]) return;

    const lang = translations[currentLanguage];

    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (lang[key]) {
            element.textContent = lang[key];
        }
    });

    // Update all elements with data-i18n-placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        if (lang[key]) {
            element.placeholder = lang[key];
        }
    });

    // Update language button states
    if (document.getElementById('langBtnEn') && document.getElementById('langBtnTh')) {
        document.getElementById('langBtnEn').classList.toggle('active', currentLanguage === 'en');
        document.getElementById('langBtnTh').classList.toggle('active', currentLanguage === 'th');
    }

    // Update dropdown option
    const dropdown = document.getElementById('groupDropdown');
    if (dropdown && dropdown.firstElementChild) {
        const key = dropdown.firstElementChild.getAttribute('data-i18n');
        if (key && lang[key]) {
            dropdown.firstElementChild.textContent = lang[key];
        }
    }

    // Update last reset date text if it exists
    updateLastResetDate();
}


