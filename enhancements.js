import { supabase } from './supabase.js';

const $ = id => document.getElementById(id);
const esc = (v='') => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const teamId = () => $('teamSelect')?.value || null;
const teamName = () => $('teamSelect')?.selectedOptions?.[0]?.textContent || 'Équipe';
const time5 = v => String(v || '').slice(0,5);
const fmtDate = iso => {
  if (!iso) return '';
  const [y,m,d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'2-digit',month:'long'}).format(new Date(y,m-1,d,12));
};
const parentLink = e => `${new URL('.',location.href).href}?event=${encodeURIComponent(e.public_token)}`;

let pdfPlayers = null;
let selectedMatch = null;
let patchingLicenses = false;

async function getPlayers(){
  if(!teamId()) return [];
  const {data,error}=await supabase.from('players').select('*').eq('team_id',teamId()).eq('active',true).order('name');
  if(error) throw error;
  return data || [];
}
async function getCallups(eventId){
  const {data,error}=await supabase.from('match_callups').select('player_id').eq('event_id',eventId);
  if(error) throw error;
  return new Set((data||[]).map(x=>x.player_id));
}
async function getMatches(){
  if(!teamId()) return [];
  const {data,error}=await supabase.from('events').select('*').eq('team_id',teamId()).eq('type','match').order('event_date').order('start_time');
  if(error) throw error;
  return data || [];
}
async function nextEvent(){
  const today=new Date().toISOString().slice(0,10);
  const {data}=await supabase.from('events').select('*').eq('team_id',teamId()).gte('event_date',today).order('event_date').order('start_time').limit(1);
  return data?.[0] || null;
}

async function nativeShare(message,title='FlemiCoach'){
  try{
    if(navigator.share){
      await navigator.share({title,text:message});
      return true;
    }
  }catch(err){
    if(err?.name==='AbortError') return false;
    console.warn('Partage natif indisponible',err);
  }
  try{
    await navigator.clipboard.writeText(message);
    alert('Le partage direct n’est pas disponible sur ce navigateur. Le message a été copié : ouvre WhatsApp et colle-le dans ton groupe.');
  }catch{
    prompt('Copie ce message puis colle-le dans ton groupe WhatsApp :',message);
  }
  return false;
}

async function buildMessage(e){
  if(e.type==='match'){
    const ids=await getCallups(e.id);
    if(!ids.size) return null;
    const ps=await getPlayers();
    const names=ps.filter(p=>ids.has(p.id)).map(p=>`• ${p.name}`).join('\n');
    return `⚽ ${teamName()} — Convocation\n${e.title}\n${fmtDate(e.event_date)} à ${time5(e.start_time)}${e.location?' · '+e.location:''}\n\nListe des convoqués :\n${names}\n\nMerci de confirmer la présence ou l’absence de votre enfant ici :\n${parentLink(e)}`;
  }
  const label=e.type==='training'?'Entraînement':(e.title||'Événement');
  return `⚽ ${teamName()} — ${label}\n${fmtDate(e.event_date)} à ${time5(e.start_time)}${e.location?' · '+e.location:''}\n\nMerci d’indiquer la présence de votre enfant :\n${parentLink(e)}`;
}

async function shareEvent(e){
  if(!e) return;
  if(e.type==='match'){
    const ids=await getCallups(e.id);
    if(!ids.size){
      alert('Sélectionne d’abord les joueurs convoqués.');
      await openCallups(e.id);
      return;
    }
  }
  const msg=await buildMessage(e);
  if(msg) await nativeShare(msg,e.type==='match'?'Convocation FlemiCoach':'FlemiCoach');
}

async function copyEventMessage(e){
  if(!e) return;
  if(e.type==='match'){
    const ids=await getCallups(e.id);
    if(!ids.size){alert('Sélectionne d’abord les joueurs convoqués.');await openCallups(e.id);return;}
  }
  const msg=await buildMessage(e);
  try{await navigator.clipboard.writeText(msg);alert('Message + lien copiés.');}
  catch{prompt('Copie ce message :',msg);}
}

