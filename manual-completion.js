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
    if(match.completed||match.cancelled){
      card.remove();
      return;
    }
    const buttons=[...card.querySelectorAll('button')];
    const actions=buttons.find(b=>/whatsapp/i.test(b.textContent))?.parentElement || buttons[0]?.parentElement;
    addFinishButton(actions,match);
  });
  const remaining=box.querySelectorAll('.match-action-card,.card').length;
  if(!remaining){
    box.innerHTML='';
    box.style.display='none';
  }else{
    box.style.display='';
  }
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
    if(!history&&!e.cancelled){
      let actions=card.querySelector('.event-actions');
      if(!actions){actions=document.createElement('div');actions.className='event-actions';card.appendChild(actions);}
      addFinishButton(actions,e);
    }
  });
  host.querySelectorAll('[data-manual-completed]').forEach(x=>x.remove());
  if(history){
    const stack=host.querySelector('.stack'); if(!stack)return;
    list.filter(e=>e.completed&&!e.cancelled).sort((a,b)=>new Date(b.completed_at||b.event_date)-new Date(a.completed_at||a.event_date)).forEach(e=>{
      const card=document.createElement('div');card.className='card life-card';card.dataset.manualCompleted=e.id;card.dataset.eventType=e.type;
      card.innerHTML=`<div class="row between gap wrap"><div><div class="eyebrow">${e.type==='match'?'Match':e.type==='training'?'Entraînement':'Événement'} · Terminé</div><strong>${esc(e.title)}</strong><div class="muted small">${esc(fmtDate(e.event_date))} · ${esc(String(e.start_time||'').slice(0,5))}${e.location?' · '+esc(e.location):''}</div></div><span class="pill">Terminé manuellement</span></div>`;
      stack.prepend(card);
    });
  }
  applyTypeFilter();
}

function applyTypeFilter(){
  const host=$('lifecycleHost');if(!host)return;
  const f=document.querySelector('#calendar .filter.active')?.dataset.filter||'all';
  host.querySelectorAll('[data-manual-completed]').forEach(card=>{card.style.display=f==='all'||card.dataset.eventType===f?'':'none';});
}

async function nextOpenEvent(){
  const list=await events();
  return list.filter(e=>!e.completed&&!e.cancelled&&e.event_date>=todayISO()).sort((a,b)=>(a.event_date+String(a.start_time||'')).localeCompare(b.event_date+String(b.start_time||'')))[0]||null;
}

async function eventCounts(e){
  if(!e)return{present:0,absent:0,noReply:0};
  let eligibleIds=[];
  if(e.type==='match'){
    const {data}=await supabase.from('match_callups').select('player_id').eq('event_id',e.id);
    eligibleIds=(data||[]).map(x=>x.player_id);
  }else{
    const {data}=await supabase.from('players').select('id').eq('team_id',teamId()).eq('active',true);
    eligibleIds=(data||[]).map(x=>x.id);
  }
  if(!eligibleIds.length)return{present:0,absent:0,noReply:0};
  const {data}=await supabase.from('attendance').select('player_id,declared_status').eq('event_id',e.id).in('player_id',eligibleIds);
  const map=new Map((data||[]).map(x=>[x.player_id,x.declared_status]));
  let present=0,absent=0,noReply=0;
  eligibleIds.forEach(id=>{const s=map.get(id);if(s==='PRESENT')present++;else if(s==='ABSENT')absent++;else noReply++;});
  return{present,absent,noReply};
}

async function syncDashboard(){
  if(!$('dashboard')?.classList.contains('active-view')||!teamId())return;
  const e=await nextOpenEvent();
  const hero=$('dashboard')?.querySelector('.hero-card'); if(!hero)return;
  let finishBtn=$('homeFinishEvent');
  if(!finishBtn){
    finishBtn=document.createElement('button');finishBtn.id='homeFinishEvent';finishBtn.type='button';finishBtn.className='btn full top-gap-sm';
    const feedback=$('shareFeedback');feedback?.before(finishBtn);
  }
  if(!e){
    $('nextEventTitle').textContent='Aucun événement';
    $('nextEventMeta').textContent='Ajoute ou génère le planning.';
    $('nextEventBadge').textContent='—';
    $('nextPresent').textContent='0';$('nextAbsent').textContent='0';$('nextNoReply').textContent='0';
    finishBtn.style.display='none';
    return;
  }
  const c=await eventCounts(e);
  $('nextEventTitle').textContent=`${e.type==='training'?'Entraînement':e.title||'Événement'} · ${String(e.start_time||'').slice(0,5)}`;
  $('nextEventMeta').textContent=`${fmtDate(e.event_date)}${e.location?' · '+e.location:''}`;
  $('nextEventBadge').textContent=e.type==='match'?'Match':e.type==='training'?'Entraînement':'Événement';
  $('nextPresent').textContent=c.present;$('nextAbsent').textContent=c.absent;$('nextNoReply').textContent=c.noReply;
  finishBtn.style.display='block';finishBtn.textContent='✓ Terminer cet événement';finishBtn.onclick=()=>finish(e.id,e.title||'Événement');
}

async function syncAll(){
  await Promise.allSettled([syncCalendar(),syncDashboard()]);
}

document.querySelector('[data-view="calendar"]')?.addEventListener('click',()=>setTimeout(syncAll,400));
document.querySelector('[data-view="dashboard"]')?.addEventListener('click',()=>setTimeout(syncAll,300));
document.querySelectorAll('#calendar .filter').forEach(b=>b.addEventListener('click',()=>setTimeout(syncCalendar,180)));
$('teamSelect')?.addEventListener('change',()=>setTimeout(syncAll,600));
const obs=new MutationObserver(()=>{if(!busy)setTimeout(syncAll,100)});
setTimeout(()=>{const h=$('lifecycleHost');if(h)obs.observe(h,{childList:true,subtree:true});syncAll();},1500);
window.addEventListener('focus',()=>setTimeout(syncAll,250));
setInterval(syncAll,2500);
