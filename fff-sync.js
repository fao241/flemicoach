import { supabase } from './supabase.js';

const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let selectedClub = null;
let availableTeams = [];

function teamId() { return document.getElementById('teamSelect')?.value || ''; }
function status(text, kind='') {
  const el = document.getElementById('fffSyncStatus');
  if (!el) return;
  el.textContent = text || '';
  el.className = `small status-line ${kind}`.trim();
}

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('fff-sync', { body });
  if (error) throw new Error(error.message || 'Erreur de communication avec la synchronisation FFF.');
  if (data?.error) throw new Error(data.error);
  return data;
}

function ensureUi() {
  const importView = document.getElementById('import');
  if (!importView || document.getElementById('fffSyncCard')) return;
  const firstCard = importView.querySelector('.card');
  const card = document.createElement('div');
  card.id = 'fffSyncCard';
  card.className = 'card form-card';
  card.style.marginBottom = '16px';
  card.innerHTML = `
    <div class="row between gap wrap">
      <div>
        <h3 style="margin:0 0 4px">Synchroniser avec la FFF</h3>
        <div class="muted small">Recherche ton club, choisis ton équipe et importe automatiquement les matchs officiels.</div>
      </div>
      <span id="fffSyncBadge" class="pill">FFF</span>
    </div>
    <div id="fffConnected" class="hidden top-gap-sm"></div>
    <div id="fffSetup" class="top-gap-sm">
      <label class="field"><span>Club</span><div class="row gap"><input id="fffClubQuery" placeholder="Ex. Olympique Marcquois" autocomplete="off"><button id="fffClubSearch" type="button" class="btn">Rechercher</button></div></label>
      <div id="fffClubResults" class="stack"></div>
      <label id="fffTeamField" class="field hidden"><span>Équipe</span><select id="fffTeamSelect"><option value="">Choisir une équipe</option></select></label>
      <button id="fffStartSync" type="button" class="btn primary full hidden">Importer le calendrier FFF</button>
    </div>
    <div id="fffSyncStatus" class="small status-line"></div>`;
  importView.insertBefore(card, firstCard || null);

  document.getElementById('fffClubSearch').addEventListener('click', searchClubs);
  document.getElementById('fffClubQuery').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchClubs(); } });
  document.getElementById('fffStartSync').addEventListener('click', startSync);
  refreshState();
}

async function refreshState() {
  const id = teamId();
  if (!id) return;
  const { data } = await supabase.from('teams')
    .select('fff_club_id,fff_club_name,fff_team_label,fff_competition_id,fff_last_synced_at')
    .eq('id', id).maybeSingle();
  const connected = document.getElementById('fffConnected');
  const setup = document.getElementById('fffSetup');
  if (!connected || !setup) return;
  if (data?.fff_club_id && data?.fff_competition_id) {
    const date = data.fff_last_synced_at ? new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(data.fff_last_synced_at)) : 'jamais';
    connected.classList.remove('hidden');
    setup.classList.add('hidden');
    connected.innerHTML = `<div class="row between gap wrap"><div><strong>${esc(data.fff_club_name || 'Club FFF')}</strong><div class="muted small">${esc(data.fff_team_label || 'Équipe')} · dernière synchro : ${esc(date)}</div></div><div class="row gap"><button id="fffResync" class="btn primary" type="button">Resynchroniser</button><button id="fffChange" class="btn ghost" type="button">Changer</button></div></div>`;
    document.getElementById('fffResync').addEventListener('click', resync);
    document.getElementById('fffChange').addEventListener('click', () => { connected.classList.add('hidden'); setup.classList.remove('hidden'); status(''); });
  } else {
    connected.classList.add('hidden');
    setup.classList.remove('hidden');
  }
}

async function searchClubs() {
  const q = document.getElementById('fffClubQuery').value.trim();
  if (q.length < 2) return status('Tape au moins 2 caractères.', 'error');
  const results = document.getElementById('fffClubResults');
  results.innerHTML = '';
  status('Recherche du club…');
  try {
    const data = await invoke({ action:'search_clubs', query:q });
    const clubs = data.clubs || [];
    if (!clubs.length) return status('Aucun club trouvé.', 'error');
    status(`${clubs.length} club(s) trouvé(s).`);
    for (const club of clubs) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'list-row list-button';
      b.innerHTML = `<div><strong>${esc(club.name)}</strong><div class="muted small">${esc([club.city, club.district, club.affiliation].filter(Boolean).join(' · '))}</div></div>`;
      b.addEventListener('click', () => chooseClub(club, b));
      results.appendChild(b);
    }
  } catch (e) { status(e.message, 'error'); }
}

async function chooseClub(club, button) {
  selectedClub = club;
  document.querySelectorAll('#fffClubResults .list-button').forEach(x => x.classList.toggle('active', x === button));
  status(`Chargement des équipes de ${club.name}…`);
  try {
    const data = await invoke({ action:'list_teams', club_id:club.id });
    availableTeams = data.teams || [];
    const select = document.getElementById('fffTeamSelect');
    select.innerHTML = '<option value="">Choisir une équipe</option>';
    for (const t of availableTeams) {
      const o = document.createElement('option'); o.value = t.key; o.textContent = t.label; select.appendChild(o);
    }
    document.getElementById('fffTeamField').classList.remove('hidden');
    document.getElementById('fffStartSync').classList.toggle('hidden', !availableTeams.length);
    status(availableTeams.length ? `${availableTeams.length} engagement(s) trouvé(s).` : 'Aucune équipe engagée trouvée pour ce club.', availableTeams.length ? '' : 'error');
  } catch (e) { status(e.message, 'error'); }
}

async function startSync() {
  const key = document.getElementById('fffTeamSelect').value;
  const selectedTeam = availableTeams.find(t => t.key === key);
  if (!selectedClub || !selectedTeam) return status('Choisis d’abord le club et l’équipe.', 'error');
  status('Synchronisation du calendrier FFF…');
  const btn = document.getElementById('fffStartSync'); btn.disabled = true;
  try {
    const data = await invoke({ action:'sync', team_id:teamId(), club_id:selectedClub.id, club_name:selectedClub.name, fff_team:selectedTeam });
    status(`Synchronisation terminée : ${data.total} match(s), ${data.created} ajouté(s), ${data.updated} mis à jour.`, 'success');
    await refreshState();
    setTimeout(() => location.reload(), 700);
  } catch (e) { status(e.message, 'error'); }
  finally { btn.disabled = false; }
}

async function resync() {
  const btn = document.getElementById('fffResync');
  if (btn) btn.disabled = true;
  status('Resynchronisation FFF…');
  try {
    const data = await invoke({ action:'resync', team_id:teamId() });
    status(`Calendrier à jour : ${data.total} match(s), ${data.created} nouveau(x), ${data.updated} actualisé(s).`, 'success');
    setTimeout(() => location.reload(), 700);
  } catch (e) { status(e.message, 'error'); if (btn) btn.disabled = false; }
}

function boot() {
  ensureUi();
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    if (tab.dataset.view === 'import') setTimeout(refreshState, 0);
  }));
  document.getElementById('teamSelect')?.addEventListener('change', () => setTimeout(refreshState, 50));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
