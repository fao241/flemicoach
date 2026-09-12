import './analytics.js';
import './onboarding-fff.js';
import { supabase } from './supabase.js';
const $=id=>document.getElementById(id);
const teamId=()=>$('teamSelect')?.value||null;
let busy=false;

async function events(){
  const id=teamId(); if(!id)return [];
  const {data,error}=await supabase.from('events').select('id,type,title,event_date,start_time,location,public_token,completed,completed_at,cancelled').eq('team_id',id);
  if(error){console.error(error);return [];} return data||[];
}

async function finish(id,title){
  if(busy)return;
  if(!confirm(`Terminer « ${title} » maintenant ?\n\nL’événement passera dans l’historique et les réponses parents seront fermées.`))return;
  busy=true;
  const {error}=await supabase.from('events').update({completed:true,completed_at:new Date().toISOString()}).eq('id',id);
  busy=false;
  if(error)return alert(`Impossible de terminer l’événement : ${error.message}`);
  await syncAll();
}

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtDate(iso){if(!iso)return'';const[y,m,d]=iso.split('-').map(Number);return new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date(y,m-1,d,12));}
function norm(v=''){return String(v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

function addFinishButton(actions,e){
  if(!actions||actions.querySelector('[data-finish]'))return;
  const b=document.createElement('button');
  b.type='button';b.className='btn primary small-btn';b.dataset.finish=e.id;b.textContent='✓ Terminer';
  b.onclick=ev=>{ev.preventDefault();ev.stopPropagation();finish(e.id,e.title)};
  actions.prepend(b);
}

function wireMatchCallupCards(list){
  const box=$('matchActions'); if(!box)return;
  box.querySelectorAll('.match-action-card,.card').forEach(card=>{
    const text=norm(card.textContent);
    const match=list.find(x=>x.type==='match'&&text.includes(norm(x.title)));
    if(!match)return;
    if(match.completed||match.cancelled){card.remove();return;}
    const buttons=[...card.querySelectorAll('button')];
    const actions=buttons.find(b=>/whatsapp/i.test(b.textContent))?.parentElement || buttons[0]?.parentElement;
    addFinishButton(actions,match);
  });
  const remaining=box.querySelectorAll('.match-action-card,.card').length;
  if(!remaining){box.innerHTML='';box.style.display='none';}else{box.style.display='';}
}

async function syncCalendar(){
  if(!$('calendar')?.classList.contains('active-view'))return;
  const list=await events();
  wireMatchCallupCards(list);
  const host=$('lifecycleHost'); if(!host)return;
  const map=new Map(list.map(e=>[e.id,e]));
  const history=!!host.querySelector('[data-life="past"].active');
  host.querySelectorAll('.life-card[data-detail]').forEach(card=>{
    const e=map.get(card.dataset.detail); if(!e)return;
    if(e.completed){card.style.display='none';return;}
    if(!history&&!e.cancelled){let actions=card.querySelector('.event-actions');if(!actions){actions=document.createElement('div');actions.className='event-actions';card.appendChild(actions);}addFinishButton(actions,e);}
  });
  host.querySelectorAll('[data-manual-completed]').forEach(x=>x.remove());
  if(history){
    const stack=host.querySelector('.stack'); if(!stack)return;
    list.filter(e=>e.completed&&!e.cancelled).sort((a,b)=>new Date(b.completed_at||b.event_date)-new Date(a.completed_at||a.event_date)).forEach(e=>{
      const card=document.createElement('div');card.className='card life-card';card.dataset.manualCompleted=e.id;card.dataset.eventType=e.type;
      card.innerHTML=`<div class="row between gap wrap"><div><div class="eyebrow">${e.type==='match'?'Match':e.type==='training'?'Entraînement':'Événement'} · Terminé</div><strong>${esc(e.title)}</strong><div class="muted small">${esc(fmtDate(e.event_date))} · ${esc(String(e.start_time||'').slice(0,5))}${e.location?' · '+esc(e.location):''}</div></div><span class="pill">Terminé manuellement</span></div>`;stack.prepend(card);
    });
  }
  applyTypeFilter();
}
function applyTypeFilter(){const host=$('lifecycleHost');if(!host)return;const f=document.querySelector('#calendar .filter.active')?.dataset.filter||'all';host.querySelectorAll('[data-manual-completed]').forEach(card=>{card.style.display=f==='all'||card.dataset.eventType===f?'':'none';});}
async function nextOpenEvent(){const list=await events();return list.filter(e=>!e.completed&&!e.cancelled&&e.event_date>=todayISO()).sort((a,b)=>(a.event_date+String(a.start_time||'')).localeCompare(b.event_date+String(b.start_time||'')))[0]||null;}
async function eventCounts(e){if(!e)return{present:0,absent:0,noReply:0};let eligibleIds=[];if(e.type==='match'){const {data}=await supabase.from('match_callups').select('player_id').eq('event_id',e.id);eligibleIds=(data||[]).map(x=>x.player_id);}else{const {data}=await supabase.from('players').select('id').eq('team_id',teamId()).eq('active',true);eligibleIds=(data||[]).map(x=>x.id);}if(!eligibleIds.length)return{present:0,absent:0,noReply:0};const {data}=await supabase.from('attendance').select('player_id,declared_status').eq('event_id',e.id).in('player_id',eligibleIds);const map=new Map((data||[]).map(x=>[x.player_id,x.declared_status]));let present=0,absent=0,noReply=0;eligibleIds.forEach(id=>{const s=map.get(id);if(s==='PRESENT')present++;else if(s==='ABSENT')absent++;else noReply++;});return{present,absent,noReply};}
async function syncDashboard(){if(!$('dashboard')?.classList.contains('active-view')||!teamId())return;const e=await nextOpenEvent();const hero=$('dashboard')?.querySelector('.hero-card');if(!hero)return;let finishBtn=$('homeFinishEvent');if(!finishBtn){finishBtn=document.createElement('button');finishBtn.id='homeFinishEvent';finishBtn.type='button';finishBtn.className='btn full top-gap-sm';const feedback=$('shareFeedback');feedback?.before(finishBtn);}if(!e){$('nextEventTitle').textContent='Aucun événement';$('nextEventMeta').textContent='Ajoute ou génère le planning.';$('nextEventBadge').textContent='—';$('nextPresent').textContent='0';$('nextAbsent').textContent='0';$('nextNoReply').textContent='0';finishBtn.style.display='none';return;}const c=await eventCounts(e);$('nextEventTitle').textContent=`${e.type==='training'?'Entraînement':e.title||'Événement'} · ${String(e.start_time||'').slice(0,5)}`;$('nextEventMeta').textContent=`${fmtDate(e.event_date)}${e.location?' · '+e.location:''}`;$('nextEventBadge').textContent=e.type==='match'?'Match':e.type==='training'?'Entraînement':'Événement';$('nextPresent').textContent=c.present;$('nextAbsent').textContent=c.absent;$('nextNoReply').textContent=c.noReply;finishBtn.style.display='block';finishBtn.textContent='✓ Terminer cet événement';finishBtn.onclick=()=>finish(e.id,e.title||'Événement');}
async function syncAll(){await Promise.allSettled([syncCalendar(),syncDashboard()]);}

function enhanceLanding(){
  const shell=document.querySelector('#authScreen .landing-shell');const grid=document.querySelector('#authScreen .landing-grid');if(!shell||!grid||$('landingStory'))return;
  const style=document.createElement('style');style.textContent=`.landing-story{margin-top:56px;padding-top:44px;border-top:1px solid #dfe7e2}.landing-story-intro{text-align:center;max-width:780px;margin:0 auto 30px}.landing-story-intro h2{font-size:clamp(1.7rem,3vw,2.45rem);letter-spacing:-.045em;margin:0 0 10px}.landing-story-intro p{color:#66736c;line-height:1.65;margin:0}.landing-pain{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:28px 0}.landing-story-card{background:rgba(255,255,255,.82);border:1px solid #dfe7e2;border-radius:18px;padding:24px;box-shadow:0 10px 30px rgba(20,50,30,.04)}.landing-story-card h3{margin:0 0 10px;font-size:1.08rem}.landing-story-card p{margin:0;color:#657169;line-height:1.6}.landing-story-card strong{color:#173f28}.landing-season{margin-top:18px;padding:28px;border-radius:20px;background:#173f28;color:#fff;text-align:center}.landing-season h2{margin:0 0 12px;font-size:clamp(1.45rem,2.7vw,2.1rem);letter-spacing:-.035em}.landing-season p{margin:0 auto;max-width:820px;color:#dce8df;line-height:1.7}.landing-season-line{margin-top:18px!important;color:#fff!important;font-weight:850;font-size:1.03rem}.landing-simple{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px}.landing-simple ul{margin:12px 0 0;padding-left:20px;color:#657169;line-height:1.8}.landing-simple li::marker{color:#166534}@media(max-width:820px){.landing-story{margin-top:38px;padding-top:34px}.landing-pain,.landing-simple{grid-template-columns:1fr}.landing-story-card{text-align:left}.landing-season{padding:24px 18px}}`;document.head.appendChild(style);
  const story=document.createElement('section');story.id='landingStory';story.className='landing-story';story.innerHTML=`<div class="landing-story-intro"><h2>Tu connais le problème.</h2><p>Tu prépares une séance pour 16 joueurs. À quelques heures de l'entraînement, tu ne sais toujours pas combien seront vraiment là.</p></div><div class="landing-pain"><div class="landing-story-card"><h3>💬 Fini les « présent ? absent ? »</h3><p>Certains répondent sur WhatsApp, d'autres ne répondent pas, une réponse date de trois jours… et tu dois encore relancer. <strong>FlemiCoach regroupe les disponibilités au même endroit.</strong></p></div><div class="landing-story-card"><h3>⚽ Prépare avec le bon effectif</h3><p>Vois rapidement qui sera là avant l'entraînement ou le match et adapte tes groupes, ateliers et oppositions sans découvrir ton effectif au dernier moment.</p></div></div><div class="landing-season"><h2>Savoir qui vient, c'est bien. Comprendre ton groupe, c'est mieux.</h2><p>Présence réelle, taux de réponse, fiabilité et assiduité : au fil des semaines, tu vois qui est régulier, qui répond, qui ne répond jamais et qui annonce présent sans venir.</p><p class="landing-season-line">Avant la séance, tu sais qui vient. Après la séance, tu sais qui était là. Sur la saison, tu comprends ton groupe.</p></div><div class="landing-simple"><div class="landing-story-card"><h3>📊 Un vrai suivi dans le temps</h3><ul><li>Présences réelles et absences</li><li>Taux de réponse de chaque joueur</li><li>Fiabilité entre réponse et présence</li><li>Vision de l'assiduité sur la saison</li></ul></div><div class="landing-story-card"><h3>📱 Plus simple aussi pour le groupe</h3><p>Pas d'application à installer et pas de compte à créer pour répondre. Joueurs ou familles ouvrent le lien, sélectionnent le joueur et indiquent <strong>Présent / Absent</strong> en quelques secondes.</p></div></div>`;grid.after(story);
}

document.querySelector('[data-view="calendar"]')?.addEventListener('click',()=>setTimeout(syncAll,400));
document.querySelector('[data-view="dashboard"]')?.addEventListener('click',()=>setTimeout(syncAll,300));
document.querySelectorAll('#calendar .filter').forEach(b=>b.addEventListener('click',()=>setTimeout(syncCalendar,180)));
$('teamSelect')?.addEventListener('change',()=>setTimeout(syncAll,600));
const obs=new MutationObserver(()=>{if(!busy)setTimeout(syncAll,100)});
setTimeout(()=>{const h=$('lifecycleHost');if(h)obs.observe(h,{childList:true,subtree:true});syncAll();},1500);
window.addEventListener('focus',()=>setTimeout(syncAll,250));
setInterval(syncAll,2500);
enhanceLanding();
