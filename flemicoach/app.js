import { supabase, isConfigured, CONFIG } from './supabase.js';

const $ = (id) => document.getElementById(id);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
const dayNames = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

let session = null;
let teams = [];
let currentTeam = null;
let rules = [];
let players = [];
let events = [];
let attendance = [];
let calendarFilter = 'all';
let importRows = [];
let nextEventCache = null;

function showOnly(id) {
  ['boot','configError','authScreen','publicScreen','onboardingScreen','app'].forEach(x => $(x).classList.toggle('hidden', x !== id));
}
function setStatus(el, text, kind = '') {
  el.textContent = text || '';
  el.classList.remove('error','success');
  if (kind) el.classList.add(kind);
}
function esc(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function time5(v='') { return String(v || '').slice(0,5); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtDate(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date(y,m-1,d,12));
}
function eventLabel(e) { return e.type === 'training' ? 'Entraînement' : e.title || (e.type === 'match' ? 'Match' : 'Événement'); }
function baseAppUrl() {
  const configured = (CONFIG.APP_URL || '').trim();
  if (configured && !configured.includes('YOUR_GITHUB_USER')) return configured.endsWith('/') ? configured : configured + '/';
  return new URL('.', window.location.href).href;
}
function publicLink(e) { return `${baseAppUrl()}?event=${encodeURIComponent(e.public_token)}`; }
function recordFor(eventId, playerId) { return attendance.find(a => a.event_id === eventId && a.player_id === playerId) || null; }
function completedEvents() { return events.filter(e => e.event_date <= todayISO()); }

async function init() {
  if (!isConfigured()) { showOnly('configError'); return; }

  const token = new URLSearchParams(location.search).get('event');
  if (token) { showOnly('publicScreen'); await initPublic(token); return; }

  const { data } = await supabase.auth.getSession();
  session = data.session;
  if (!session) { showOnly('authScreen'); return; }
  await loadCoachApp();
}

// ---------- Auth ----------
qsa('.auth-tab').forEach(btn => btn.addEventListener('click', () => {
  qsa('.auth-tab').forEach(b => b.classList.toggle('active', b === btn));
  $('loginForm').classList.toggle('hidden', btn.dataset.authTab !== 'login');
  $('signupForm').classList.toggle('hidden', btn.dataset.authTab !== 'signup');
  setStatus($('authFeedback'), '');
}));

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus($('authFeedback'),'Connexion…');
  const { error } = await supabase.auth.signInWithPassword({ email:$('loginEmail').value.trim(), password:$('loginPassword').value });
  if (error) return setStatus($('authFeedback'), error.message, 'error');
  const { data } = await supabase.auth.getSession(); session = data.session; await loadCoachApp();
});

$('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus($('authFeedback'),'Création du compte…');
  const { data, error } = await supabase.auth.signUp({
    email:$('signupEmail').value.trim(),
    password:$('signupPassword').value,
    options:{ data:{ full_name:$('signupName').value.trim() }, emailRedirectTo:baseAppUrl() }
  });
  if (error) return setStatus($('authFeedback'), error.message, 'error');
  if (!data.session) return setStatus($('authFeedback'),'Compte créé. Confirme ton adresse email puis connecte-toi.','success');
  session = data.session; await loadCoachApp();
});

$('logoutBtn').addEventListener('click', async () => { await supabase.auth.signOut(); location.href = baseAppUrl(); });

