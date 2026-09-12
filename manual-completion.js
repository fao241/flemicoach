import { supabase } from './supabase.js';
const $=id=>document.getElementById(id);
const teamId=()=>$('teamSelect')?.value||null;
let busy=false;

async function events(){
  const id=teamId(); if(!id)return [];
  const {data,error}=await supabase.from('events').select('id,type,title,event_date,start_time,location,completed,completed_at,cancelled').eq('team_id',id);
  if(error){console.error(error);return [];} return data||[];
}

async function finish(id,title){
  if(busy)return;
  if(!confirm(`Terminer « ${title} » maintenant ?\n\nL’événement passera dans l’historique et les réponses parents seront fermées.`))return;
  busy=true;
  const {error}=await supabase.from('events').update({completed:true,completed_at:new Date().toISOString()}).eq('id',id);
  busy=false;
  if(error)return alert(`Impossible de terminer l’événement : ${error.message}`);
  document.querySelector('[data-view="calendar"]')?.click();
  setTimeout(()=>document.querySelector('#lifecycleHost [data-life="past"]')?.click(),450);
  setTimeout(sync,800);
}

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtDate(iso){if(!iso)return'';const[y,m,d]=iso.split('-').map(Number);return new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date(y,m-1,d,12));}
function norm(v=''){return String(v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}

function addFinishButton(actions,e){
  if(!actions||actions.querySelector('[data-finish]'))return;
  const b=document.createElement('button');
  b.type='button';b.className='btn primary small-btn';b.dataset.finish=e.id;b.textContent='✓ Terminer';
  b.onclick=ev=>{ev.preventDefault();ev.stopPropagation();finish(e.id,e.title)};
  actions.prepend(b);
}

function wireMatchCallupCards(list){
  const box=$('matchActions'); if(!box)return;
  box.querySelectorAll('.card').forEach(card=>{
    const text=norm(card.textContent);
    const e=list.find(x=>x.type==='match'&&!x.completed&&!x.cancelled&&text.includes(norm(x.title)));
    if(!e)return;
    const buttons=[...card.querySelectorAll('button')];
    const actions=buttons.find(b=>/whatsapp/i.test(b.textContent))?.parentElement || buttons[0]?.parentElement;
    addFinishButton(actions,e);
  });
}

async function sync(){
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

document.querySelector('[data-view="calendar"]')?.addEventListener('click',()=>setTimeout(sync,500));
document.querySelectorAll('#calendar .filter').forEach(b=>b.addEventListener('click',()=>setTimeout(sync,180)));
$('teamSelect')?.addEventListener('change',()=>setTimeout(sync,600));
const obs=new MutationObserver(()=>{if(!busy)setTimeout(sync,80)});
setTimeout(()=>{const h=$('lifecycleHost');if(h)obs.observe(h,{childList:true,subtree:true});sync();},1500);
setInterval(sync,2000);
