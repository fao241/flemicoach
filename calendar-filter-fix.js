import './fff-sync.js';

const $=id=>document.getElementById(id);
let observer=null;
let selectedFilter='all';
let applying=false;

function detectType(card){
  const label=(card.querySelector('.eyebrow')?.textContent||'').trim().toLowerCase();
  if(label.startsWith('match')) return 'match';
  if(label.startsWith('entraînement')||label.startsWith('entrainement')) return 'training';
  return 'event';
}

function applyCalendarFilter(){
  if(applying)return;
  applying=true;
  try{
    const host=$('lifecycleHost');
    if(!host)return;

    const cards=[...host.querySelectorAll('.life-card')];
    for(const card of cards){
      const type=detectType(card);
      const visible=selectedFilter==='all'||type===selectedFilter;
      card.style.display=visible?'':'none';
    }

    // Les convocations ne concernent que l'onglet Matchs.
    const matchActions=$('matchActions');
    if(matchActions) matchActions.style.display=selectedFilter==='match'?'':'none';

    const anyVisible=cards.some(card=>card.style.display!=='none');
    let empty=$('calendarFilterEmpty');
    if(!empty){
      empty=document.createElement('div');
      empty.id='calendarFilterEmpty';
      empty.className='card muted';
      empty.style.cssText='padding:24px;text-align:center;display:none';
      host.appendChild(empty);
    }
    if(!anyVisible){
      empty.textContent=selectedFilter==='match'?'Aucun match dans cette période.':selectedFilter==='training'?'Aucun entraînement dans cette période.':selectedFilter==='event'?'Aucun autre événement dans cette période.':'Aucun événement dans cette période.';
      empty.style.display='block';
    }else empty.style.display='none';
  }finally{applying=false;}
}

function setFilter(value){
  selectedFilter=value||'all';
  document.querySelectorAll('#calendar .filter').forEach(btn=>btn.classList.toggle('active',btn.dataset.filter===selectedFilter));
  applyCalendarFilter();
  // D'autres scripts peuvent rerendre le calendrier juste après le clic.
  setTimeout(applyCalendarFilter,100);
  setTimeout(applyCalendarFilter,400);
}

function wireFilters(){
  document.querySelectorAll('#calendar .filter').forEach(btn=>{
    if(btn.dataset.authoritativeFilter)return;
    btn.dataset.authoritativeFilter='1';
    // Capture : on neutralise l'ancien gestionnaire de filtre de app.js,
    // qui rerendait une autre liste et créait des incohérences.
    btn.addEventListener('click',e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      setFilter(btn.dataset.filter);
    },true);
  });
}

function attach(){
  wireFilters();
  const host=$('lifecycleHost');
  if(!host)return;
  if(observer)observer.disconnect();
  observer=new MutationObserver(()=>queueMicrotask(applyCalendarFilter));
  observer.observe(host,{childList:true,subtree:true});
  applyCalendarFilter();
}

document.querySelector('[data-view="calendar"]')?.addEventListener('click',()=>setTimeout(attach,200));
$('teamSelect')?.addEventListener('change',()=>setTimeout(attach,250));
window.addEventListener('focus',()=>setTimeout(attach,100));
setTimeout(attach,700);
setTimeout(attach,1500);
