import { supabase } from './supabase.js';

const $=id=>document.getElementById(id);
const teamId=()=>$('teamSelect')?.value||null;
let syncing=false;

async function markSelectedEventValidated(){
  const eventId=$('attendanceEventSelect')?.value;
  if(!eventId)return;
  // Let app.js finish all attendance upserts first.
  setTimeout(async()=>{
    const feedback=$('attendanceFeedback');
    if(feedback?.classList.contains('error'))return;
    const {error}=await supabase.from('events').update({attendance_validated_at:new Date().toISOString()}).eq('id',eventId);
    if(error)console.error('attendance validation state',error);
    await refreshValidationAlert();
  },700);
}

async function refreshValidationAlert(){
  if(syncing||!teamId()||!$('dashboard')?.classList.contains('active-view'))return;
  syncing=true;
  try{
    const now=new Date();
    const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const {data,error}=await supabase.from('events').select('id,event_date,start_time,cancelled,completed,attendance_validated_at').eq('team_id',teamId()).eq('cancelled',false);
    if(error)throw error;
    const pending=(data||[]).filter(e=>{
      const past=e.event_date<today || (e.event_date===today && String(e.start_time||'23:59')<now.toTimeString().slice(0,5));
      return past&&!e.completed&&!e.attendance_validated_at;
    });
    const alert=$('validationAlert');
    if(!alert)return;
    if(!pending.length){alert.className='hidden';alert.innerHTML='';return;}
    alert.className='validation-alert';
    alert.innerHTML=`<strong>⚠ ${pending.length} événement(s) à valider</strong><div class="muted small">Valide les présences réelles pour garder des statistiques fiables.</div><button type="button" id="goValidation" class="btn small-btn top-gap-sm">Valider maintenant</button>`;
    $('goValidation')?.addEventListener('click',()=>document.querySelector('[data-view="attendance"]')?.click());
  }catch(e){console.error('validation alert',e);}finally{syncing=false;}
}

// Capture the explicit coach save action. Once saved, the event remains validated even if players are added later.
$('saveAttendance')?.addEventListener('click',markSelectedEventValidated);
document.querySelector('[data-view="dashboard"]')?.addEventListener('click',()=>setTimeout(refreshValidationAlert,900));
$('teamSelect')?.addEventListener('change',()=>setTimeout(refreshValidationAlert,1200));
window.addEventListener('focus',()=>setTimeout(refreshValidationAlert,500));
setInterval(refreshValidationAlert,3000);
setTimeout(refreshValidationAlert,1800);