// ---------- Public parent page ----------
async function initPublic(token) {
  $('publicLoading').textContent = 'Chargement de la séance…';
  const { data, error } = await supabase.rpc('get_public_event', { p_token: token });
  if (error || !data?.event) {
    $('publicLoading').innerHTML = '<strong>Lien indisponible.</strong><br><span class="muted">Le lien est invalide, expiré ou la séance n’est plus ouverte aux réponses.</span>';
    return;
  }
  $('publicLoading').classList.add('hidden'); $('publicContent').classList.remove('hidden');
  const e = data.event;
  $('publicTeam').textContent = e.team_name;
  $('publicTitle').textContent = e.type === 'training' ? 'Entraînement' : e.title;
  $('publicMeta').textContent = `${fmtDate(e.event_date)} · ${time5(e.start_time)}${e.location ? ' · '+e.location : ''}`;
  $('publicPlayer').innerHTML = '<option value="">Sélectionner un joueur</option>';
  for (const p of data.players || []) {
    const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; $('publicPlayer').appendChild(o);
  }

  $('publicForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const status = new FormData($('publicForm')).get('publicStatus');
    const playerId = $('publicPlayer').value;
    if (!playerId || !status) return setStatus($('publicFeedback'),'Sélectionne le joueur et une réponse.','error');
    setStatus($('publicFeedback'),'Enregistrement…');
    const { error: saveError } = await supabase.rpc('submit_public_attendance', {
      p_token:token, p_player_id:playerId, p_status:status, p_note:$('publicNote').value.trim()
    });
    if (saveError) return setStatus($('publicFeedback'),'Impossible d’enregistrer la réponse. Réessaie.','error');
    setStatus($('publicFeedback'),'Réponse enregistrée. Merci.','success');
  });
}

// ---------- Coach data ----------
async function loadCoachApp(preferredTeamId = null) {
  showOnly('boot');
  const { data: teamRows, error } = await supabase.from('teams').select('*').order('created_at');
  if (error) { showOnly('authScreen'); return setStatus($('authFeedback'), error.message, 'error'); }
  teams = teamRows || [];
  if (!teams.length) { prepareOnboarding(); showOnly('onboardingScreen'); return; }
  const remembered = sessionStorage.getItem('flemicoach-team');
  currentTeam = teams.find(t => t.id === preferredTeamId) || teams.find(t => t.id === remembered) || teams[0];
  sessionStorage.setItem('flemicoach-team', currentTeam.id);
  await loadTeamData();
  showOnly('app');
  renderAll();
}

async function loadTeamData() {
  const teamId = currentTeam.id;
  const [r1,r2,r3,r4] = await Promise.all([
    supabase.from('training_rules').select('*').eq('team_id',teamId).order('weekday').order('start_time'),
    supabase.from('players').select('*').eq('team_id',teamId).eq('active',true).order('name'),
    supabase.from('events').select('*').eq('team_id',teamId).order('event_date').order('start_time'),
    supabase.from('attendance').select('event_id,player_id,declared_status,actual_status,note,declared_at,actual_at,events!inner(team_id)').eq('events.team_id',teamId)
  ]);
  const err = [r1.error,r2.error,r3.error,r4.error].find(Boolean); if (err) throw err;
  rules = r1.data || []; players = r2.data || []; events = r3.data || []; attendance = r4.data || [];
}

function prepareOnboarding() {
  const year = new Date().getFullYear();
  $('onboardStart').value = `${year}-09-01`; $('onboardEnd').value = `${year+1}-06-30`;
  $('onboardRules').innerHTML = '';
  addRuleRow($('onboardRules'), {weekday:2,start_time:'18:15',end_time:'19:45'}, false);
  addRuleRow($('onboardRules'), {weekday:5,start_time:'18:15',end_time:'19:45'}, false);
}
$('onboardAddRule').addEventListener('click', () => addRuleRow($('onboardRules'), {}, false));
$('onboardingForm').addEventListener('submit', async (e) => {
  e.preventDefault(); setStatus($('onboardFeedback'),'Création…');
  const payload = { created_by:session.user.id, name:$('onboardTeamName').value.trim(), season_start:$('onboardStart').value, season_end:$('onboardEnd').value };
  const { data: team, error } = await supabase.from('teams').insert(payload).select().single();
  if (error) return setStatus($('onboardFeedback'),error.message,'error');
  const { error: memberError } = await supabase.from('team_members').insert({team_id:team.id,user_id:session.user.id,role:'owner'});
  if (memberError) return setStatus($('onboardFeedback'),memberError.message,'error');
  const rulePayload = extractRuleRows($('onboardRules')).map(r => ({...r,team_id:team.id}));
  if (rulePayload.length) { const { error: re } = await supabase.from('training_rules').insert(rulePayload); if (re) return setStatus($('onboardFeedback'),re.message,'error'); }
  await supabase.rpc('regenerate_training_events',{p_team_id:team.id});
  await loadCoachApp(team.id);
});
$('newTeamBtn').addEventListener('click', () => { prepareOnboarding(); showOnly('onboardingScreen'); });

