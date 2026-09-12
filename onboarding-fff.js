import { supabase } from './supabase.js';

const $ = id => document.getElementById(id);
const esc = (v='') => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const days = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
let selectedClub = null;
let availableTeams = [];
let manualMode = false;
let initialized = false;

function seasonDates(){
  const now = new Date();
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 6 ? y : y - 1;
  return { start:`${startYear}-09-01`, end:`${startYear+1}-06-30` };
}
function setStatus(text,kind=''){
  const el=$('onboardFeedback'); if(!el)return;
  el.textContent=text||''; el.className=`status-line ${kind}`.trim();
}
async function invoke(body){
  const {data,error}=await supabase.functions.invoke('fff-sync',{body});
  if(error)throw new Error(error.message||'Erreur de synchronisation FFF.');
  if(data?.error)throw new Error(data.error);
  return data;
}
function ruleRow({weekday=2,start_time='18:15',end_time='19:45'}={}){
  const row=document.createElement('div'); row.className='grid three rule-row';
  row.innerHTML=`<label class="field"><span>Jour</span><select class="ob-weekday">${days.map((d,i)=>`<option value="${i}" ${i===weekday?'selected':''}>${d}</option>`).join('')}</select></label><label class="field"><span>Début</span><input class="ob-start" type="time" value="${start_time}" required></label><label class="field"><span>Fin</span><div class="row gap"><input class="ob-end" type="time" value="${end_time}" required><button type="button" class="btn ghost small-btn ob-remove" aria-label="Supprimer">×</button></div></label>`;
  row.querySelector('.ob-remove').onclick=()=>row.remove();
  return row;
}
function addRule(data){$('onboardRules')?.appendChild(ruleRow(data));}
function selectedTeam(){return availableTeams.find(t=>t.key===$('onboardFFFTeam')?.value)||null;}

