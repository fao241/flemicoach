import { supabase } from '../../supabase.js';

const $=id=>document.getElementById(id);
let eventId=null, players=[], layout=[], currentFormat=11, publicToken=null, published=false;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function teamId(){return $('teamSelect')?.value||null}
function labelEvent(e){return `${e.event_date} — ${e.title}`}
async function loadMatches(){
 const tid=teamId(); if(!tid)return;
 const {data,error}=await supabase.from('events').select('id,title,event_date,start_time').eq('team_id',tid).eq('type','match').order('event_date',{ascending:false}).limit(60);
 if(error)throw error;
 $('compositionMatch').innerHTML='<option value="">Choisir un match…</option>'+data.map(e=>`<option value="${e.id}">${labelEvent(e)}</option>`).join('');
}
async function loadComposition(id){
 eventId=id; players=[]; layout=[]; publicToken=null; published=false; $('compositionStatus').textContent='Chargement…';
 if(!id){render();return}
 const {data:callups,error:cErr}=await supabase.from('match_callups').select('player_id').eq('event_id',id);
 if(cErr)throw cErr;
 const ids=(callups||[]).map(x=>x.player_id);
 if(ids.length){
  const {data:p,error:pErr}=await supabase.from('players').select('id,name').in('id',ids).eq('active',true).order('name');
  if(pErr)throw pErr; players=p||[];
 }
 const {data:saved,error:sErr}=await supabase.from('match_compositions').select('format,layout,public_token,published').eq('event_id',id).maybeSingle();
 if(sErr)throw sErr;
 currentFormat=saved?.format||11; publicToken=saved?.public_token||null; published=!!saved?.published; $('compositionFormat').value=String(currentFormat);
 const allowed=new Set(players.map(p=>p.id));
 layout=Array.isArray(saved?.layout)?saved.layout.filter(x=>allowed.has(x.player_id)):[];
 $('compositionStatus').textContent=players.length?`${players.length} convoqué(s)`:'Aucun joueur convoqué pour ce match.';
 render();
}
function render(){
 const pitch=$('compositionPitch'), bench=$('compositionBenchList'); pitch.querySelectorAll('.comp-player').forEach(n=>n.remove()); bench.innerHTML='';
 const placed=new Map(layout.filter(x=>x.placed).map(x=>[x.player_id,x]));
 for(const p of players){
  const pos=placed.get(p.id);
  if(pos){const el=document.createElement('div');el.className='comp-player';el.textContent=p.name;el.dataset.id=p.id;el.style.left=clamp(+pos.x||50,4,96)+'%';el.style.top=clamp(+pos.y||50,3,97)+'%';pitch.appendChild(el);wireDrag(el);}
  else {const el=document.createElement('div');el.className='bench-player';el.textContent=p.name;el.dataset.id=p.id;el.draggable=true;el.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',p.id));bench.appendChild(el);}
 }
 if(!players.length)bench.innerHTML='<div class="composition-empty">Sélectionne un match contenant des convoqués.</div>';
}
function setPlaced(id,x,y){layout=layout.filter(v=>v.player_id!==id);layout.push({player_id:id,placed:true,x:clamp(x,4,96),y:clamp(y,3,97)});render()}
function wireDrag(el){
 const move=e=>{const r=$('compositionPitch').getBoundingClientRect(),pt=e.touches?.[0]||e;setPlaced(el.dataset.id,(pt.clientX-r.left)/r.width*100,(pt.clientY-r.top)/r.height*100)};
 el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);el.classList.add('dragging')});
 el.addEventListener('pointermove',e=>{if(!el.hasPointerCapture(e.pointerId))return;const r=$('compositionPitch').getBoundingClientRect();el.style.left=clamp((e.clientX-r.left)/r.width*100,4,96)+'%';el.style.top=clamp((e.clientY-r.top)/r.height*100,3,97)+'%'});
 el.addEventListener('pointerup',e=>{if(!el.hasPointerCapture(e.pointerId))return;el.releasePointerCapture(e.pointerId);el.classList.remove('dragging');move(e)});
 el.addEventListener('dblclick',()=>{layout=layout.filter(v=>v.player_id!==el.dataset.id);render()});
}
function wirePitch(){
 const pitch=$('compositionPitch');
 pitch.addEventListener('dragover',e=>e.preventDefault());
 pitch.addEventListener('drop',e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain'),r=pitch.getBoundingClientRect();if(id)setPlaced(id,(e.clientX-r.left)/r.width*100,(e.clientY-r.top)/r.height*100)});
}
async function save(extra={}){
 if(!eventId)return null;
 $('compositionStatus').textContent='Enregistrement…';
 const payload={event_id:eventId,format:currentFormat,layout,updated_at:new Date().toISOString(),...extra};
 const {data,error}=await supabase.from('match_compositions').upsert(payload,{onConflict:'event_id'}).select('public_token,published').single();
 if(error)throw error;
 publicToken=data.public_token; published=!!data.published;
 $('compositionStatus').textContent='Composition enregistrée.';
 return data;
}
function compositionPublicLink(token=publicToken){
 const base=new URL('.',location.href); base.search=''; base.hash='';
 base.searchParams.set('composition',token);
 return base.href;
}

function wrapText(ctx,text,maxWidth){
 const words=String(text||'').split(/\s+/), lines=[]; let line='';
 for(const word of words){
  const test=line?line+' '+word:word;
  if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test;
 }
 if(line)lines.push(line);
 return lines;
}
async function compositionImage(match){
 const W=1080,H=1450,margin=54,pitchX=90,pitchY=190,pitchW=900,pitchH=1030;
 const canvas=document.createElement('canvas'); canvas.width=W;canvas.height=H;
 const ctx=canvas.getContext('2d');
 ctx.fillStyle='#f5f7f5';ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#153a25';ctx.font='800 46px system-ui,sans-serif';ctx.fillText('FlemiCoach · Composition',margin,72);
 ctx.font='700 28px system-ui,sans-serif';ctx.fillStyle='#44534a';ctx.fillText(match,margin,122);
 ctx.font='700 23px system-ui,sans-serif';ctx.fillStyle='#166534';ctx.fillText('Foot à '+currentFormat,margin,160);

 ctx.fillStyle='#25894b';ctx.fillRect(pitchX,pitchY,pitchW,pitchH);
 ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=5;
 ctx.strokeRect(pitchX+22,pitchY+22,pitchW-44,pitchH-44);
 ctx.beginPath();ctx.moveTo(pitchX+22,pitchY+pitchH/2);ctx.lineTo(pitchX+pitchW-22,pitchY+pitchH/2);ctx.stroke();
 ctx.beginPath();ctx.arc(pitchX+pitchW/2,pitchY+pitchH/2,105,0,Math.PI*2);ctx.stroke();
 ctx.strokeRect(pitchX+260,pitchY+22,380,150);
 ctx.strokeRect(pitchX+260,pitchY+pitchH-172,380,150);

 const placed=new Map(layout.filter(x=>x.placed).map(x=>[x.player_id,x]));
 ctx.textAlign='center';ctx.textBaseline='middle';
 for(const p of players){
  const pos=placed.get(p.id); if(!pos)continue;
  const x=pitchX+(clamp(+pos.x||50,4,96)/100)*pitchW;
  const y=pitchY+(clamp(+pos.y||50,3,97)/100)*pitchH;
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,52,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#153a25';ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle='#153a25';ctx.font='800 19px system-ui,sans-serif';
  const lines=wrapText(ctx,p.name,84).slice(0,3);
  lines.forEach((line,i)=>ctx.fillText(line,x,y+(i-(lines.length-1)/2)*20));
 }
 ctx.textAlign='left';ctx.textBaseline='alphabetic';
 const bench=players.filter(p=>!placed.has(p.id));
 ctx.fillStyle='#153a25';ctx.font='800 27px system-ui,sans-serif';ctx.fillText('Remplaçants',margin,1288);
 ctx.fillStyle='#44534a';ctx.font='650 22px system-ui,sans-serif';
 const benchText=bench.map(p=>p.name).join(' · ')||'Aucun';
 wrapText(ctx,benchText,W-margin*2).slice(0,4).forEach((line,i)=>ctx.fillText(line,margin,1326+i*29));
 return new Promise(resolve=>canvas.toBlob(resolve,'image/png',0.95));
}
async function share(){
 if(!eventId)return;
 const saved=await save({published:true,published_at:new Date().toISOString()});
 const url=compositionPublicLink(saved.public_token);
 const match=$('compositionMatch').selectedOptions[0]?.textContent||'Match';
 const text=`⚽ Composition FlemiCoach\n${match}\nVoir la composition complète : ${url}`;
 if(navigator.share){
  try{
   const blob=await compositionImage(match);
   const file=blob?new File([blob],'composition-flemicoach.png',{type:'image/png'}):null;
   if(file&&navigator.canShare?.({files:[file]})){
    await navigator.share({title:'Composition FlemiCoach',text,url,files:[file]});
   }else{
    await navigator.share({title:'Composition FlemiCoach',text,url});
   }
   $('compositionStatus').textContent='Composition visuelle prête à être partagée.';
   return;
  }catch(e){if(e.name==='AbortError')return}
 }
 await navigator.clipboard.writeText(url);
 $('compositionStatus').textContent='Lien public copié : il ouvre le terrain complet avec les joueurs placés.';
}
function reset(){layout=[];render();$('compositionStatus').textContent='Placement réinitialisé (enregistre pour confirmer).'}
async function init(){
 if(!$('compositionMatch'))return;
 wirePitch();
 $('compositionMatch').addEventListener('change',e=>loadComposition(e.target.value).catch(showError));
 $('compositionFormat').addEventListener('change',e=>{currentFormat=+e.target.value;$('compositionStatus').textContent='Format modifié — placement libre.'});
 $('saveComposition').addEventListener('click',()=>save().catch(showError));
 $('shareComposition').addEventListener('click',()=>share().catch(showError));
 $('resetComposition').addEventListener('click',reset);
 document.querySelector('[data-view="composition"]').addEventListener('click',()=>loadMatches().catch(showError));
 $('teamSelect')?.addEventListener('change',()=>{eventId=null;players=[];layout=[];loadMatches().catch(showError);render()});
 await loadMatches();
}
function showError(e){console.error(e);$('compositionStatus').textContent='Erreur : '+(e?.message||e)}
init().catch(showError);