// ---------- Rendering ----------
function playerStats(playerId) {
  const pastIds = new Set(completedEvents().map(e => e.id));
  let validated = 0, present = 0, responded = 0, noReply = 0, reliableBase = 0, noShow = 0;
  for (const e of completedEvents()) {
    const r = recordFor(e.id, playerId);
    if (r?.declared_status && r.declared_status !== 'NO_REPLY') responded++; else noReply++;
    if (r?.actual_status) { validated++; if (r.actual_status === 'PRESENT') present++; }
    if (r?.declared_status === 'PRESENT' && r?.actual_status) { reliableBase++; if (r.actual_status === 'ABSENT') noShow++; }
  }
  const totalPast = pastIds.size;
  return {
    presence: validated ? Math.round(present/validated*100) : 0,
    response: totalPast ? Math.round(responded/totalPast*100) : 0,
    reliability: reliableBase ? Math.round((reliableBase-noShow)/reliableBase*100) : 100,
    actualPresent:present, actualAbsent:Math.max(0,validated-present), noReply, noShow
  };
}

function renderAll() { renderHeader(); renderDashboard(); renderCalendar(); renderPlayers(); renderAttendanceEventSelect(); renderSettings(); }
function renderHeader() {
  $('teamTitle').textContent = `${currentTeam.name} · Saison ${currentTeam.season_start.slice(0,4)}–${currentTeam.season_end.slice(0,4)}`;
  $('teamSelect').innerHTML=''; for (const t of teams) { const o=document.createElement('option');o.value=t.id;o.textContent=t.name;o.selected=t.id===currentTeam.id;$('teamSelect').appendChild(o); }
}
$('teamSelect').addEventListener('change', async () => { currentTeam=teams.find(t=>t.id===$('teamSelect').value); sessionStorage.setItem('flemicoach-team',currentTeam.id); await loadTeamData(); renderAll(); });

function renderDashboard() {
  const upcoming = events.filter(e=>e.event_date>=todayISO()).sort((a,b)=>(a.event_date+a.start_time).localeCompare(b.event_date+b.start_time));
  const next = upcoming[0]; nextEventCache = next || null;
  if (next) {
    $('nextEventTitle').textContent = `${eventLabel(next)} · ${time5(next.start_time)}`;
    $('nextEventMeta').textContent = `${fmtDate(next.event_date)}${next.location?' · '+next.location:''}`;
    $('nextEventBadge').textContent = next.type==='training'?'Entraînement':next.type==='match'?'Match':'Événement';
    let p=0,a=0,n=0; for (const pl of players) { const r=recordFor(next.id,pl.id); if(!r||r.declared_status==='NO_REPLY')n++; else if(r.declared_status==='PRESENT')p++; else a++; }
    $('nextPresent').textContent=p;$('nextAbsent').textContent=a;$('nextNoReply').textContent=n;
  } else {
    $('nextEventTitle').textContent='Aucun événement';$('nextEventMeta').textContent='Ajoute ou génère le planning.';$('nextEventBadge').textContent='—';$('nextPresent').textContent=0;$('nextAbsent').textContent=0;$('nextNoReply').textContent=players.length;
  }
  const stats = players.map(p=>playerStats(p.id));
  $('teamPresenceRate').textContent = `${stats.length?Math.round(stats.reduce((s,x)=>s+x.presence,0)/stats.length):0} %`;
  $('teamResponseRate').textContent = `${stats.length?Math.round(stats.reduce((s,x)=>s+x.response,0)/stats.length):0} %`;
  $('trainingCount').textContent=events.filter(e=>e.type==='training').length;$('matchCount').textContent=events.filter(e=>e.type==='match').length;
  $('upcomingList').innerHTML=''; for(const e of upcoming.slice(0,6)){ const d=document.createElement('div');d.className='list-row row between gap';d.innerHTML=`<div><strong>${esc(eventLabel(e))}</strong><div class="muted small">${esc(fmtDate(e.event_date))} · ${esc(time5(e.start_time))}</div></div><span class="pill">${e.type==='training'?'Entraînement':e.type==='match'?'Match':'Autre'}</span>`;$('upcomingList').appendChild(d);} if(!$('upcomingList').children.length)$('upcomingList').innerHTML='<div class="empty">Aucun événement à venir.</div>';
}

