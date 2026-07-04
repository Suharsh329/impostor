const RULES = `Everyone is shown the same secret word — except the impostor.

- Most players see the real word.
- The impostor is either told outright that they're the impostor, or (in Variation mode) is quietly handed a slightly different word — so they may not even know.

Going around the group, each player says a short clue or description of their word without saying the word itself. The impostor has to bluff and blend in.

After a round or two of clues, everyone votes on who they think the impostor is. The players win if they vote out the impostor; the impostor wins if they survive — or, if they never knew, if they can figure out the real word.`;

const roomId = location.pathname.split('/r/')[1];
const KEY = 'impostor:room:' + roomId;
let playerId = null;
const $ = (id) => document.getElementById(id);

// Fill the "how to play" panels from the shared rules text.
document.querySelectorAll('.rules').forEach(el => { el.textContent = RULES; });

function show(view) {
  ['joinView', 'lobbyView', 'wordView'].forEach(v =>
    $(v).classList.toggle('hidden', v !== view));
}
function showWord(data) {
  const el = $('wordText');
  el.textContent = data.word;
  el.className = 'word' + (data.impostor ? ' impostor' : '');
  $('wordHint').textContent = data.impostor
    ? 'Blend in. Give a vague clue and figure out the real word.'
    : 'Describe it without saying it. Find the impostor.';
  show('wordView');
}

$('go').onclick = async () => {
  const name = $('name').value.trim();
  if (!name) { $('joinMsg').textContent = 'Enter your name.'; return; }
  $('go').disabled = true; $('joinMsg').textContent = 'Joining…';
  try {
    const r = await fetch('/api/rooms/' + roomId + '/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await r.json();
    if (r.ok) {
      playerId = data.playerId;
      localStorage.setItem(KEY, playerId); // so a refresh resumes instead of re-joining
      show('lobbyView');
      pollForWord();
    } else if (data.error === 'name_taken') {
      $('joinMsg').textContent = 'That name is already taken — try another.';
      $('go').disabled = false;
    } else if (data.error === 'already_started') {
      $('joinMsg').textContent = 'Game already started.';
    } else {
      $('joinMsg').textContent = 'Could not join. Try again.';
      $('go').disabled = false;
    }
  } catch (e) {
    $('joinMsg').textContent = 'Network error. Try again.';
    $('go').disabled = false;
  }
};

// Polling /me doubles as this player's heartbeat, so the host sees them as present.
async function pollForWord() {
  try {
    const r = await fetch('/api/rooms/' + roomId + '/me/' + playerId);
    if (r.status === 404) { // host removed us, or the room was reset
      localStorage.removeItem(KEY); playerId = null;
      show('joinView'); $('go').disabled = false;
      $('joinMsg').textContent = 'You were removed from the room.';
      return;
    }
    const data = await r.json();
    if (data.started && data.word) { showWord(data); return; } // stop polling
  } catch (e) { /* ignore, retry */ }
  setTimeout(pollForWord, 2000);
}

// On load, resume an existing session (refresh / reopened link) rather than joining twice.
(async () => {
  const saved = localStorage.getItem(KEY);
  if (!saved) return;
  playerId = saved;
  try {
    const r = await fetch('/api/rooms/' + roomId + '/me/' + playerId);
    if (r.status === 404) { localStorage.removeItem(KEY); playerId = null; return; }
    const data = await r.json();
    if (data.started && data.word) { showWord(data); return; }
    show('lobbyView');
    pollForWord();
  } catch (e) { /* fall back to the join form */ }
})();
