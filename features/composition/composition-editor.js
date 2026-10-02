import { FORMATS, formationPositions } from './formations.js';
import { renderPitch } from './composition-pitch.js';

export function createEditor(root,{match,callups,existing,onSave,onPublish,onClose}) {
  let state=hydrate(match,callups,existing),selected=null;
  const render=()=>{
    const formations=Object.keys(FORMATS[state.format].formations);
    root.innerHTML=`
      <div class="fc-comp-head"><div><div class="muted small">Composition de match</div><h2>${esc(match.title)}</h2><div class="muted small">${esc(match.event_date)} · ${esc(match.start_time||'')}</div></div><button class="btn ghost" data-a="close">Fermer</button></div>
      <div class="fc-wizard">
        <label class="field"><span>Format</span><select data-a="format">${Object.entries(FORMATS).map(([k,v])=>`<option value="${k}" ${+k===state.format?'selected':''}>${v.label}</option>`).join('')}</select></label>
        <label class="field"><span>Organisation de départ</span><select data-a="formation"><option value="LIBRE">Placement libre</option>${formations.map(f=>`<option ${f===state.formation?'selected':''}>${f}</option>`).join('')}</select></label>
        <button class="btn ghost" data-a="apply">Appliquer le dispositif</button>
      </div>
      <div class="fc-editor-grid"><div><div class="fc-pitch" id="fcPitch"></div><div class="muted small fc-help">Glisse un joueur ou sélectionne-le puis touche le terrain.</div></div>
      <div class="fc-squads"><h3>Convoqués</h3><div data-list="available"></div><h3>Remplaçants</h3><div data-list="substitute"></div></div></div>
      <div class="fc-selected hidden" id="fcSelected"></div>
      <div class="row gap wrap top-gap"><button class="btn primary" data-a="save">Enregistrer le brouillon</button><button class="btn" data-a="publish">Publier / partager</button></div>
      <div class="status-line small" id="fcStatus"></div>`;
    bind(); paint();
  };
  const paint=()=>{
    const pitch=root.querySelector('#fcPitch');pitch.dataset.selected=selected||'';
    renderPitch(pitch,state.players,{onSelect:id=>{selected=id;paint();},onMove:(id,x,y)=>{const p=get(id);p.status='STARTER';p.x=x;p.y=y;selected=id;paint();}});
    for(const status of ['AVAILABLE','SUBSTITUTE']){
      const box=root.querySelector(`[data-list="${status.toLowerCase()}"]`);
      box.innerHTML=state.players.filter(p=>p.status===status).map(p=>`<button class="fc-chip" data-player="${p.playerId}">${esc(p.name)}</button>`).join('')||'<span class="muted small">Aucun</span>';
    }
    root.querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>{selected=b.dataset.player;showSelected();});
    showSelected();
  };
  const showSelected=()=>{
    const box=root.querySelector('#fcSelected'),p=get(selected);if(!p){box.classList.add('hidden');return;}
    box.classList.remove('hidden');box.innerHTML=`<strong>${esc(p.name)}</strong><div class="row gap wrap"><button class="btn ghost small-btn" data-s="field">Terrain</button><button class="btn ghost small-btn" data-s="sub">Remplaçant</button><button class="btn ghost small-btn" data-s="avail">Disponible</button><button class="btn ghost small-btn" data-s="captain">${p.captain?'Retirer C':'Capitaine'}</button><button class="btn ghost small-btn" data-s="gk">${p.goalkeeper?'Retirer 🧤':'Gardien'}</button></div>`;
    box.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>action(p,b.dataset.s));
  };
  const action=(p,a)=>{
    if(a==='field'){if(p.status!=='STARTER'&&starters()>=state.format)return status('Le terrain est complet pour ce format.');p.status='STARTER';if(p.x==null){p.x=50;p.y=50;}}
    if(a==='sub')p.status='SUBSTITUTE'; if(a==='avail')p.status='AVAILABLE';
    if(a==='captain'){state.players.forEach(x=>x.captain=false);p.captain=!p.captain;}
    if(a==='gk'){state.players.forEach(x=>x.goalkeeper=false);p.goalkeeper=!p.goalkeeper;} paint();
  };
  const bind=()=>{
    root.querySelector('[data-a="close"]').onclick=onClose;
    root.querySelector('[data-a="format"]').onchange=e=>{state.format=+e.target.value;state.formation='LIBRE';state.players.filter(p=>p.status==='STARTER').slice(state.format).forEach(p=>p.status='SUBSTITUTE');render();};
    root.querySelector('[data-a="formation"]').onchange=e=>state.formation=e.target.value;
    root.querySelector('[data-a="apply"]').onclick=()=>applyFormation();
    root.querySelector('[data-a="save"]').onclick=async()=>{try{await onSave(state);status('Brouillon enregistré.');}catch(e){status('Enregistrement impossible : '+e.message);}};
    root.querySelector('[data-a="publish"]').onclick=async()=>{try{if(starters()!==state.format)return status(`Place ${state.format} joueurs sur le terrain avant de publier.`);await onPublish(state);status('Composition publiée.');}catch(e){status('Publication impossible : '+e.message);}};
  };
  const applyFormation=()=>{if(state.formation==='LIBRE')return;const pos=formationPositions(state.format,state.formation);const chosen=state.players.filter(p=>p.status==='STARTER').concat(state.players.filter(p=>p.status!=='STARTER')).slice(0,state.format);state.players.forEach(p=>{if(!chosen.includes(p)&&p.status==='STARTER')p.status='SUBSTITUTE';});chosen.forEach((p,i)=>Object.assign(p,{status:'STARTER',x:pos[i].x,y:pos[i].y}));paint();};
  const get=id=>state.players.find(p=>p.playerId===id),starters=()=>state.players.filter(p=>p.status==='STARTER').length,status=t=>root.querySelector('#fcStatus').textContent=t;
  render();
}
function hydrate(match,callups,e){const saved=new Map((e?.match_composition_players||[]).map(p=>[p.player_id,p]));return{eventId:match.id,format:e?.format||11,formation:e?.formation||'LIBRE',published:!!e?.published,players:callups.map((p,i)=>{const s=saved.get(p.id);return{playerId:p.id,name:p.name,status:s?.status||'AVAILABLE',x:s?.x??50,y:s?.y??50,captain:!!s?.is_captain,goalkeeper:!!s?.is_goalkeeper};})};}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
