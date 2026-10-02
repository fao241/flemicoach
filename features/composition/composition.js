import { listMatches,loadCallups,loadComposition,saveComposition,publishComposition } from './composition-api.js';
import { createEditor } from './composition-editor.js';
import { openPublicComposition } from './composition-public.js';

const $=id=>document.getElementById(id);
const token=new URLSearchParams(location.search).get('composition');
if(token) openPublicComposition(token);

function setupNavigation(){
  const tabs=document.querySelector('.tabs'),main=document.querySelector('#app main');
  if(!tabs||!main||$('compositionView'))return;
  const button=document.createElement('button');
  button.className='tab';button.dataset.view='composition';button.textContent='Compositions';
  tabs.appendChild(button);
  const section=document.createElement('section');
  section.id='compositionView';section.className='view';main.appendChild(section);
  button.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===button));
    document.querySelectorAll('#app .view').forEach(x=>x.classList.remove('active-view'));
    section.classList.add('active-view');loadMatchList();
  });
}
setupNavigation();

async function loadMatchList(){
  const root=$('compositionView'),teamId=$('teamSelect')?.value;if(!root||!teamId)return;
  root.innerHTML='<div class="section-head"><div><h2>Compositions</h2><div class="muted small">Crée une composition à partir des joueurs convoqués.</div></div></div><div id="compositionMatches" class="list card">Chargement…</div>';
  try{
    const matches=await listMatches(teamId),box=$('compositionMatches');
    box.innerHTML=matches.map(m=>`<button class="list-button" data-comp-match="${m.id}"><span><strong>${esc(m.title)}</strong><small>${m.event_date} · ${m.start_time||''}</small></span><span>Composer →</span></button>`).join('')||'<div class="muted">Aucun match.</div>';
    box.querySelectorAll('[data-comp-match]').forEach(b=>b.onclick=()=>openEditor(matches.find(m=>m.id===b.dataset.compMatch)));
  }catch(e){$('compositionMatches').textContent='Impossible de charger les matchs.';}
}
async function openEditor(match){
  const root=$('compositionView');root.innerHTML='<div class="card">Chargement des convoqués…</div>';
  try{
    const [callups,existing]=await Promise.all([loadCallups(match.id),loadComposition(match.id)]);
    if(!callups.length){root.innerHTML='<div class="card"><h2>Aucun joueur convoqué</h2><p class="muted">Fais d’abord la convocation de ce match.</p><button class="btn ghost" id="compBack">Retour</button></div>';$('compBack').onclick=loadMatchList;return;}
    createEditor(root,{match,callups,existing,onSave:saveComposition,onPublish:async state=>{
      const publicToken=await publishComposition(state),url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('composition',publicToken);
      const shareUrl=url.toString(),text=`Composition · ${match.title}\n${shareUrl}`;
      if(navigator.share)await navigator.share({title:'Composition FlemiCoach',text,url:shareUrl});else{await navigator.clipboard.writeText(text);alert('Lien de composition copié.');}
    },onClose:loadMatchList});
  }catch(e){root.innerHTML='<div class="card"><h2>Composition indisponible</h2><p class="muted">'+esc(e.message)+'</p></div>';}
}
document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="composition"]'))setTimeout(loadMatchList,0);});
$('teamSelect')?.addEventListener('change',()=>{if($('compositionView')?.classList.contains('active-view'))loadMatchList();});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
