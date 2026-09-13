import './fff-sync.js';

const $=id=>document.getElementById(id);
let selectedFilter='all';
let observer=null;

function ensureFilterCss(){
  if($('calendarFilterStrictCss'))return;
  const style=document.createElement('style');
  style.id='calendarFilterStrictCss';
  style.textContent=`
    #calendar.filter-mode-training #lifecycleHost .life-card[data-event-type="match"],
    #calendar.filter-mode-training #lifecycleHost .life-card[data-event-type="event"]{display:none!important}
    #calendar.filter-mode-training #matchActions{display:none!important}

    #calendar.filter-mode-match #lifecycleHost .life-card[data-event-type="training"],
    #calendar.filter-mode-match #lifecycleHost .life-card[data-event-type="event"]{display:none!important}

    #calendar.filter-mode-all #lifecycleHost .life-card{display:block}
  `;
  document.head.appendChild(style);
}

function detectType(card){
  const label=(card.querySelector('.eyebrow')?.textContent||'').trim().toLowerCase();
  if(label.startsWith('match'))return'match';
  if(label.startsWith('entraînement')||label.startsWith('entrainement'))return'training';
  return'event';
}

function classifyCards(){
  const host=$('lifecycleHost');
  if(!host)return;
  host.querySelectorAll('.life-card').forEach(card=>{
    card.dataset.eventType=detectType(card);
  });
}

function applyFilter(){
  ensureFilterCss();
  classifyCards();
  const calendar=$('calendar');
  if(!calendar)return;
  calendar.classList.remove('filter-mode-all','filter-mode-training','filter-mode-match');
  calendar.classList.add(`filter-mode-${selectedFilter}`);

  document.querySelectorAll('#calendar .filter').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.filter===selectedFilter);
  });

  const host=$('lifecycleHost');
  if(!host)return;
  const cards=[...host.querySelectorAll('.life-card')];
  const visible=cards.filter(card=>selectedFilter==='all'||card.dataset.eventType===selectedFilter);

  let empty=$('calendarFilterEmpty');
  if(!empty){
    empty=document.createElement('div');
    empty.id='calendarFilterEmpty';
    empty.className='card muted';
    empty.style.cssText='padding:24px;text-align:center;display:none';
    host.appendChild(empty);
  }
  if(!visible.length){
    empty.textContent=selectedFilter==='training'?'Aucun entraînement dans cette période.':selectedFilter==='match'?'Aucun match dans cette période.':'Aucun événement dans cette période.';
    empty.style.display='block';
  }else{
    empty.style.display='none';
  }
}

function wireFilters(){
  document.querySelectorAll('#calendar .filter').forEach(btn=>{
    if(btn.dataset.strictFilterWired)return;
    btn.dataset.strictFilterWired='1';
    btn.addEventListener('click',()=>{
      selectedFilter=btn.dataset.filter||'all';
      requestAnimationFrame(applyFilter);
      setTimeout(applyFilter,120);
      setTimeout(applyFilter,450);
    });
  });
}

function attach(){
  ensureFilterCss();
  wireFilters();
  const host=$('lifecycleHost');
  if(!host)return;
  if(observer)observer.disconnect();
  observer=new MutationObserver(()=>requestAnimationFrame(applyFilter));
  observer.observe(host,{childList:true,subtree:true});
  applyFilter();
}

document.querySelector('[data-view="calendar"]')?.addEventListener('click',()=>setTimeout(attach,200));
$('teamSelect')?.addEventListener('change',()=>setTimeout(attach,250));
setTimeout(attach,700);
setTimeout(attach,1500);
