const API = "";
const MIN_PLAYERS = 3;            // keep in sync with the Worker
let roomId = null, hostMode = "omniscient", revealVisible = false;
let playerPoll = null;
const $ = (id) => document.getElementById(id);

// ---- host mode selection ----
document.querySelectorAll('.mode').forEach(el => {
  el.onclick = () => {
    document.querySelectorAll('.mode').forEach(m => m.classList.remove('sel'));
    el.classList.add('sel');
    hostMode = el.dataset.mode;
  };
});

// ---- create ----
$('createBtn').onclick = async () => {
  $('createBtn').disabled = true; $('createMsg').textContent = 'Creating…';
  try {
    const r = await fetch(API + '/api/rooms', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ hostMode }),
    });
    const data = await r.json();
    roomId = data.roomId; hostMode = data.hostMode;
    showLobby();
  } catch(e){
    $('createMsg').textContent = 'Could not create room. Try again.';
    $('createBtn').disabled = false;
  }
};

function showLobby(){
  $('createView').classList.add('hidden');
  $('lobbyView').classList.remove('hidden');
  const joinUrl = location.origin + '/r/' + roomId;
  $('joinUrl').textContent = joinUrl;
  new QRCode($('qrcode'), { text:joinUrl, width:200, height:200,
    colorDark:'#17181d', colorLight:'#ffffff' });
  refreshRoster();
  playerPoll = setInterval(refreshRoster, 2000);
}

// ---- copy join link ----
$('copyBtn').onclick = async () => {
  const url = $('joinUrl').textContent;
  try {
    await navigator.clipboard.writeText(url);
  } catch (e) {
    const t = document.createElement('textarea');
    t.value = url; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch (_) {}
    t.remove();
  }
  $('copyBtn').classList.add('copied');
  setTimeout(() => $('copyBtn').classList.remove('copied'), 1200);
};

// ---- roster ----
async function refreshRoster(){
  try{
    const r = await fetch(API + '/api/rooms/' + roomId + '/players');
    const data = await r.json();
    $('playerCount').textContent = data.count; // present players only
    const list = $('rosterList');
    list.innerHTML = data.players.length
      ? data.players.map(p =>
          `<li class="${p.online ? '' : 'away'}">
             <span class="pn">${esc(p.name)}</span>
             ${p.online ? '' : '<span class="away-tag">left</span>'}
             <button class="kick" data-id="${p.playerId}" title="Remove player" aria-label="Remove ${esc(p.name)}">&times;</button>
           </li>`).join('')
      : '<li class="muted">Waiting for players…</li>';
    list.querySelectorAll('.kick').forEach(b => b.onclick = () => removePlayer(b.dataset.id));
    updateTally();
  }catch(e){}
}
async function removePlayer(id){
  try{ await fetch(API + '/api/rooms/' + roomId + '/remove/' + id, { method:'POST' }); }
  catch(e){}
  refreshRoster();
}

// ---- word-mode config ----
function currentMode(){
  return document.querySelector('input[name="wm"]:checked').value;
}
document.querySelectorAll('input[name="wm"]').forEach(r => r.onchange = () => {
  const m = currentMode();
  $('wmCustom').classList.toggle('hidden', m !== 'custom');
  $('wmVariation').classList.toggle('hidden', m !== 'variation');
  updateTally();
});
['customWord','impostorWord','everyoneWord','impostorCount'].forEach(id => $(id).oninput = updateTally);

// ~1 impostor per 5 players (min 1).
function suggestedImpostors(){
  const pc = parseInt($('playerCount').textContent,10)||0;
  return pc ? Math.max(1, Math.round(pc/5)) : 0;
}
function updateSuggestion(){
  const sg = $('impSuggest');
  const pc = parseInt($('playerCount').textContent,10)||0;
  if(pc < 1){ sg.style.display='none'; return; }
  sg.style.display='';
  sg.textContent = `suggested: ${suggestedImpostors()} for ${pc} player${pc===1?'':'s'}`;
}
$('impSuggest').onclick = () => { $('impostorCount').value = suggestedImpostors(); updateTally(); };