function renderCalendar() {
  $('calendarList').innerHTML='';
  const filtered=events.filter(e=>calendarFilter==='all'||e.type===calendarFilter).sort((a,b)=>(a.event_date+a.start_time).localeCompare(b.event_date+b.start_time));
  for(const e of filtered){const d=document.createElement('div');d.className='card row between gap wrap';d.innerHTML=`<div><strong>${esc(fmtDate(e.event_date))}</strong><div class="muted small">${esc(eventLabel(e))} · ${esc(time5(e.start_time))}${e.end_time?'–'+esc(time5(e.end_time)):''}${e.location?' · '+esc(e.location):''}</div></div><div class="row gap"><span class="pill">${e.type==='training'?'Entraînement':e.type==='match'?'Match':'Autre'}</span><button class="btn ghost small-btn delete-event" data-id="${e.id}">Supprimer</button></div>`;$('calendarList').appendChild(d);} if(!filtered.length)$('calendarList').innerHTML='<div class="card empty">Aucun événement.</div>';
  qsa('.delete-event',$('calendarList')).forEach(b=>b.addEventListener('click',()=>deleteEvent(b.dataset.id)));
}

function renderPlayers() {
  $('playerCount').textContent=players.length;$('playersList').innerHTML='';
  for(const p of players){const s=playerStats(p.id);const b=document.createElement('button');b.className='list-row list-button';b.type='button';b.innerHTML=`<div><strong>${esc(p.name)}</strong></div><div class="stats-grid three compact-labels"><span>${s.presence} %</span><span>${s.response} %</span><span>${s.reliability} %</span></div>`;b.addEventListener('click',()=>showPlayerDetail(p));$('playersList').appendChild(b);} if(!players.length)$('playersList').innerHTML='<div class="empty">Aucun joueur.</div>';
}
function showPlayerDetail(p){const s=playerStats(p.id);$('detailName').textContent=p.name;$('detailPresence').textContent=`${s.presence} %`;$('detailResponse').textContent=`${s.response} %`;$('detailReliability').textContent=`${s.reliability} %`;$('detailCounts').textContent=`${s.actualPresent} présence(s) réelle(s) · ${s.actualAbsent} absence(s) · ${s.noReply} non-réponse(s) · ${s.noShow} absent(s) malgré une présence annoncée`;$('playerDetail').classList.remove('hidden');}
$('closePlayerDetail').addEventListener('click',()=> $('playerDetail').classList.add('hidden'));

function renderAttendanceEventSelect() {
  const previous=$('attendanceEventSelect').value;$('attendanceEventSelect').innerHTML='';
  const sorted=[...events].sort((a,b)=>(b.event_date+b.start_time).localeCompare(a.event_date+a.start_time));
  for(const e of sorted){const o=document.createElement('option');o.value=e.id;o.textContent=`${fmtDate(e.event_date)} · ${eventLabel(e)}`;$('attendanceEventSelect').appendChild(o);} if(previous&&sorted.some(e=>e.id===previous))$('attendanceEventSelect').value=previous; renderAttendanceList();
}
function renderAttendanceList(){const eventId=$('attendanceEventSelect').value;$('attendanceList').innerHTML='';if(!eventId){$('attendanceList').innerHTML='<div class="empty">Aucun événement.</div>';return;}for(const p of players){const r=recordFor(eventId,p.id);const declared=r?.declared_status||'NO_REPLY';const defaultActual=r?.actual_status || (declared==='PRESENT'?'PRESENT':declared==='ABSENT'?'ABSENT':'');const row=document.createElement('div');row.className='attendance-row';row.innerHTML=`<div><strong>${esc(p.name)}</strong><div class="muted small">Déclaré : ${declared==='PRESENT'?'Présent':declared==='ABSENT'?'Absent':'Sans réponse'}</div></div><select data-player-id="${p.id}"><option value="" ${!defaultActual?'selected':''}>Non validé</option><option value="PRESENT" ${defaultActual==='PRESENT'?'selected':''}>Présent</option><option value="ABSENT" ${defaultActual==='ABSENT'?'selected':''}>Absent</option></select>`;$('attendanceList').appendChild(row);}}
$('attendanceEventSelect').addEventListener('change',renderAttendanceList);