function ensureCallupDialog(){
  if($('callupDialog')) return;
  document.body.insertAdjacentHTML('beforeend',`<dialog id="callupDialog" class="modal"><div class="modal-box"><div class="row between gap"><div><h3 id="callupTitle">Convoqués</h3><div id="callupMeta" class="muted small"></div></div><button id="closeCallup" type="button" class="btn ghost small-btn">Fermer</button></div><div class="row gap wrap top-gap-sm"><button id="allCallups" type="button" class="btn ghost small-btn">Tout sélectionner</button><button id="noCallups" type="button" class="btn ghost small-btn">Tout désélectionner</button></div><div id="callupPlayers" class="stack top-gap-sm"></div><button id="saveCallups" type="button" class="btn primary full top-gap-sm">Enregistrer les convoqués</button><div id="callupFeedback" class="status-line small"></div></div></dialog>`);
  $('closeCallup').onclick=()=>$('callupDialog').close();
  $('allCallups').onclick=()=>$('callupPlayers').querySelectorAll('input').forEach(x=>x.checked=true);
  $('noCallups').onclick=()=>$('callupPlayers').querySelectorAll('input').forEach(x=>x.checked=false);
  $('saveCallups').onclick=saveCallups;
}
async function openCallups(id){
  ensureCallupDialog();
  const {data:e,error}=await supabase.from('events').select('*').eq('id',id).single();
  if(error||!e) return;
  selectedMatch=e;
  const ps=await getPlayers(), sel=await getCallups(id);
  $('callupTitle').textContent=`Convoqués · ${e.title}`;
  $('callupMeta').textContent=`${fmtDate(e.event_date)} · ${time5(e.start_time)}${e.location?' · '+e.location:''}`;
  $('callupPlayers').innerHTML=ps.map(p=>`<label class="check"><input type="checkbox" value="${p.id}" ${sel.has(p.id)?'checked':''}><span><strong>${esc(p.name)}</strong>${p.license_number?` <small class="muted">· ${esc(p.license_number)}</small>`:''}</span></label>`).join('');
  $('callupFeedback').textContent='';
  $('callupDialog').showModal();
}
async function saveCallups(){
  if(!selectedMatch) return;
  const ids=[...$('callupPlayers').querySelectorAll('input:checked')].map(x=>x.value);
  const f=$('callupFeedback');
  const {error:delError}=await supabase.from('match_callups').delete().eq('event_id',selectedMatch.id);
  if(delError){f.textContent=delError.message;return;}
  if(ids.length){
    const {error}=await supabase.from('match_callups').insert(ids.map(player_id=>({event_id:selectedMatch.id,player_id})));
    if(error){f.textContent=error.message;return;}
  }
  f.textContent=`${ids.length} joueur(s) convoqué(s). Tu peux maintenant partager la convocation.`;
  await renderMatchActions();
}

async function renderMatchActions(){
  const box=$('matchActions');
  if(!box||!teamId()) return;
  const ms=await getMatches(), today=new Date().toISOString().slice(0,10), future=ms.filter(e=>e.event_date>=today);
  if(!future.length){box.innerHTML='';return;}
  const rows=[];
  for(const e of future){
    const ids=await getCallups(e.id);
    rows.push(`<div class="card match-action-card"><div class="row between gap wrap"><div><div class="eyebrow">Match · ${ids.size} convoqué(s)</div><strong>${esc(e.title)}</strong><div class="muted small">${esc(fmtDate(e.event_date))} · ${esc(time5(e.start_time))}${e.location?' · '+esc(e.location):''}</div></div><div class="row gap wrap"><button type="button" class="btn ghost small-btn" data-callup="${e.id}">Choisir les convoqués</button><button type="button" class="btn small-btn" data-copy-match="${e.id}">Copier</button><button type="button" class="btn primary small-btn" data-share-match="${e.id}">Partager</button></div></div></div>`);
  }
  box.innerHTML=`<div class="section-head"><div><h3>Convocations</h3><div class="muted small">Choisis les joueurs puis partage dans ton groupe WhatsApp.</div></div></div>${rows.join('')}`;
  box.querySelectorAll('[data-callup]').forEach(b=>b.onclick=()=>openCallups(b.dataset.callup));
  box.querySelectorAll('[data-share-match]').forEach(b=>b.onclick=()=>{const e=future.find(x=>x.id===b.dataset.shareMatch);if(e)shareEvent(e);});
  box.querySelectorAll('[data-copy-match]').forEach(b=>b.onclick=()=>{const e=future.find(x=>x.id===b.dataset.copyMatch);if(e)copyEventMessage(e);});
}

