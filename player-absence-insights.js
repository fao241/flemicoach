import { supabase } from './supabase.js';
const $=id=>document.getElementById(id);
const teamId=()=>$('teamSelect')?.value||null;
const labels={MALADIE:'🤒 Maladie',BLESSURE:'🩹 Blessure',ECOLE:'📚 École / études',TRAVAIL:'💼 Travail',FAMILIAL:'👨‍👩‍👦 Familial',AUTRE:'📝 Autre',NON_PRECISE:'❓ Non précisé'};
const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=iso=>{if(!iso)return'';const[y,m,d]=iso.split('-').map(Number);return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(y,m-1,d,12));};

function addReasonToPublicForm(){
 const form=$('publicForm');if(!form||$('publicAbsenceReason'))return;
 const note=$('publicNote')?.closest('label')||$('publicNote');if(!note)return;
 const field=document.createElement('label');field.id='publicAbsenceReasonField';field.className='field hidden';field.innerHTML=`<span>Motif de l'absence <span class="muted small">(facultatif)</span></span><select id="publicAbsenceReason"><option value="NON_PRECISE">Non précisé</option><option value="MALADIE">Maladie</option><option value="BLESSURE">Blessure</option><option value="ECOLE">École / études</option><option value="TRAVAIL">Travail</option><option value="FAMILIAL">Familial</option><option value="AUTRE">Autre</option></select>`;note.before(field);
 const sync=()=>{const status=new FormData(form).get('publicStatus');field.classList.toggle('hidden',status!=='ABSENT');};
 form.querySelectorAll('[name="publicStatus"]').forEach(x=>x.addEventListener('change',sync));sync();
 // Run before app.js submit listener and supply the new RPC signature ourselves.
 form.addEventListener('submit',async ev=>{
   const status=new FormData(form).get('publicStatus');if(status!=='ABSENT')return;
   const token=new URLSearchParams(location.search).get('event'),playerId=$('publicPlayer')?.value;if(!token||!playerId)return;
   ev.preventDefault();ev.stopImmediatePropagation();
   const fb=$('publicFeedback');if(fb){fb.textContent='Enregistrement…';fb.className='status-line';}
   const {error}=await supabase.rpc('submit_public_attendance',{p_token:token,p_player_id:playerId,p_status:'ABSENT',p_note:$('publicNote')?.value?.trim()||null,p_absence_reason:$('publicAbsenceReason')?.value||'NON_PRECISE'});
   if(fb){fb.textContent=error?'Impossible d’enregistrer la réponse. Réessaie.':'Réponse enregistrée. Merci.';fb.className=`status-line ${error?'error':'success'}`;}
 },true);
}

async function renderPlayerInsights(){
 if(!$('players')?.classList.contains('active-view')||$('playerDetail')?.classList.contains('hidden')||!teamId())return;
 const name=$('detailName')?.textContent?.trim();if(!name)return;
 const {data:ps}=await supabase.from('players').select('id,name').eq('team_id',teamId()).eq('active',true);const p=(ps||[]).find(x=>x.name===name);if(!p)return;
 const {data:ev}=await supabase.from('events').select('id,title,type,event_date,cancelled,completed,attendance_validated_at').eq('team_id',teamId()).eq('cancelled',false).order('event_date',{ascending:false});
 const ids=(ev||[]).map(x=>x.id);if(!ids.length)return;
 const {data:att}=await supabase.from('attendance').select('event_id,declared_status,actual_status,absence_reason,note').eq('player_id',p.id).in('event_id',ids);
 const map=new Map((att||[]).map(x=>[x.event_id,x]));
 const done=(ev||[]).filter(e=>e.completed||e.attendance_validated_at);const actual=done.map(e=>({e,a:map.get(e.id)})).filter(x=>x.a?.actual_status);const absent=actual.filter(x=>x.a.actual_status==='ABSENT'),present=actual.length-absent.length;const absenceRate=actual.length?Math.round(absent.length/actual.length*100):0;
 const reasons={};absent.forEach(x=>{const k=x.a.absence_reason||'NON_PRECISE';reasons[k]=(reasons[k]||0)+1;});
 let box=$('absenceInsights');if(!box){box=document.createElement('section');box.id='absenceInsights';box.className='card top-gap';$('playerHistory')?.before(box)||$('playerDetail')?.appendChild(box);}
 box.innerHTML=`<div class="row between gap wrap"><div><div class="eyebrow">Assiduité</div><h3 style="margin:.2rem 0">${absenceRate} % d'absence</h3></div><div class="chips"><span class="chip ok">${present} présence(s)</span><span class="chip no">${absent.length} absence(s)</span></div></div><div style="margin-top:16px"><strong>Motifs des absences</strong><div class="chips" style="margin-top:9px">${absent.length?Object.entries(reasons).map(([k,n])=>`<span class="chip">${labels[k]||labels.NON_PRECISE} · ${n}</span>`).join(''):'<span class="muted small">Aucune absence enregistrée.</span>'}</div></div><div style="margin-top:18px"><strong>Historique des absences</strong>${absent.length?absent.map(x=>`<div class="history-row"><div class="row between gap wrap"><div><strong>${esc(x.e.type==='training'?'Entraînement':x.e.title||'Événement')}</strong><div class="muted small">${fmt(x.e.event_date)}${x.a.note?' · '+esc(x.a.note):''}</div></div><span class="chip no">${labels[x.a.absence_reason||'NON_PRECISE']||labels.NON_PRECISE}</span></div></div>`).join(''):'<div class="muted small top-gap-sm">Aucune absence.</div>'}</div>`;
}

addReasonToPublicForm();
document.querySelector('[data-view="players"]')?.addEventListener('click',()=>setTimeout(renderPlayerInsights,600));
document.addEventListener('click',e=>{if(e.target.closest?.('.list-button'))setTimeout(renderPlayerInsights,500)});
const obs=new MutationObserver(()=>setTimeout(renderPlayerInsights,250));setTimeout(()=>{if($('playerDetail'))obs.observe($('playerDetail'),{childList:true,subtree:true,attributes:true});},1200);
