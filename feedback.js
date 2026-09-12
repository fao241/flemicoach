import { supabase } from './supabase.js';

const $ = id => document.getElementById(id);
const teamId = () => $('teamSelect')?.value || null;
let selectedPlayerId = null;

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
    @media(max-width:520px){.feedback-actions .btn{width:100%;margin-left:0}}
  `;
  document.head.appendChild(style);
}

function hideReliabilityPopover(){ $('reliabilityPopover')?.remove(); }
function showReliabilityPopover(anchor){
  hideReliabilityPopover();
  const pop=document.createElement('div');
  pop.id='reliabilityPopover';
  pop.className='reliability-popover';
  pop.textContent='Fiabilité : correspondance entre les réponses annoncées et la présence réelle.';
  document.body.appendChild(pop);
  const r=anchor.getBoundingClientRect();
  const maxLeft=window.innerWidth-pop.offsetWidth-12;
  pop.style.left=`${Math.max(12,Math.min(r.left,maxLeft))}px`;
  const top=r.bottom+8;
  pop.style.top=`${top+pop.offsetHeight>window.innerHeight-10?Math.max(10,r.top-pop.offsetHeight-8):top}px`;
}

function reliabilityInfo(){
  document.querySelectorAll('#players .compact-labels span, #playerDetail .stat span').forEach(label => {
    if (!/^Fiabilité/.test(label.textContent.trim()) || label.querySelector('.reliability-help')) return;
    const info = document.createElement('button');
    info.type='button';
    info.className = 'reliability-help';
    info.textContent = 'i';
    info.setAttribute('aria-label','À quoi correspond la fiabilité ?');
    info.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();showReliabilityPopover(info);});
    label.append(' ', info);
  });
}

function addFeedbackTab(){
  const tabs=document.querySelector('.tabs');
  const main=document.querySelector('#app main');
  if(!tabs||!main)return;
  let tab=$('feedbackTab');
  if(!tab){
    tab=document.createElement('button');
    tab.id='feedbackTab';
    tab.className='tab';
    tab.dataset.view='feedback';
    tab.textContent='Retour';
    const importTab=tabs.querySelector('[data-view="import"]');
    importTab?.after(tab);
  }
  let view=$('feedback');
  if(!view){
    view=document.createElement('section');
    view.id='feedback';
    view.className='view';
    view.innerHTML=`<div class="section-head"><div><h2>Retours & idées</h2><div class="muted small">Dis-nous ce qui manque, ce qui est à simplifier ou ce que tu aimerais avoir dans FlemiCoach.</div></div></div><div id="userFeedbackCard" class="card feedback-card"><h2>Une idée pour améliorer FlemiCoach ?</h2><p class="muted small">Tes retours servent à prioriser les prochaines améliorations.</p><textarea id="userFeedbackMessage" maxlength="1500" rows="5" placeholder="Ex. J’aimerais pouvoir…"></textarea><div class="feedback-actions"><span id="userFeedbackStatus" class="muted small"></span><button id="sendUserFeedback" type="button" class="btn primary">Envoyer mon retour</button></div></div>`;
    main.appendChild(view);
    $('sendUserFeedback').addEventListener('click',submitFeedback);
  }
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t===tab));
    document.querySelectorAll('#app .view').forEach(v=>v.classList.toggle('active-view',v===view));
  });
}

async function submitFeedback(){
  const message = $('userFeedbackMessage')?.value.trim() || '';
  const status = $('userFeedbackStatus');
  const button = $('sendUserFeedback');
  if (message.length < 3) { status.textContent = 'Écris quelques mots avant d’envoyer.'; return; }
  button.disabled = true; status.textContent = 'Envoi…';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Session expirée.');
    const { error } = await supabase.from('user_feedback').insert({user_id:user.id,team_id:teamId(),message});
    if (error) throw error;
    $('userFeedbackMessage').value = '';
    status.textContent = 'Merci, retour envoyé.';
    window.flemiTrack?.('feedback_submitted', { teamId: teamId() });
  } catch (e) { console.error(e); status.textContent = 'Impossible d’envoyer pour le moment.'; }
  finally { button.disabled = false; }
}

async function annotatePlayerRows(){
  const list=$('playersList');
  if(!list||!teamId())return;
  const {data,error}=await supabase.from('players').select('id,name').eq('team_id',teamId()).eq('active',true).order('name');
  if(error||!data)return;
  const rows=[...list.querySelectorAll('.list-button')];
  rows.forEach((row,index)=>{
    const player=data[index];
    if(!player)return;
    row.dataset.playerId=player.id;
    row.addEventListener('click',()=>{selectedPlayerId=player.id;setTimeout(addDeletePlayerButton,0);},{once:false});
  });
}

function addDeletePlayerButton(){
  const detail=$('playerDetail');
  if(!detail||detail.classList.contains('hidden'))return;
  let btn=$('deleteCurrentPlayer');
  if(!btn){
    btn=document.createElement('button');
    btn.id='deleteCurrentPlayer';
    btn.type='button';
    btn.className='btn danger full delete-player-btn';
    btn.textContent='Supprimer ce joueur';
    detail.appendChild(btn);
    btn.addEventListener('click',deleteSelectedPlayer);
  }
  btn.style.display=selectedPlayerId?'':'none';
}

async function deleteSelectedPlayer(){
  if(!selectedPlayerId)return;
  const name=$('detailName')?.textContent?.trim()||'ce joueur';
  if(!confirm(`Supprimer « ${name} » de l’équipe ?\n\nSes réponses et présences associées seront également supprimées.`))return;
  const btn=$('deleteCurrentPlayer'); btn.disabled=true; btn.textContent='Suppression…';
  const {error}=await supabase.from('players').delete().eq('id',selectedPlayerId).eq('team_id',teamId());
  if(error){btn.disabled=false;btn.textContent='Supprimer ce joueur';return alert(`Suppression impossible : ${error.message}`);}
  selectedPlayerId=null;
  $('playerDetail')?.classList.add('hidden');
  location.reload();
}

function boot(){
  addStyles();
  addFeedbackTab();
  reliabilityInfo();
  annotatePlayerRows();
  document.addEventListener('click',e=>{if(!e.target.closest('.reliability-help')&&!e.target.closest('#reliabilityPopover'))hideReliabilityPopover();});
  window.addEventListener('resize',hideReliabilityPopover);
  const players=$('players');
  if(players){
    const observer=new MutationObserver(()=>{reliabilityInfo();annotatePlayerRows();addDeletePlayerButton();});
    observer.observe(players,{childList:true,subtree:true});
  }
  $('teamSelect')?.addEventListener('change',()=>setTimeout(annotatePlayerRows,300));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
