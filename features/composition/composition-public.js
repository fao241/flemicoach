import { loadPublicComposition } from './composition-api.js';
import { renderPitch } from './composition-pitch.js';

export async function openPublicComposition(token) {
  document.querySelectorAll('body > section, body > div').forEach(x=>x.classList.add('hidden'));
  const shell=document.createElement('section');shell.className='fc-public-shell';document.body.appendChild(shell);
  shell.innerHTML='<div class="fc-public-card">Chargement de la composition…</div>';
  try{
    const raw=await loadPublicComposition(token),data=Array.isArray(raw)?raw[0]:raw;
    if(!data)throw new Error('Composition introuvable');
    const players=data.players||[],starters=players.filter(p=>p.status==='STARTER'),subs=players.filter(p=>p.status==='SUBSTITUTE');
    shell.innerHTML=`<div class="fc-public-card"><div class="brand">FlemiCoach</div><div class="muted small">Composition</div><h1>${esc(data.title)}</h1><div class="muted">${esc(data.event_date)} · ${esc(data.start_time||'')} ${data.location?'· '+esc(data.location):''}</div><div class="fc-pitch public" id="fcPublicPitch"></div><h3>Remplaçants</h3><div class="fc-public-subs">${subs.map(p=>`<span class="fc-chip">${esc(p.name)}</span>`).join('')||'<span class="muted">Aucun</span>'}</div></div>`;
    renderPitch(shell.querySelector('#fcPublicPitch'),starters.map(p=>({playerId:p.player_id,name:p.name,status:p.status,x:p.x,y:p.y,captain:p.is_captain,goalkeeper:p.is_goalkeeper})),{readonly:true});
  }catch(e){shell.innerHTML='<div class="fc-public-card"><h1>Composition indisponible</h1><p class="muted">'+esc(e.message)+'</p></div>';}
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
