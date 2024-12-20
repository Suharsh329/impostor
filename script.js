import { getRandomWord } from './words.js';

/**
 * Setup default player email and name input fields for 4 players
 */
const setupDefaultFields = () => {
  for (let i = 1; i <= 3; i++) {
    document.getElementById(
      "players-email"
    ).innerHTML += `<input id="player-email-input-${i}" class="player-email-input" type="email" placeholder="Player ${i} Email" required />`;
  }
  for (let i = 1; i <= 3; i++) {
    document.getElementById(
      "players-name"
    ).innerHTML += `<input id="player-name-input-${i}" class="player-name-input" type="text" placeholder="Player ${i} Name" required />`;
  }
};

/**
 * Add a new player email input field
 */
const addEmailInput = () => {
  const playerInputs = document.querySelectorAll(".player-email-input");
  const lastPlayerInput = playerInputs[playerInputs.length - 1];
  const lastPlayerInputId = lastPlayerInput.id;
  const lastPlayerInputNumber = parseInt(lastPlayerInputId.split("-")[3]);
  const newEmailInput = document.createElement("input");
  newEmailInput.id = `player-email-input-${lastPlayerInputNumber + 1}`;
  newEmailInput.className = "player-email-input";
  newEmailInput.type = "email";
  newEmailInput.placeholder = `Player ${lastPlayerInputNumber + 1} Email`;
  newEmailInput.required = true;
  document.getElementById("players-email").appendChild(newEmailInput);
};

/**
 * Add a new player name input field
 */
const addNameInput = () => {
  const playerNameInputs = document.querySelectorAll(".player-name-input");
  const lastPlayerNameInput = playerNameInputs[playerNameInputs.length - 1];
  const lastPlayerNameInputId = lastPlayerNameInput.id;
  const lastPlayerNameInputNumber = parseInt(
    lastPlayerNameInputId.split("-")[3]
  );
  const newNameInput = document.createElement("input");
  newNameInput.id = `player-name-input-${lastPlayerNameInputNumber + 1}`;
  newNameInput.className = "player-name-input";
  newNameInput.type = "text";
  newNameInput.placeholder = `Player ${lastPlayerNameInputNumber + 1} Name`;
  newNameInput.required = true;
  document.getElementById("players-name").appendChild(newNameInput);
};


/**
 * Assign the word to players
 */
const assignWordToPlayers = (playerEmails, playerNames, words) => {
  let players = [];

  for (let i = 0; i < playerEmails.length; i++) {
    players.push({
      email: playerEmails[i].value,
      name: playerNames[i].value,
    });
  }


  try {
    // Randomly select an impostor
    const impostorIndex = Math.floor(Math.random() * players.length);
    if (words.length === 1) {
      // Assign the same word to all players
      players = players.map((player, index) => {
        return {
          ...player,
          word: index === impostorIndex ? 'You\'re the impostor!' : words[0],
          impostor: index === impostorIndex ? 'true' : 'false',
        };
      });
    } else {
      // Assign the impostor a different word
      players = players.map((player, index) => {
        return {
          ...player,
          word: index === impostorIndex ? words[0] : words[1],
          impostor: index === impostorIndex ? 'true' : 'false',
        };
      });
    }
    document.getElementById("impostor-text").innerHTML = players.find(player => player.impostor).name;
  } catch (e) {
    console.log(e);
    return [];
  }

  return players;
};

/**
 * Send an email to each player with their role.
 */
