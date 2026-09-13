import { supabase } from './supabase.js';

const $ = id => document.getElementById(id);
const teamId = () => $('teamSelect')?.value || null;
let selectedPlayerId = null;
let eventSaving = false;

function addStyles(){
  if ($('feedbackStyles')) return;
  const style = document.createElement('style');
  style.id = 'feedbackStyles';
  style.textContent = `
    .reliability-help{display:inline-grid;place-items:center;width:18px;height:18px;margin-left:5px;border:1px solid #9eaca3;border-radius:50%;font-size:11px;font-weight:900;color:#405248;cursor:pointer;vertical-align:middle;background:#fff;padding:0;line-height:1}
    .reliability-help:hover,.reliability-help:focus{border-color:#166534;color:#166534;outline:none;box-shadow:0 0 0 3px rgba(22,101,52,.10)}
    .reliability-popover{position:fixed;z-index:9999;max-width:300px;padding:11px 13px;border-radius:12px;background:#173f28;color:#fff;font-size:.82rem;line-height:1.45;box-shadow:0 12px 30px rgba(0,0,0,.18)}
    .feedback-card{padding:22px}.feedback-card h2{margin:0 0 6px}.feedback-card p{margin:0 0 16px}.feedback-card textarea{width:100%;resize:vertical;min-height:120px}.feedback-actions{display:flex;align-items:center;gap:12px;margin-top:10px;flex-wrap:wrap}.feedback-actions .btn{margin-left:auto}
    .delete-player-btn{margin-top:14px}
    .event-dialog-feedback{min-height:20px;margin:8px 0 0;font-size:.82rem}.event-dialog-feedback.error{color:#b42318}.event-dialog-feedback.success{color:#166534}
    dialog.modal .modal-box{position:relative}.modal-x-close{position:absolute;right:12px;top:12px;z-index:10;width:34px;height:34px;border:0;border-radius:50%;background:transparent;color:#526159;font-size:25px;line-height:30px;cursor:pointer;display:grid;place-items:center}.modal-x-close:hover,.modal-x-close:focus{background:#eef3ef;color:#17251d;outline:none}
    @media(max-width:720px){
      #app .tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:8px 10px;overflow:visible!important}
      #app .tabs .tab{min-width:0!important;width:100%;padding:10px 5px;font-size:.78rem;white-space:nowrap;text-align:center}
      #feedback{padding-bottom:22px}
      #feedback .section-head{margin-bottom:12px}
      #feedback .section-head h2{font-size:1.35rem}
      .feedback-card{padding:16px;border-radius:14px}
      .feedback-card h2{font-size:1.05rem;line-height:1.3}
      .feedback-card textarea{min-height:150px;font-size:16px}
      .feedback-actions{display:block}
      .feedback-actions .btn{width:100%;margin:12px 0 0}
      #userFeedbackStatus{display:block;min-height:18px}
    }
    @media(max-width:420px){
      #app .tabs{grid-template-columns:repeat(2,minmax(0,1fr))}
      #app .tabs .tab{font-size:.8rem}
    }
  `;
  document.head.appendChild(style);
}

function hideReliabilityPopover(){ $('reliabilityPopover')?.remove(); }
function showReliabilityPopover(anchor){
  hideReliabilityPopover();
  const pop=document.createElement('div'); pop.id='reliabilityPopover'; pop.className='reliability-popover';
  pop.textContent='Fiabilité : correspondance entre les réponses annoncées et la présence réelle.';
  document.body.appendChild(pop); const r=anchor.getBoundingClientRect(); const maxLeft=window.innerWidth-pop.offsetWidth-12;
  pop.style.left=`${Math.max(12,Math.min(r.left,maxLeft))}px`; const top=r.bottom+8;
  pop.style.top=`${top+pop.offsetHeight>window.innerHeight-10?Math.max(10,r.top-pop.offsetHeight-8):top}px`;
}
function reliabilityInfo(){
  document.querySelectorAll('#players .compact-labels span, #playerDetail .stat span').forEach(label=>{
    if(!/^Fiabilité/.test(label.textContent.trim())||label.querySelector('.reliability-help'))return;
    const info=document.createElement('button'); info.type='button'; info.className='reliability-help'; info.textContent='i'; info.setAttribute('aria-label','À quoi correspond la fiabilité ?');
    info.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();showReliabilityPopover(info);}); label.append(' ',info);
  });
}