function updateTally(){
  const pc = parseInt($('playerCount').textContent,10)||0;
  const imp = parseInt($('impostorCount').value,10)||0;
  const mode = currentMode();
  let ok = true, msg = '';

  if (pc < MIN_PLAYERS)                        { ok=false; msg = `Need at least ${MIN_PLAYERS} players — ${pc} so far`; }
  else if (imp < 1)                           { ok=false; msg = 'Need at least 1 impostor'; }
  else if (imp >= pc)                         { ok=false; msg = `Too many impostors — max ${pc-1}`; }
  else if (mode==='custom' && !$('customWord').value.trim())  { ok=false; msg = 'Enter the custom word'; }
  else if (mode==='variation' && (!$('impostorWord').value.trim() || !$('everyoneWord').value.trim())) { ok=false; msg = 'Enter both words'; }
  else { msg = `Ready — ${pc} players, ${imp} impostor${imp===1?'':'s'}`; }

  const t = $('tally');
  t.className = 'tally ' + (ok ? 'ok' : 'bad');
  t.textContent = msg;
  $('startBtn').disabled = !ok;
  updateSuggestion();
}

// ---- start ----
$('startBtn').onclick = async () => {
  $('startBtn').disabled = true; $('startMsg').textContent = 'Dealing words…';
  const body = {
    mode: currentMode(),
    customWord: $('customWord').value,
    impostorWord: $('impostorWord').value,
    everyoneWord: $('everyoneWord').value,
    impostorCount: parseInt($('impostorCount').value,10)||1,
  };
  try{
    const r = await fetch(API + '/api/rooms/' + roomId + '/start', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body),
    });
    const data = await r.json();
    if(r.ok){
      clearInterval(playerPoll);
      $('lobbyView').classList.add('hidden');
      $('gameView').classList.remove('hidden');
      loadReveal(); // impostors are fixed for the round — fetch once
    } else if(data.error === 'min_players'){
      $('startMsg').textContent = `Need at least ${data.min} players (have ${data.have}).`; updateTally();
    } else if(data.error === 'too_many_impostors'){
      $('startMsg').textContent = `Too many impostors — max ${data.max}.`; updateTally();
    } else if(data.error === 'missing_words'){
      $('startMsg').textContent = 'Please fill in the word(s).'; updateTally();
    } else { $('startMsg').textContent = 'Could not start.'; updateTally(); }
  }catch(e){ $('startMsg').textContent = 'Network error.'; updateTally(); }
};

// ---- in-game reveal (just the impostor(s)) ----
$('revealBtn').onclick = () => {
  revealVisible = !revealVisible;
  $('revealBtn').textContent = revealVisible ? 'Hide' : 'Show';
  applyMask();
};
function applyMask(){
  $('revealCard').classList.toggle('masked', !revealVisible);
}
async function loadReveal(){
  try{
    const r = await fetch(API + '/api/rooms/' + roomId + '/table');
    const data = await r.json();
    if (data.hostMode === 'blind') {
      $('revealWord').innerHTML = '<span class="muted">Blind host — the word and impostor are hidden from you.</span>';
      $('revealImpostors').innerHTML = '<span class="lbl">Impostor</span><span class="names">—</span>';
      applyMask();
      return;
    }
    const wordParts = [`<b>Word:</b> ${esc(data.everyoneWord || '—')}`];
    if (data.impostorWord) wordParts.push(`<b>Impostor word:</b> ${esc(data.impostorWord)}`);
    $('revealWord').innerHTML = wordParts.join('<br>');
    const imps = data.players.filter(p => p.isImpostor).map(p => esc(p.name));
    $('revealImpostors').innerHTML =
      `<span class="lbl">${imps.length > 1 ? 'Impostors' : 'Impostor'}</span>` +
      `<span class="names">${imps.join(', ') || '—'}</span>`;
    applyMask();
  }catch(e){}
}

function esc(s){ return String(s).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
