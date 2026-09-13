import './fff-sync.js';

const $=id=>document.getElementById(id);
let observer=null;
let applying=false;

function currentFilter(){
  return document.querySelector('#calendar .filter.active')?.dataset.filter || 'all';
}

function cardType(card){
  const explicit=card.dataset.eventType;
  if(explicit) return explicit;
  const label=(card.querySelector('.eyebrow')?.textContent||'').trim().toLowerCase();
  if(label.startsWith('match')) return 'match';
  if(label.startsWith('entraînement')||label.startsWith('entrainement')) return 'training';
  return 'event';
}

function applyCalendarFilter(){
  if(applying) return;
  applying=true;
  try{
    const host=$('lifecycleHost');
    if(!host) return;
    const filter=currentFilter();
    const cards=[...host.querySelectorAll('.life-card')];
    cards.forEach(card=>{
      const type=cardType(card);
      card.dataset.eventType=type;
      card.hidden=!(filter==='all'||type===filter);
    });

    // Les convocations sont une action propre aux matchs : on ne les affiche
    // que dans le filtre Matchs, sinon elles donnent l'impression que "Tous"
    // ne contient que les matchs.
    const matchActions=$('matchActions');
    if(matchActions){
      const upcomingActive=!!host.querySelector('[data-life="upcoming"].active');
      matchActions.style.display=(upcomingActive&&filter==='match')?'':'none';
    }

    const visible=cards.some(card=>!card.hidden);
    let empty=$('calendarFilterEmpty');
    if(!empty){
      empty=document.createElement('div');
      empty.id='calendarFilterEmpty';
      empty.className='card muted';
      empty.style.cssText='padding:24px;text-align:center;display:none';
      host.appendChild(empty);
    }
    if(!visible){
      empty.textContent=filter==='match'?'Aucun match dans cette période.':filter==='training'?'Aucun entraînement dans cette période.':filter==='event'?'Aucun autre événement dans cette période.':'Aucun événement dans cette période.';
      empty.style.display='block';
    }else empty.style.display='none';
  } finally {
    applying=false;
  }
}

function attach(){
  const host=$('lifecycleHost');
  if(!host) return;
  if(observer) observer.disconnect();
  observer=new MutationObserver(()=>queueMicrotask(applyCalendarFilter));
  observer.observe(host,{childList:true,subtree:true});
  applyCalendarFilter();
}

document.querySelectorAll('#calendar .filter').forEach(btn=>btn.addEventListener('click',()=>{
  requestAnimationFrame(()=>{
    applyCalendarFilter();
    // renderMatchActions peut remettre son bloc visible après le clic.
    setTimeout(applyCalendarFilter,250);
  });
}));

document.querySelector('[data-view="calendar"]')?.addEventListener('click',()=>setTimeout(attach,250));
$('teamSelect')?.addEventListener('change',()=>setTimeout(attach,300));
window.addEventListener('focus',()=>setTimeout(attach,150));

// Pas de polling : l'ancien setInterval recréait l'état toutes les 1,5 s
// et provoquait le clignotement entre convocations et événements.
setTimeout(attach,900);
setTimeout(attach,1800);