function renderSettings(){ $('teamName').value=currentTeam.name;$('seasonStart').value=currentTeam.season_start;$('seasonEnd').value=currentTeam.season_end;$('emailReminders').checked=currentTeam.email_reminders;$('trainingReminderHours').value=String(currentTeam.training_reminder_hours);$('matchReminderHours').value=String(currentTeam.match_reminder_hours);$('trainingRules').innerHTML='';for(const r of rules)addRuleRow($('trainingRules'),r,true); }
function addRuleRow(container,rule={},removable=true){const row=document.createElement('div');row.className='training-rule';row.innerHTML=`<select class="rule-day">${dayNames.map((d,i)=>`<option value="${i}" ${Number(rule.weekday??2)===i?'selected':''}>${d}</option>`).join('')}</select><input class="rule-start" type="time" value="${time5(rule.start_time||'18:00')}" required><input class="rule-end" type="time" value="${time5(rule.end_time||'19:30')}" required>${removable?'<button type="button" class="btn ghost remove-rule">Retirer</button>':'<button type="button" class="btn ghost remove-rule">Retirer</button>'}`;row.querySelector('.remove-rule').addEventListener('click',()=>row.remove());container.appendChild(row);}
function extractRuleRows(container){return qsa('.training-rule',container).map(row=>({weekday:Number(row.querySelector('.rule-day').value),start_time:row.querySelector('.rule-start').value,end_time:row.querySelector('.rule-end').value})).filter(r=>r.start_time&&r.end_time&&r.end_time>r.start_time);}
$('addTrainingRule').addEventListener('click',()=>addRuleRow($('trainingRules'),{},true));

