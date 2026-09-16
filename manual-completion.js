import './analytics.js';
import './onboarding-fff.js';
import './future-completion-guard.js';
import './attendance-validation-fix.js';
import './player-absence-insights.js';
import './player-management.js';
import { supabase } from './supabase.js';
const $=id=>document.getElementById(id);
const teamId=()=>$('teamSelect')?.value||null;
let busy=false;

async function events(){
  const id=teamId(); if(!id)return [];
  const {data,error}=await supabase.from('events').select('*').eq('team_id',id).order('event_date').order('start_time');
  if(error){console.error(error);return []}return data||[];
}
const dateTime=e=>new Date(`${e.event_date}T${e.start_time||'00:00:00'}`);
const label=e=>e.type==='training'?'Entraînement':e.title||'Match';
const fmt=d=>new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'2-digit',month:'short'}).format(new Date(`${d}T12:00:00`));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const open=e=>!e.cancelled&&!e.completed;
async function finish(id){
  if(busy)return;busy=true;
  try{
    const {data:e,error:readError}=await supabase.from('events').select('id,title,type,event_date,completed,cancelled').eq('id',id).eq('team_id',teamId()).single();
    if(readError||!e)throw readError||new Error('Événement introuvable');
    if(!open(e))return;
    if(!confirm(`Terminer « ${label(e)} » maintenant ?\n\nL’événement passera dans l’historique et les réponses seront fermées.`))return;
    const now=new Date().toISOString();
    const {error}=await supabase.from('events').update({completed:true,completed_at:now,attendance_validated_at:now}).eq('id',id).eq('team_id',teamId());
    if(error)throw error;
    await sync();
  }catch(err){console.error(err);alert('Impossible de terminer cet événement.');}finally{busy=false}
}
function button(id){return `<button type="button" class="btn primary small-btn manual-finish" data-finish-id="${id}">✓ Terminer</button>`}
function bind(root=document){root.querySelectorAll('.manual-finish').forEach(b=>{if(b.dataset.bound)return;b.dataset.bound='1';b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();finish(b.dataset.finishId)})})}
async function sync(){
 const es=await events(), now=new Date(), upcoming=es.filter(e=>open(e)&&dateTime(e)>=now), done=es.filter(e=>e.completed);
 document.querySelectorAll('[data-event-id]').forEach(card=>{const e=es.find(x=>x.id===card.dataset.eventId);if(e?.completed)card.style.display='none'});
 const cal=document.getElementById('calendarLifecycle');
 if(cal){
   cal.querySelectorAll('[data-event-id]').forEach(card=>{const id=card.dataset.eventId,e=upcoming.find(x=>x.id===id);if(e&&!card.querySelector('.manual-finish')){const box=card.querySelector('.event-actions')||card;box.insertAdjacentHTML('beforeend',button(id))}});
   const hist=cal.querySelector('[data-history-list]')||document.getElementById('calendarHistoryList');
   if(hist){done.forEach(e=>{if(hist.querySelector(`[data-manual-history="${e.id}"]`))return;const d=document.createElement('div');d.className='card';d.dataset.manualHistory=e.id;d.innerHTML=`<div class="row between gap wrap"><div><strong>${esc(label(e))}</strong><div class="muted small">${esc(fmt(e.event_date))} · ${esc((e.start_time||'').slice(0,5))} · Terminé</div></div><span class="pill">Terminé manuellement</span></div>`;hist.appendChild(d)})}
 }
 const actions=document.getElementById('matchActions');if(actions){actions.querySelectorAll('[data-event-id]').forEach(card=>{const e=upcoming.find(x=>x.id===card.dataset.eventId);if(e&&!card.querySelector('.manual-finish'))card.insertAdjacentHTML('beforeend',button(e.id))})}
 bind();
}
function enhanceLanding(){
 const shell=document.querySelector('#authScreen .landing-shell'),grid=shell?.querySelector('.landing-grid');if(!shell||!grid||document.getElementById('landingStory'))return;
 const style=document.createElement('style');style.textContent=`#landingStory{margin:28px auto 0;max-width:1080px}.story-intro{text-align:center;max-width:720px;margin:0 auto 18px}.story-intro h2{font-size:clamp(1.55rem,4vw,2.2rem);margin:0 0 8px}.story-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.story-card{background:#fff;border:1px solid #dfe7e2;border-radius:20px;padding:20px;box-shadow:0 5px 18px rgba(20,49,34,.045)}.story-card h3{margin:0 0 8px}.story-card p{margin:0;color:#5f6d65;line-height:1.6}.story-season{margin:14px 0;background:linear-gradient(135deg,#14532d,#166534);color:#fff;border-radius:22px;padding:24px}.story-season h2{margin:0 0 10px;font-size:clamp(1.4rem,3vw,2rem)}.story-season p{color:#e8f5ec;line-height:1.65}.story-punch{font-weight:850;color:#fff!important;margin-top:14px!important}.story-list{margin:10px 0 0;padding-left:20px;color:#5f6d65;line-height:1.7}@media(max-width:720px){#landingStory{margin-top:20px}.story-grid{grid-template-columns:1fr}.story-card,.story-season{padding:18px;border-radius:18px}}`;document.head.appendChild(style);
 const s=document.createElement('section');s.id='landingStory';s.innerHTML=`<div class="story-intro"><h2>Tu connais le problème.</h2><p class="muted">Tu prépares une séance pour 16 joueurs. À quelques heures de l'entraînement, tu ne sais toujours pas combien seront vraiment là.</p></div><div class="story-grid"><article class="story-card"><h3>💬 Fini les « présent ? absent ? »</h3><p>Les réponses dispersées dans WhatsApp, ceux qui ne répondent pas et les relances à répétition : FlemiCoach centralise les disponibilités du groupe au même endroit.</p></article><article class="story-card"><h3>⚽ Prépare avec le bon effectif</h3><p>Tu sais combien de joueurs seront là avant la séance et tu peux adapter tes groupes, tes ateliers et tes oppositions au véritable effectif.</p></article></div><div class="story-season"><h2>Savoir qui vient, c'est bien. Comprendre ton groupe, c'est mieux.</h2><p>Présences réelles, taux de réponse, fiabilité et évolution de l'assiduité : FlemiCoach construit progressivement une vision utile de ton groupe sur toute la saison.</p><p class="story-punch">Avant la séance, tu sais qui vient. Après la séance, tu sais qui était là. Sur la saison, tu comprends ton groupe.</p></div><div class="story-grid"><article class="story-card"><h3>📊 Un vrai suivi dans le temps</h3><ul class="story-list"><li>Présences et absences réelles</li><li>Taux de réponse par joueur</li><li>Fiabilité entre réponse et présence réelle</li><li>Vision de l'assiduité sur la saison</li></ul></article><article class="story-card"><h3>📱 Plus simple aussi pour le groupe</h3><p>Aucune application à installer et aucun compte à créer. Les joueurs ou les familles ouvrent le lien et répondent simplement <strong>Présent</strong> ou <strong>Absent</strong>.</p></article></div>`;grid.insertAdjacentElement('afterend',s)
}
enhanceLanding();
document.addEventListener('click',e=>{const tab=e.target.closest?.('[data-tab]');if(tab&&['calendar','dashboard','home'].includes(tab.dataset.tab))setTimeout(sync,180)});document.getElementById('teamSelect')?.addEventListener('change',()=>setTimeout(sync,450));new MutationObserver(()=>{if(document.getElementById('app')&&!document.getElementById('app').classList.contains('hidden'))sync()}).observe(document.body,{subtree:true,childList:true});window.addEventListener('focus',sync);setInterval(sync,2500);sync();