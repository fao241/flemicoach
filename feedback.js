import { supabase } from './supabase.js';

const $ = id => document.getElementById(id);
const teamId = () => $('teamSelect')?.value || null;

function addStyles(){
  if ($('feedbackStyles')) return;
  const style = document.createElement('style');
  style.id = 'feedbackStyles';
  style.textContent = `
    .reliability-help{display:inline-grid;place-items:center;width:17px;height:17px;margin-left:4px;border:1px solid #aebbb3;border-radius:50%;font-size:11px;font-weight:850;color:#526159;cursor:help;vertical-align:middle;background:#fff}
    .feedback-card{margin-top:18px;padding:20px}.feedback-card h3{margin:0 0 5px}.feedback-card p{margin:0 0 14px}.feedback-card textarea{width:100%;resize:vertical;min-height:88px}.feedback-actions{display:flex;align-items:center;gap:12px;margin-top:10px;flex-wrap:wrap}.feedback-actions .btn{margin-left:auto}
    @media(max-width:520px){.feedback-actions .btn{width:100%;margin-left:0}}
  `;
  document.head.appendChild(style);
}

function reliabilityInfo(){
  const title = 'Fiabilité : correspondance entre les réponses annoncées et la présence réelle.';
  document.querySelectorAll('#players .compact-labels span, #playerDetail .stat span').forEach(label => {
    if (!/^Fiabilité/.test(label.textContent.trim()) || label.querySelector('.reliability-help')) return;
    const info = document.createElement('span');
    info.className = 'reliability-help';
    info.textContent = 'i';
    info.title = title;
    info.setAttribute('aria-label', title);
    info.setAttribute('tabindex', '0');
    label.append(' ', info);
  });
}

function addFeedbackCard(){
  const dashboard = $('dashboard');
  if (!dashboard || $('userFeedbackCard')) return;
  const card = document.createElement('section');
  card.id = 'userFeedbackCard';
  card.className = 'card feedback-card';
  card.innerHTML = `
    <h3>Une idée pour améliorer FlemiCoach ?</h3>
    <p class="muted small">Un manque, quelque chose à simplifier ou une fonction que tu aimerais avoir ? Dis-nous ce qui te serait réellement utile.</p>
    <textarea id="userFeedbackMessage" maxlength="1500" rows="3" placeholder="Ex. J’aimerais pouvoir…"></textarea>
    <div class="feedback-actions">
      <span id="userFeedbackStatus" class="muted small"></span>
      <button id="sendUserFeedback" type="button" class="btn">Envoyer mon retour</button>
    </div>`;
  dashboard.appendChild(card);
  $('sendUserFeedback').addEventListener('click', submitFeedback);
}

async function submitFeedback(){
  const message = $('userFeedbackMessage')?.value.trim() || '';
  const status = $('userFeedbackStatus');
  const button = $('sendUserFeedback');
  if (message.length < 3) {
    status.textContent = 'Écris quelques mots avant d’envoyer.';
    return;
  }
  button.disabled = true;
  status.textContent = 'Envoi…';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Session expirée.');
    const { error } = await supabase.from('user_feedback').insert({
      user_id: user.id,
      team_id: teamId(),
      message
    });
    if (error) throw error;
    $('userFeedbackMessage').value = '';
    status.textContent = 'Merci, retour envoyé.';
    window.flemiTrack?.('feedback_submitted', { teamId: teamId() });
  } catch (e) {
    console.error(e);
    status.textContent = 'Impossible d’envoyer pour le moment.';
  } finally {
    button.disabled = false;
  }
}

function boot(){
  addStyles();
  reliabilityInfo();
  addFeedbackCard();
  const observer = new MutationObserver(reliabilityInfo);
  if ($('players')) observer.observe($('players'), { childList:true, subtree:true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
