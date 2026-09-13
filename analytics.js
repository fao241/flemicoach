import './feedback.js';
import './event-sharing.js';
import { startCoachNotifications } from './notifications.js';
import { supabase } from './supabase.js';

const KEY='flemicoach_analytics_id';
function anonymousId(){
  let id=localStorage.getItem(KEY);
  if(!id){id=crypto.randomUUID();localStorage.setItem(KEY,id);}
  return id;
}
function params(){const p=new URLSearchParams(location.search);return{source:p.get('utm_source'),medium:p.get('utm_medium'),campaign:p.get('utm_campaign')};}
async function track(name,{teamId=null,eventId=null}={}){
  try{
    const u=params();
    await supabase.rpc('log_analytics_event',{
      p_event_name:name,p_anonymous_id:anonymousId(),p_team_id:teamId,p_event_id:eventId,
      p_source:u.source,p_medium:u.medium,p_campaign:u.campaign,p_page:location.pathname
    });
  }catch(e){console.debug('analytics',e);}
}

track('page_view');
document.querySelector('[data-auth-tab="signup"]')?.addEventListener('click',()=>track('signup_started'),{once:true});
document.getElementById('shareWhatsApp')?.addEventListener('click',()=>track('share_whatsapp_clicked'));
const query=new URLSearchParams(location.search);
if(query.get('event')) track('response_link_opened');
document.getElementById('publicForm')?.addEventListener('submit',()=>track('response_submitted'));
window.flemiTrack=track;
startCoachNotifications();