function buildUi(){
  const form=$('onboardingForm'); if(!form||form.dataset.fffOnboarding)return;
  form.dataset.fffOnboarding='1';
  form.innerHTML=`
    <div id="onboardFFFPath" class="form-stack">
      <div>
        <div class="eyebrow">1 · Ton club</div>
        <h3 style="margin:4px 0 6px">Trouve ton club</h3>
        <div class="muted small">FlemiCoach récupère ton équipe et son calendrier officiel. Tu n'as pas besoin de saisir la catégorie ou le nom de l'équipe.</div>
      </div>
      <label class="field"><span>Club</span><div class="row gap"><input id="onboardClubQuery" placeholder="Ex. Olympique Marcquois" autocomplete="off"><button id="onboardClubSearch" type="button" class="btn">Rechercher</button></div></label>
      <div id="onboardClubResults" class="stack"></div>
      <label id="onboardTeamField" class="field hidden"><span>Équipe</span><select id="onboardFFFTeam"><option value="">Choisir mon équipe</option></select></label>
      <button id="onboardManual" type="button" class="btn ghost">Mon club ou mon équipe n'est pas disponible</button>
    </div>
    <div id="onboardManualFields" class="hidden"><label class="field"><span>Nom de l'équipe</span><input id="onboardManualName" placeholder="Ex. U13 A"></label></div>
    <div>
      <div class="eyebrow">2 · Tes entraînements</div>
      <h3 style="margin:4px 0 6px">Quand vous entraînez-vous ?</h3>
      <div class="muted small">La saison en cours est configurée automatiquement. Tu pourras la modifier plus tard dans les paramètres.</div>
    </div>
    <div id="onboardRules" class="stack"></div>
    <button id="onboardAddRule" class="btn ghost" type="button">+ Ajouter un créneau</button>
    <button id="onboardSubmit" class="btn primary full" type="submit">Créer mon espace</button>`;
  addRule({weekday:2,start_time:'18:15',end_time:'19:45'});
  addRule({weekday:5,start_time:'18:15',end_time:'19:45'});
  $('onboardAddRule').onclick=()=>addRule({weekday:2,start_time:'18:15',end_time:'19:45'});
  $('onboardClubSearch').onclick=searchClubs;
  $('onboardClubQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchClubs();}});
  $('onboardManual').onclick=()=>{
    manualMode=!manualMode;
    $('onboardManualFields').classList.toggle('hidden',!manualMode);
    $('onboardFFFPath').querySelectorAll('input,select,button').forEach(el=>{if(el.id!=='onboardManual')el.disabled=manualMode;});
    $('onboardManual').disabled=false;
    $('onboardManual').textContent=manualMode?'← Rechercher mon club sur la FFF':"Mon club ou mon équipe n'est pas disponible";
    setStatus('');
  };
}

async function searchClubs(){
  const q=$('onboardClubQuery').value.trim();
  if(q.length<2)return setStatus('Tape au moins 2 caractères.','error');
  $('onboardClubResults').innerHTML=''; setStatus('Recherche du club…');
  const {data,error}=await supabase.rpc('search_fff_clubs_local',{q,result_limit:20});
  if(error)return setStatus(error.message||'Recherche impossible.','error');
  if(!data?.length)return setStatus('Aucun club trouvé. Tu peux utiliser la configuration manuelle.','error');
  setStatus(`${data.length} club(s) trouvé(s).`);
  for(const club of data){
    const b=document.createElement('button'); b.type='button'; b.className='list-row list-button';
    b.innerHTML=`<div><strong>${esc(club.name)}</strong><div class="muted small">${esc([club.city,club.district,club.affiliation].filter(Boolean).join(' · '))}</div></div>`;
    b.onclick=()=>chooseClub(club,b); $('onboardClubResults').appendChild(b);
  }
}
async function chooseClub(club,button){
  selectedClub=club;
  document.querySelectorAll('#onboardClubResults .list-button').forEach(x=>x.classList.toggle('active',x===button));
  setStatus(`Chargement des équipes de ${club.name}…`);
  try{
    const data=await invoke({action:'list_teams',club_id:club.id}); availableTeams=data.teams||[];
    const select=$('onboardFFFTeam'); select.innerHTML='<option value="">Choisir mon équipe</option>';
    availableTeams.forEach(t=>{const o=document.createElement('option');o.value=t.key;o.textContent=t.label;select.appendChild(o);});
    $('onboardTeamField').classList.remove('hidden');
    setStatus(availableTeams.length?`${availableTeams.length} équipe(s) trouvée(s). Choisis la tienne.`:'Aucune équipe engagée trouvée. Tu peux continuer manuellement.',availableTeams.length?'':'error');
  }catch(e){setStatus(e.message||'Impossible de charger les équipes.','error');}
}

async function submitOnboarding(e){
  const form=$('onboardingForm');
  if(!form?.dataset.fffOnboarding)return;
  e.preventDefault(); e.stopImmediatePropagation();
  const fffTeam=selectedTeam();
  const name=manualMode?$('onboardManualName').value.trim():(fffTeam?.label||'');
  if(!name)return setStatus(manualMode?"Indique un nom d'équipe.":'Choisis ton club puis ton équipe, ou utilise la configuration manuelle.','error');
  const rows=[...$('onboardRules').querySelectorAll('.rule-row')].map(row=>({weekday:Number(row.querySelector('.ob-weekday').value),start_time:row.querySelector('.ob-start').value,end_time:row.querySelector('.ob-end').value}));
  if(!rows.length)return setStatus("Ajoute au moins un créneau d'entraînement.",'error');
  const {data:{session}}=await supabase.auth.getSession(); if(!session)return setStatus('Session expirée. Reconnecte-toi.','error');
  const btn=$('onboardSubmit'); btn.disabled=true; btn.textContent='Création de ton espace…'; setStatus('Création de l’équipe et des entraînements…');
  const season=seasonDates();
  try{
    const {data:team,error}=await supabase.from('teams').insert({created_by:session.user.id,name,season_start:season.start,season_end:season.end}).select().single();
    if(error)throw error;
    const {error:memberError}=await supabase.from('team_members').insert({team_id:team.id,user_id:session.user.id,role:'owner'}); if(memberError)throw memberError;
    const {error:rulesError}=await supabase.from('training_rules').insert(rows.map(r=>({...r,team_id:team.id}))); if(rulesError)throw rulesError;
    const {error:regenError}=await supabase.rpc('regenerate_training_events',{p_team_id:team.id}); if(regenError)throw regenError;
    if(selectedClub&&fffTeam&&!manualMode){
      setStatus('Équipe créée. Import du calendrier FFF…');
      try{await invoke({action:'sync',team_id:team.id,club_id:selectedClub.id,club_name:selectedClub.name,fff_team:fffTeam});}
      catch(syncError){console.warn('FFF onboarding sync failed',syncError); sessionStorage.setItem('flemicoach-onboarding-warning','Équipe créée, mais le calendrier FFF n’a pas pu être importé. Tu peux relancer la synchronisation depuis Importer.');}
    }
    sessionStorage.setItem('flemicoach-team',team.id);
    location.reload();
  }catch(err){btn.disabled=false;btn.textContent='Créer mon espace';setStatus(err.message||'Création impossible.','error');}
}

function init(){
  if(initialized)return; initialized=true;
  const screen=$('onboardingScreen'); if(!screen)return;
  const observer=new MutationObserver(()=>{if(!screen.classList.contains('hidden'))buildUi();});
  observer.observe(screen,{attributes:true,attributeFilter:['class']});
  if(!screen.classList.contains('hidden'))buildUi();
  document.addEventListener('submit',e=>{if(e.target?.id==='onboardingForm')submitOnboarding(e);},true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