function addModalCloseButtons(){
  document.querySelectorAll('dialog').forEach(dialog=>{
    const box=dialog.querySelector('.modal-box')||dialog.firstElementChild;
    if(!box||box.querySelector('.modal-x-close'))return;
    const btn=document.createElement('button'); btn.type='button'; btn.className='modal-x-close'; btn.setAttribute('aria-label','Fermer'); btn.title='Fermer'; btn.textContent='×';
    btn.addEventListener('click',()=>dialog.close()); box.prepend(btn);
  });
}

function addFeedbackTab(){
  const tabs=document.querySelector('.tabs'),main=document.querySelector('#app main'); if(!tabs||!main)return;
  let tab=$('feedbackTab'); if(!tab){tab=document.createElement('button');tab.id='feedbackTab';tab.className='tab';tab.dataset.view='feedback';tab.textContent='Retours & idées';tabs.querySelector('[data-view="import"]')?.after(tab);}
  let view=$('feedback'); if(!view){view=document.createElement('section');view.id='feedback';view.className='view';view.innerHTML=`<div class="section-head"><div><h2>Retours & idées</h2><div class="muted small">Un problème, une idée ou quelque chose à simplifier ? Dis-le ici.</div></div></div><div id="userFeedbackCard" class="card feedback-card"><h2>Aide-nous à améliorer FlemiCoach</h2><p class="muted small">Quelques mots suffisent. Chaque retour est lu et sert à prioriser les prochaines améliorations.</p><textarea id="userFeedbackMessage" maxlength="1500" rows="5" placeholder="Ex. Sur mobile, j’aimerais pouvoir…"></textarea><div class="feedback-actions"><span id="userFeedbackStatus" class="muted small"></span><button id="sendUserFeedback" type="button" class="btn primary">Envoyer mon retour</button></div></div>`;main.appendChild(view);$('sendUserFeedback').addEventListener('click',submitFeedback);}
  if(!tab.dataset.feedbackWired){tab.dataset.feedbackWired='1';tab.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t===tab));document.querySelectorAll('#app .view').forEach(v=>v.classList.toggle('active-view',v===view));});}
}
async function submitFeedback(){
  const message=$('userFeedbackMessage')?.value.trim()||'',status=$('userFeedbackStatus'),button=$('sendUserFeedback'); if(message.length<3){status.textContent='Écris quelques mots avant d’envoyer.';return;} button.disabled=true;status.textContent='Envoi…';
  try{const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Session expirée.');const{error}=await supabase.from('user_feedback').insert({user_id:user.id,team_id:teamId(),message});if(error)throw error;$('userFeedbackMessage').value='';status.textContent='Merci, retour envoyé.';window.flemiTrack?.('feedback_submitted',{teamId:teamId()});}
  catch(e){console.error(e);status.textContent='Impossible d’envoyer pour le moment.';}finally{button.disabled=false;}
}

function eventFeedback(){
  const form=$('eventForm'); if(!form) return null;
  let line=$('eventDialogFeedback');
  if(!line){line=document.createElement('div');line.id='eventDialogFeedback';line.className='event-dialog-feedback';form.querySelector('.row.end')?.before(line);}
  return line;
}
function syncEventTitleRequirement(){
  const type=$('eventType'),title=$('eventTitle'); if(!type||!title)return;
  const training=type.value==='training';
  title.required=!training;
  title.placeholder=training?'Entraînement':'Ex. Wasquehal';
  const label=title.closest('.field')?.querySelector('span');
  if(label)label.textContent=training?'Titre (facultatif)':'Titre / adversaire';
}
async function createEventFromDialog(){
  if(eventSaving)return;
  const type=$('eventType')?.value||'match';
  const date=$('eventDate')?.value||'';
  const time=$('eventTime')?.value||'';
  const titleRaw=$('eventTitle')?.value.trim()||'';
  const location=$('eventLocation')?.value.trim()||'';
  const feedback=eventFeedback();
  if(!teamId()){if(feedback){feedback.textContent='Équipe introuvable.';feedback.className='event-dialog-feedback error';}return;}
  if(!date||!time){if(feedback){feedback.textContent='Indique une date et une heure.';feedback.className='event-dialog-feedback error';}return;}
  if(type!=='training'&&!titleRaw){if(feedback){feedback.textContent='Indique un titre ou un adversaire.';feedback.className='event-dialog-feedback error';}return;}
  eventSaving=true;
  const button=$('confirmAddEvent'); if(button){button.disabled=true;button.textContent='Ajout…';}
  if(feedback){feedback.textContent='Création de l’événement…';feedback.className='event-dialog-feedback';}
  try{
    const {data:{user}}=await supabase.auth.getUser(); if(!user)throw new Error('Session expirée. Reconnecte-toi.');
    const payload={team_id:teamId(),type,title:type==='training'?'Entraînement':titleRaw,event_date:date,start_time:time,location,generated:false,created_by:user.id};
    const {error}=await supabase.from('events').insert(payload); if(error)throw error;
    if(feedback){feedback.textContent='Événement ajouté.';feedback.className='event-dialog-feedback success';}
    $('eventDialog')?.close();
    setTimeout(()=>location.reload(),80);
  }catch(err){
    console.error('FlemiCoach event creation',err);
    if(feedback){feedback.textContent=`Impossible de créer l’événement : ${err.message||'erreur inconnue'}`;feedback.className='event-dialog-feedback error';}
  }finally{
    eventSaving=false;
    if(button){button.disabled=false;button.textContent='Ajouter';}
  }
}
function wireEventCreationFix(){
  const form=$('eventForm'),button=$('confirmAddEvent'),type=$('eventType'); if(!form||!button||button.dataset.eventFixWired)return;
  button.dataset.eventFixWired='1';
  syncEventTitleRequirement();
  type?.addEventListener('change',syncEventTitleRequirement);
  button.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();createEventFromDialog();},true);
  form.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();createEventFromDialog();},true);
  $('addEventBtn')?.addEventListener('click',()=>setTimeout(()=>{syncEventTitleRequirement();const f=eventFeedback();if(f){f.textContent='';f.className='event-dialog-feedback';}},0));
}