// ---------- Navigation ----------
qsa('.tab').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.view)));
function showView(id){qsa('.view').forEach(v=>v.classList.toggle('active-view',v.id===id));qsa('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===id));}
$('openSettings').addEventListener('click',()=>showView('settings'));$('closeSettings').addEventListener('click',()=>showView('dashboard'));
qsa('.filter').forEach(btn=>btn.addEventListener('click',()=>{calendarFilter=btn.dataset.filter;qsa('.filter').forEach(b=>b.classList.toggle('active',b===btn));renderCalendar();}));

// ---------- CRUD ----------
$('addPlayerBtn').addEventListener('click',()=>{$('newPlayerName').value='';$('playerDialog').showModal();});
$('confirmAddPlayer').addEventListener('click',async(e)=>{e.preventDefault();const name=$('newPlayerName').value.trim();if(!name)return;const {error}=await supabase.from('players').insert({team_id:currentTeam.id,name});if(error)return alert(error.message);$('playerDialog').close();await loadTeamData();renderAll();});

$('addEventBtn').addEventListener('click',()=>{$('eventForm').reset();$('eventDate').value=todayISO();$('eventTime').value='15:00';$('eventDialog').showModal();});
$('confirmAddEvent').addEventListener('click',async(e)=>{e.preventDefault();if(!$('eventDate').value||!$('eventTime').value||!$('eventTitle').value.trim())return;const payload={team_id:currentTeam.id,type:$('eventType').value,title:$('eventType').value==='training'?'Entraînement':$('eventTitle').value.trim(),event_date:$('eventDate').value,start_time:$('eventTime').value,location:$('eventLocation').value.trim(),generated:false,created_by:session.user.id};const {error}=await supabase.from('events').insert(payload);if(error)return alert(error.message);$('eventDialog').close();await loadTeamData();renderAll();});
async function deleteEvent(id){if(!confirm('Supprimer cet événement et ses présences associées ?'))return;const {error}=await supabase.from('events').delete().eq('id',id);if(error)return alert(error.message);await loadTeamData();renderAll();}

$('saveAttendance').addEventListener('click',async()=>{const eventId=$('attendanceEventSelect').value;if(!eventId)return;setStatus($('attendanceFeedback'),'Enregistrement…');const rows=qsa('select[data-player-id]',$('attendanceList'));for(const select of rows){const actual=select.value;if(!actual)continue;const playerId=select.dataset.playerId;const existing=recordFor(eventId,playerId);const payload={event_id:eventId,player_id:playerId,declared_status:existing?.declared_status||'NO_REPLY',actual_status:actual,actual_at:new Date().toISOString(),updated_at:new Date().toISOString()};const {error}=await supabase.from('attendance').upsert(payload,{onConflict:'event_id,player_id'});if(error)return setStatus($('attendanceFeedback'),error.message,'error');}await loadTeamData();renderAll();setStatus($('attendanceFeedback'),'Présences réelles enregistrées.','success');});

$('settingsForm').addEventListener('submit',async(e)=>{e.preventDefault();setStatus($('settingsFeedback'),'Enregistrement…');const teamPatch={name:$('teamName').value.trim(),season_start:$('seasonStart').value,season_end:$('seasonEnd').value,email_reminders:$('emailReminders').checked,training_reminder_hours:Number($('trainingReminderHours').value),match_reminder_hours:Number($('matchReminderHours').value)};const {error}=await supabase.from('teams').update(teamPatch).eq('id',currentTeam.id);if(error)return setStatus($('settingsFeedback'),error.message,'error');const newRules=extractRuleRows($('trainingRules'));const {error:delErr}=await supabase.from('training_rules').delete().eq('team_id',currentTeam.id);if(delErr)return setStatus($('settingsFeedback'),delErr.message,'error');if(newRules.length){const {error:insErr}=await supabase.from('training_rules').insert(newRules.map(r=>({...r,team_id:currentTeam.id})));if(insErr)return setStatus($('settingsFeedback'),insErr.message,'error');}const {error:regenErr}=await supabase.rpc('regenerate_training_events',{p_team_id:currentTeam.id});if(regenErr)return setStatus($('settingsFeedback'),regenErr.message,'error');await loadCoachApp(currentTeam.id);showView('settings');setStatus($('settingsFeedback'),'Paramètres enregistrés et séances futures régénérées.','success');});

// ---------- WhatsApp ----------
$('shareWhatsApp').addEventListener('click',()=>{if(!nextEventCache)return setStatus($('shareFeedback'),'Aucun événement à partager.','error');const e=nextEventCache;const msg=`⚽ ${currentTeam.name} — ${eventLabel(e)}\n${fmtDate(e.event_date)} à ${time5(e.start_time)}${e.location?' · '+e.location:''}\n\nMerci d’indiquer la présence de votre enfant :\n${publicLink(e)}`;window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank','noopener');setStatus($('shareFeedback'),'WhatsApp ouvert avec le message prérempli.','success');});
$('copyParentLink').addEventListener('click',async()=>{if(!nextEventCache)return setStatus($('shareFeedback'),'Aucun événement.','error');try{await navigator.clipboard.writeText(publicLink(nextEventCache));setStatus($('shareFeedback'),'Lien copié.','success');}catch{setStatus($('shareFeedback'),publicLink(nextEventCache));}});

// ---------- Import ----------
$('fileInput').addEventListener('change',async()=>{const f=$('fileInput').files?.[0];if(!f)return;setStatus($('importStatus'),'Analyse du fichier…');importRows=[];try{const ext=f.name.split('.').pop().toLowerCase();if(ext==='csv'){const txt=await f.text();importRows=parseDelimited(txt);}else if(ext==='xlsx'||ext==='xls'){const XLSX=await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];importRows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''}).filter(r=>r.some(v=>String(v).trim()));}else if(ext==='pdf'){const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';const doc=await pdfjs.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);const tc=await page.getTextContent();const lines=groupPdfItems(tc.items);importRows.push(...lines.map(x=>[x]));}}else throw new Error('Format non supporté');if(!importRows.length)throw new Error('Aucune donnée détectée');renderImportPreview(f.name);setStatus($('importStatus'),'Fichier analysé. Vérifie l’aperçu puis valide.','success');}catch(err){console.error(err);setStatus($('importStatus'),'Impossible de lire automatiquement ce fichier. Essaie un CSV/XLSX ou un PDF contenant du texte.','error');}});
function parseDelimited(text){return text.split(/\r?\n/).map(l=>{const sep=(l.match(/;/g)||[]).length>=(l.match(/,/g)||[]).length?';':',';return l.split(sep).map(v=>v.trim().replace(/^"|"$/g,''));}).filter(r=>r.some(Boolean));}
function groupPdfItems(items){const rows=[];let currentY=null,line=[];for(const item of items){const y=Math.round(item.transform?.[5]||0);if(currentY!==null&&Math.abs(y-currentY)>3){if(line.length)rows.push(line.join(' ').replace(/\s+/g,' ').trim());line=[];}line.push(item.str);currentY=y;}if(line.length)rows.push(line.join(' ').replace(/\s+/g,' ').trim());return rows.filter(Boolean);}
function renderImportPreview(name){$('previewMeta').textContent=`${name} · ${$('importType').value==='players'?'Joueurs':'Calendrier'}`;$('previewCount').textContent=`${importRows.length} ligne(s)`;$('previewRows').innerHTML='';for(const r of importRows.slice(0,40)){const d=document.createElement('div');d.className='preview-row';d.textContent=r.filter(v=>String(v).trim()).join(' · ');$('previewRows').appendChild(d);}$('importPreview').classList.remove('hidden');}
$('confirmImport').addEventListener('click',async()=>{if(!importRows.length)return;setStatus($('importStatus'),'Import en cours…');try{if($('importType').value==='players')await importPlayers();else await importCalendar();$('importPreview').classList.add('hidden');$('fileInput').value='';importRows=[];await loadTeamData();renderAll();setStatus($('importStatus'),'Import terminé.','success');}catch(err){console.error(err);setStatus($('importStatus'),err.message||'Erreur pendant l’import.','error');}});
async function importPlayers(){const existing=new Set(players.map(p=>p.name.toLowerCase()));const rows=[];for(let i=0;i<importRows.length;i++){const r=importRows[i].map(v=>String(v).trim()).filter(Boolean);if(!r.length)continue;if(i===0&&/nom|prénom|prenom|joueur/i.test(r.join(' ')))continue;const name=(r.length>=2?`${r[0]} ${r[1]}`:r[0]).trim();if(name.length<2||existing.has(name.toLowerCase()))continue;rows.push({team_id:currentTeam.id,name});existing.add(name.toLowerCase());}if(!rows.length)throw new Error('Aucun nouveau joueur détecté.');const {error}=await supabase.from('players').insert(rows);if(error)throw error;}
function parseDateText(text){let m=text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);if(m){let y=m[3];if(y.length===2)y='20'+y;return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}m=text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:'';}
async function importCalendar(){const rows=[];for(let i=0;i<importRows.length;i++){const cells=importRows[i].map(v=>String(v).trim()).filter(Boolean);const joined=cells.join(' ');if(!joined||i===0&&/date.*adversaire|calendrier/i.test(joined))continue;const date=parseDateText(joined);if(!date)continue;const tm=joined.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/i);const time=tm?`${tm[1].padStart(2,'0')}:${tm[2]}`:'15:00';let title=cells.find(v=>!parseDateText(v)&&!/domicile|extérieur|exterieur|journée|journee/i.test(v)&&!/^([01]?\d|2[0-3])[:h][0-5]\d$/i.test(v));if(!title||title.length>120)title='Match';const location=/domicile/i.test(joined)?'Domicile':(/extérieur|exterieur/i.test(joined)?'Extérieur':'');rows.push({team_id:currentTeam.id,type:'match',title,event_date:date,start_time:time,location,generated:false,created_by:session.user.id});}if(!rows.length)throw new Error('Aucun match avec date détecté.');const {error}=await supabase.from('events').insert(rows);if(error)throw error;}

init().catch(err=>{console.error(err);showOnly('configError');$('configError').querySelector('.muted').textContent='Erreur de démarrage : '+err.message;});