const sendEmail = async (players) => {
  try {
    for (let i = 0; i < players.length; i++) {
      const bodyData = {
        to: players[i].email,
        'variables': players[i],
        game: 'Impostor',
      };

      const result = await fetch("http://localhost:8000/mail/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyData),
      });

      if (result?.status >= 400) {
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

/**
 * Validate player email and name inputs
 */
const validateInputs = (playerNames, playerEmails) => {
  for (let i = 0; i < playerEmails.length; i++) {
    if (!playerEmails[i].value || !playerNames[i].value) {
      alert("Please fill out all player email and name fields.");
      return false;
    }
    if (!playerEmails[i].checkValidity()) {
      alert(`Invalid email format for Player ${i + 1}`);
      return false;
    }
  }
  return true;
};

/**
 * Get the word
 */
const getWords = () => {
  const radios = document.querySelectorAll('input[type=radio]:checked');
  const value = radios.length > 0 ? radios[0].value : null;

  switch (value) {
    case 'option1':
      return [getRandomWord()];
    case 'option2':
      const word = document.getElementById('option2-input-1').value
      if (!word || !word.trim().length) {
        return [];
      }
      return [document.getElementById('option2-input-1').value];
    case 'option3':
      const impostorWord = document.getElementById('option3-input-1').value;
      const everyoneElseWord = document.getElementById('option3-input-2').value;
      if (!impostorWord || !everyoneElseWord || !impostorWord.trim().length || !everyoneElseWord.trim().length) {
        return [];
      }
      const wordForImpostor = document.getElementById('option3-input-1').value;
      const wordForEveryoneElse = document.getElementById('option3-input-2').value;
      return [wordForImpostor, wordForEveryoneElse];
    default:
      return [];
  }
};

/**
 * Disable elements when the game starts
 */
const disableElements = () => {
  document.getElementById("start-game-button").classList.remove("loading");
  document.getElementById("start-game-button").style.display = "none";
  document.getElementById("add-player-button").style.display = "none";
  document.getElementById("end-game-button").style.display = "block";
  Array.from(document.getElementsByClassName('player-email-input')).forEach(input => input.disabled = true);
  Array.from(document.getElementsByClassName('player-name-input')).forEach(input => input.disabled = true);
  Array.from(document.querySelectorAll('input[type=radio]')).forEach(radio => radio.disabled = true);
};

/**
 * Enable elements when the game ends
 */
const enableElements = () => {
  document.getElementById("start-game-button").style.display = "block";
  document.getElementById("add-player-button").style.display = "block";
  document.getElementById("end-game-button").style.display = "none";
  document.getElementById("impostor-container").style.display = "none";
  Array.from(document.getElementsByClassName('player-email-input')).forEach(input => input.disabled = false);
  Array.from(document.getElementsByClassName('player-name-input')).forEach(input => input.disabled = false);
  Array.from(document.querySelectorAll('input[type=radio]')).forEach(radio => radio.disabled = false);
};


/**************************************************EVENT LISTENERS **************************************************/

// Add event listener to the add player button
document.getElementById("add-player-button").addEventListener("click", () => {
  addEmailInput();
  addNameInput();

  if (document.querySelectorAll(".player-email-input").length >= 4) {
    document.getElementById("delete-player-button").style.display = "block";
  }
});

// Event listener to delete the last player input field
document
  .getElementById("delete-player-button")
  .addEventListener("click", () => {
    const playerEmailInputs = document.querySelectorAll(".player-email-input");
    const playerNameInputs = document.querySelectorAll(".player-name-input");
    const lastPlayerEmailInput =
      playerEmailInputs[playerEmailInputs.length - 1];
    const lastPlayerNameInput = playerNameInputs[playerNameInputs.length - 1];
    lastPlayerEmailInput.remove();
    lastPlayerNameInput.remove();

    if (document.querySelectorAll(".player-email-input").length <= 3) {
      document.getElementById("delete-player-button").style.display = "none";
    }
  });

// Event listener to start the game
document
  .getElementById("start-game-button")
  .addEventListener("click", async () => {
    const playerEmails = document.querySelectorAll(".player-email-input");
    const playerNames = document.querySelectorAll(".player-name-input");

    document.getElementById("start-game-button").classList.add("loading");

    // Validate inputs
    if (!validateInputs(playerNames, playerEmails)) {
      document.getElementById("start-game-button").classList.remove("loading");
      return;
    }

    const words = getWords();
    if (words.length === 0) {
      alert("Please fill out the word(s) for the game");
      document.getElementById("start-game-button").classList.remove("loading");
      return;
    }

    const players = assignWordToPlayers(playerEmails, playerNames, words);
    if (players.length === 0) {
      document.getElementById("start-game-button").classList.remove("loading");
      return;
    }

    const emailSent = await sendEmail(players);
    if (!emailSent) {
      alert("Failed to send emails to players");
      document.getElementById("start-game-button").classList.remove("loading");
      return;
    }

    document.getElementById("impostor-container").style.display = "flex";
    document.getElementById("impostor-text").style.filter = blurValue;
    disableElements();
  });

// Event listener to toggle blur effect on impostor text
document.getElementById("impostor-text").addEventListener("click", () => {
  document.getElementById("impostor-text").style.filter = document.getElementById("impostor-text").style.filter === blurValue ? "none" : blurValue;
});

// Event listener to end the game
document.getElementById("end-game-button").addEventListener("click", () => {
  enableElements();
});

// Radio button event listeners
document.getElementById('option2').addEventListener('change', function () {
  document.getElementById('option2-input').style.display = 'block';
  document.getElementById('option3-inputs').style.display = 'none';
});

document.getElementById('option3').addEventListener('change', function () {
  document.getElementById('option3-inputs').style.display = 'block';
  document.getElementById('option2-input').style.display = 'none';
});

document.getElementById('option1').addEventListener('change', function () {
  document.getElementById('option2-input').style.display = 'none';
  document.getElementById('option3-inputs').style.display = 'none';
});

const blurValue = "blur(30px)";
setupDefaultFields();
