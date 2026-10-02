const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

export function renderPitch(root, players, {readonly=false,onMove=()=>{},onSelect=()=>{}}={}) {
  root.innerHTML='<div class="fc-pitch-lines"><div class="fc-half"></div><div class="fc-circle"></div><div class="fc-box top"></div><div class="fc-box bottom"></div></div>';
  players.filter(p=>p.status==='STARTER').forEach(p=>{
    const el=document.createElement('button');
    el.type='button'; el.className='fc-player-dot'; el.dataset.playerId=p.playerId;
    el.style.left=p.x+'%'; el.style.top=p.y+'%';
    el.innerHTML='<span>'+escapeHtml(p.name || 'Joueur')+'</span>'+(p.captain?'<b>C</b>':'')+(p.goalkeeper?'<i>🧤</i>':'');
    if(readonly){el.disabled=true;} else {
      el.addEventListener('click',e=>{e.stopPropagation();onSelect(p.playerId);});
      el.addEventListener('pointerdown',e=>startDrag(e,el,p,root,onMove));
    }
    root.appendChild(el);
  });
  if(!readonly) root.onclick=e=>{
    if(e.target!==root && !e.target.classList.contains('fc-pitch-lines'))return;
    const id=root.dataset.selected;if(!id)return;
    const r=root.getBoundingClientRect();
    onMove(id,clamp((e.clientX-r.left)/r.width*100,4,96),clamp((e.clientY-r.top)/r.height*100,4,96));
  };
}

function startDrag(e,el,p,root,onMove){
  if(e.pointerType==='mouse' && e.button!==0)return;
  el.setPointerCapture?.(e.pointerId);
  const move=ev=>{const r=root.getBoundingClientRect();onMove(p.playerId,clamp((ev.clientX-r.left)/r.width*100,4,96),clamp((ev.clientY-r.top)/r.height*100,4,96));};
  const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);};
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);
}
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