async function annotatePlayerRows(){
  const list=$('playersList');if(!list||!teamId())return;const{data,error}=await supabase.from('players').select('id,name').eq('team_id',teamId()).eq('active',true).order('name');if(error||!data)return;
  [...list.querySelectorAll('.list-button')].forEach((row,index)=>{const player=data[index];if(!player)return;row.dataset.playerId=player.id;if(row.dataset.deleteWire)return;row.dataset.deleteWire='1';row.addEventListener('click',()=>{selectedPlayerId=player.id;setTimeout(addDeletePlayerButton,0);});});
}
function addDeletePlayerButton(){
  const detail=$('playerDetail');if(!detail||detail.classList.contains('hidden'))return;let btn=$('deleteCurrentPlayer');if(!btn){btn=document.createElement('button');btn.id='deleteCurrentPlayer';btn.type='button';btn.className='btn danger full delete-player-btn';btn.textContent='Supprimer ce joueur';detail.appendChild(btn);btn.addEventListener('click',deleteSelectedPlayer);}btn.style.display=selectedPlayerId?'':'none';
}
async function deleteSelectedPlayer(){
  if(!selectedPlayerId)return;const name=$('detailName')?.textContent?.trim()||'ce joueur';if(!confirm(`Supprimer « ${name} » de l’équipe ?\n\nSes réponses et présences associées seront également supprimées.`))return;
  const btn=$('deleteCurrentPlayer');btn.disabled=true;btn.textContent='Suppression…';const{error}=await supabase.from('players').delete().eq('id',selectedPlayerId).eq('team_id',teamId());if(error){btn.disabled=false;btn.textContent='Supprimer ce joueur';return alert(`Suppression impossible : ${error.message}`);}selectedPlayerId=null;$('playerDetail')?.classList.add('hidden');location.reload();
}
function boot(){
  addStyles();addFeedbackTab();reliabilityInfo();annotatePlayerRows();addModalCloseButtons();wireEventCreationFix();
  document.addEventListener('click',e=>{if(!e.target.closest('.reliability-help')&&!e.target.closest('#reliabilityPopover'))hideReliabilityPopover();});window.addEventListener('resize',hideReliabilityPopover);
  const observer=new MutationObserver(()=>{reliabilityInfo();annotatePlayerRows();addDeletePlayerButton();addModalCloseButtons();addFeedbackTab();wireEventCreationFix();});observer.observe(document.body,{childList:true,subtree:true});
  $('teamSelect')?.addEventListener('change',()=>setTimeout(annotatePlayerRows,300));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
