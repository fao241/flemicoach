const $=id=>document.getElementById(id);

function currentFilter(){
  return document.querySelector('#calendar .filter.active')?.dataset.filter || 'all';
}

function cardType(card){
  const label=(card.querySelector('.eyebrow')?.textContent||'').trim().toLowerCase();
  if(label.startsWith('match')) return 'match';
  if(label.startsWith('entraînement')||label.startsWith('entrainement')) return 'training';
  return 'event';
}

function applyCalendarFilter(){
  const host=$('lifecycleHost');
  if(!host) return;
  const filter=currentFilter();
  host.querySelectorAll('.life-card').forEach(card=>{
    card.style.display=(filter==='all'||cardType(card)===filter)?'':'none';
  });
  const matchActions=$('matchActions');
  if(matchActions){
    const upcomingActive=!!host.querySelector('[data-life="upcoming"].active');
    matchActions.style.display=(upcomingActive&&(filter==='all'||filter==='match'))?'':'none';
  }
  const visible=[...host.querySelectorAll('.life-card')].some(card=>card.style.display!=='none');
  let empty=$('calendarFilterEmpty');
  if(!empty){
    empty=document.createElement('div');
    empty.id='calendarFilterEmpty';
    empty.className='card muted';
    empty.style.cssText='padding:24px;text-align:center;display:none';
    host.appendChild(empty);
  }
  if(!visible){
    empty.textContent=filter==='match'?'Aucun match dans cette période.':filter==='training'?'Aucun entraînement dans cette période.':'Aucun événement dans cette période.';
    empty.style.display='block';
  }else empty.style.display='none';
}

document.querySelectorAll('#calendar .filter').forEach(btn=>btn.addEventListener('click',()=>setTimeout(applyCalendarFilter,80)));
const observer=new MutationObserver(()=>applyCalendarFilter());
function attach(){
  const host=$('lifecycleHost');
  if(host){observer.disconnect();observer.observe(host,{childList:true,subtree:true});applyCalendarFilter();}
}
document.querySelector('[data-view="calendar"]')?.addEventListener('click',()=>setTimeout(attach,250));
window.addEventListener('focus',()=>setTimeout(attach,250));
setInterval(attach,1500);
setTimeout(attach,1200);