function wireShareInterception(){
  const share=$('shareWhatsApp');
  if(!share||share.dataset.nativeShare) return;
  share.dataset.nativeShare='1';
  share.textContent='Partager';
  share.addEventListener('click',async ev=>{
    ev.preventDefault();ev.stopImmediatePropagation();
    const e=await nextEvent();
    if(!e) return alert('Aucun événement à partager.');
    await shareEvent(e);
  },true);
  const copy=$('copyParentLink');
  if(copy&&!copy.dataset.nativeShare){
    copy.dataset.nativeShare='1';
    copy.addEventListener('click',async ev=>{
      const e=await nextEvent();
      if(e?.type==='match'){
        ev.preventDefault();ev.stopImmediatePropagation();
        await copyEventMessage(e);
      }
    },true);
  }
}

function wireCancel(){
  const p=$('cancelAddPlayer'), e=$('cancelAddEvent');
  if(p&&!p.dataset.wired){p.dataset.wired='1';p.onclick=()=>{$('playerForm')?.reset();$('playerDialog')?.close();};}
  if(e&&!e.dataset.wired){e.dataset.wired='1';e.onclick=()=>{$('eventForm')?.reset();$('eventDialog')?.close();};}
}
function wireDelete(){
  const b=$('deleteTeamBtn');
  if(!b||b.dataset.wired) return;
  b.dataset.wired='1';
  b.onclick=async()=>{
    const id=teamId();if(!id)return alert('Aucune équipe sélectionnée.');
    if(prompt(`Tape SUPPRIMER pour supprimer définitivement « ${teamName()} » et toutes ses données.`)!=='SUPPRIMER')return;
    if(!confirm('Dernière confirmation : cette action est définitive. Supprimer toute l’équipe ?'))return;
    b.disabled=true;b.textContent='Suppression…';
    const{error}=await supabase.from('teams').delete().eq('id',id);
    if(error){b.disabled=false;b.textContent='Supprimer toute l’équipe';alert(`Suppression impossible : ${error.message}`);return;}
    sessionStorage.removeItem('flemicoach-team');location.reload();
  };
}

async function patchLicenses(){
  if(patchingLicenses||!$('playersList')||!teamId())return;
  patchingLicenses=true;
  try{
    const ps=await getPlayers();
    for(const row of $('playersList').querySelectorAll('.list-row')){
      const s=row.querySelector('strong');if(!s)continue;
      const p=ps.find(x=>x.name===s.textContent.trim());if(!p)continue;
      let m=row.querySelector('.license-meta');
      if(!m){m=document.createElement('div');m.className='muted small license-meta';s.parentElement.appendChild(m);}
      m.textContent=p.license_number?`Licence : ${p.license_number}${p.birth_date?' · '+p.birth_date.split('-').reverse().join('/'):''}`:'';
    }
  }finally{patchingLicenses=false;}
}

function extractFFF(lines){
  const a=lines.map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),out=[];
  for(let i=0;i<a.length;i++){
    const lm=a[i].match(/\b(\d{10})\b/);if(!lm)continue;
    const lic=lm[1],dm=a[i].match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    let prefix=a[i].slice(0,a[i].indexOf(lic)).trim(),name=prefix;
    if(!name&&i>0)name=a[i-1];
    if(prefix&&prefix.split(/\s+/).length<=2&&i>0&&!/édition|généré|nombre|club|statut|wattrelosienne|page|u13/i.test(a[i-1])&&!/\d{10}/.test(a[i-1])){
      const prev=a[i-1];if(prev!==prefix&&!prev.includes(prefix))name=`${prev} ${prefix}`;
    }
    name=name.replace(/\b\d{2}\/\d{2}\/\d{4}\b.*$/,'').replace(/\s+/g,' ').trim();
    if(!name||/wattrelosienne|édition|généré|nombre de|nom numéro|club/i.test(name))continue;
    const birth=dm?`${dm[3]}-${dm[2]}-${dm[1]}`:null;
    if(!out.some(p=>p.license_number===lic))out.push({name,license_number:lic,birth_date:birth});
  }
  return out;
}
async function parsePDF(f){
  const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';
  const doc=await pdfjs.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise,lines=[];
  for(let i=1;i<=doc.numPages;i++){
    const p=await doc.getPage(i),tc=await p.getTextContent(),items=[...tc.items].sort((a,b)=>Math.abs((b.transform?.[5]||0)-(a.transform?.[5]||0))>3?(b.transform?.[5]||0)-(a.transform?.[5]||0):(a.transform?.[4]||0)-(b.transform?.[4]||0));
    let y=null,row=[];
    for(const it of items){const iy=Math.round(it.transform?.[5]||0);if(y!==null&&Math.abs(iy-y)>3){if(row.length)lines.push(row.join(' ').replace(/\s+/g,' ').trim());row=[];}row.push(it.str);y=iy;}
    if(row.length)lines.push(row.join(' ').replace(/\s+/g,' ').trim());
  }
  return extractFFF(lines);
}

