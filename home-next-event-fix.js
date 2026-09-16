import { supabase } from './supabase.js';
const $=id=>document.getElementById(id);
const teamId=()=>$('teamSelect')?.value||null;
const fmtDate=iso=>{if(!iso)return '—';const [y,m,d]=iso.split('-').map(Number);return new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date(y,m-1,d,12));};
const time5=v=>String(v||'').slice(0,5);
let running=false;
async function syncHomeNext(){
 if(running||!teamId()||!$('nextEventTitle'))return; running=true;
 try{
  const today=new Date();const iso=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const {data:ev,error}=await supabase.from('events').select('id,type,title,event_date,start_time,location,completed,cancelled').eq('team_id',teamId()).eq('completed',false).eq('cancelled',false).gte('event_date',iso).order('event_date').order('start_time').limit(1);
  if(error)return;
  const e=ev?.[0];
  if(!e){$('nextEventTitle').textContent='Aucun événement';$('nextEventMeta').textContent='Ajoute ou génère le planning.';$('nextEventBadge').textContent='—';return;}
  $('nextEventTitle').textContent=`${e.type==='training'?'Entraînement':(e.title||'Événement')} · ${time5(e.start_time)}`;
  $('nextEventMeta').textContent=`${fmtDate(e.event_date)}${e.location?' · '+e.location:''}`;
  $('nextEventBadge').textContent=e.type==='training'?'Entraînement':e.type==='match'?'Match':'Événement';
  const {data:ps}=await supabase.from('players').select('id').eq('team_id',teamId()).eq('active',true);
  let eligible=ps||[];
  if(e.type==='match'){
   const {data:cs}=await supabase.from('match_callups').select('player_id').eq('event_id',e.id);
   const ids=new Set((cs||[]).map(x=>x.player_id));eligible=eligible.filter(p=>ids.has(p.id));
  }
  const {data:att}=await supabase.from('attendance').select('player_id,declared_status').eq('event_id',e.id);
  const map=new Map((att||[]).map(a=>[a.player_id,a.declared_status]));let p=0,a=0,n=0;
  for(const pl of eligible){const s=map.get(pl.id);if(s==='PRESENT')p++;else if(s==='ABSENT')a++;else n++;}
  if($('nextPresent'))$('nextPresent').textContent=p;if($('nextAbsent'))$('nextAbsent').textContent=a;if($('nextNoReply'))$('nextNoReply').textContent=n;
 }finally{running=false;}
}
window.flemiSyncHomeNext=syncHomeNext;
document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="dashboard"],#dashboardTab,#homeTab'))setTimeout(syncHomeNext,150)});
$('teamSelect')?.addEventListener('change',()=>setTimeout(syncHomeNext,300));
window.addEventListener('focus',syncHomeNext);
setTimeout(syncHomeNext,500);setInterval(syncHomeNext,5000);