$('fileInput')?.addEventListener('change',async ev=>{
  const f=ev.target.files?.[0];
  if(!f||$('importType')?.value!=='players'||!f.name.toLowerCase().endsWith('.pdf'))return;
  ev.stopImmediatePropagation();
  const st=$('importStatus');st.textContent='Analyse intelligente du PDF…';
  try{
    pdfPlayers=await parsePDF(f);if(!pdfPlayers.length)throw Error();
    const ex=await getPlayers(),lics=new Set(ex.map(p=>p.license_number).filter(Boolean));
    $('previewMeta').textContent=`${f.name} · Liste licenciés`;
    $('previewCount').textContent=`${pdfPlayers.length} joueur(s)`;
    $('previewRows').innerHTML=pdfPlayers.map(p=>`<div class="preview-row"><strong>${esc(p.name)}</strong> · Licence ${esc(p.license_number)}${p.birth_date?' · '+p.birth_date.split('-').reverse().join('/'):''}${lics.has(p.license_number)?' · déjà importé':''}</div>`).join('');
    $('importPreview').classList.remove('hidden');st.textContent=`${pdfPlayers.length} joueurs détectés. Vérifie avant validation.`;st.classList.add('success');
  }catch(e){console.error(e);st.textContent='Impossible de reconnaître cette liste de licenciés.';st.classList.add('error');}
},true);
$('confirmImport')?.addEventListener('click',async ev=>{
  if(!pdfPlayers)return;
  ev.stopImmediatePropagation();
  const st=$('importStatus');st.textContent='Import en cours…';
  const ex=await getPlayers(),byLic=new Map(ex.filter(p=>p.license_number).map(p=>[p.license_number,p]));let add=0,upd=0;
  for(const p of pdfPlayers){const old=byLic.get(p.license_number);if(old){const{error}=await supabase.from('players').update({name:p.name,birth_date:p.birth_date}).eq('id',old.id);if(error)return alert(error.message);upd++;}else{const{error}=await supabase.from('players').insert({team_id:teamId(),...p});if(error)return alert(error.message);add++;}}
  pdfPlayers=null;$('importPreview').classList.add('hidden');st.textContent=`Import terminé : ${add} ajouté(s), ${upd} mis à jour.`;setTimeout(()=>location.reload(),500);
},true);

async function publicList(){
  const token=new URLSearchParams(location.search).get('event');
  if(!token||!$('publicContent')||$('publicCallups'))return;
  const{data}=await supabase.rpc('get_public_event',{p_token:token});
  if(data?.event?.type!=='match')return;
  $('publicTitle').textContent=`Convocation · ${data.event.title}`;
  $('publicForm').insertAdjacentHTML('beforebegin',`<div id="publicCallups" class="top-gap"><h3>Liste des convoqués</h3><ul>${(data.players||[]).map(p=>`<li>${esc(p.name)}</li>`).join('')}</ul><p class="muted small">Sélectionnez votre enfant puis confirmez sa présence ou son absence.</p></div>`);
}

async function refresh(){
  wireCancel();wireDelete();wireShareInterception();patchLicenses();publicList();
  if($('calendar')?.classList.contains('active-view'))await renderMatchActions();
}

$('teamSelect')?.addEventListener('change',()=>setTimeout(()=>{renderMatchActions();patchLicenses();},150));
document.querySelector('[data-view="calendar"]')?.addEventListener('click',()=>setTimeout(renderMatchActions,150));
const obs=new MutationObserver(()=>{wireCancel();wireDelete();wireShareInterception();publicList();});
obs.observe(document.body,{subtree:true,childList:true});
setTimeout(refresh,300);setTimeout(refresh,1200);
