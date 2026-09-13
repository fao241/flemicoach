import { supabase } from './supabase.js';

const MAX_NOTIFICATIONS = 5;

function currentTeamId() {
  return localStorage.getItem('flemicoach_team_id') || localStorage.getItem('teamId');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(new Date(`${date}T12:00:00`));
}

async function loadNotifications() {
  const teamId = currentTeamId();
  if (!teamId) return [];

  const { data: events, error } = await supabase
    .from('events')
    .select('id,type,title,event_date,start_time')
    .eq('team_id', teamId)
    .eq('cancelled', false)
    .eq('completed', false)
    .gte('event_date', todayISO())
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(MAX_NOTIFICATIONS);

  if (error) {
    console.error('FlemiCoach notifications:', error);
    return [];
  }

  return (events || []).map((event) => ({
    id: event.id,
    title: event.title || (event.type === 'MATCH' ? 'Match' : 'Entraînement'),
    detail: `${formatDate(event.event_date)}${event.start_time ? ` · ${event.start_time.slice(0, 5)}` : ''}`
  }));
}

function ensureStyles() {
  if (document.getElementById('coachNotificationsStyles')) return;

  const style = document.createElement('style');
  style.id = 'coachNotificationsStyles';
  style.textContent = `
    .coach-notifications{position:fixed;top:14px;right:14px;z-index:1100;font-family:inherit}
    .coach-notifications__button{position:relative;width:42px;height:42px;border:1px solid #dfe7e2;border-radius:50%;background:#fff;cursor:pointer;font-size:19px;box-shadow:0 4px 16px rgba(0,0,0,.08)}
    .coach-notifications__badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#173f2d;color:#fff;font-size:11px;line-height:18px;text-align:center}
    .coach-notifications__panel{display:none;position:absolute;top:50px;right:0;width:min(330px,calc(100vw - 28px));padding:10px;border:1px solid #e3e9e5;border-radius:14px;background:#fff;box-shadow:0 12px 32px rgba(0,0,0,.12)}
    .coach-notifications.is-open .coach-notifications__panel{display:block}
    .coach-notifications__title{margin:2px 4px 8px;font-size:14px;font-weight:700}
    .coach-notifications__item{padding:9px 6px;border-top:1px solid #eef2ef}
    .coach-notifications__item:first-of-type{border-top:0}
    .coach-notifications__item strong{display:block;font-size:13px}
    .coach-notifications__item span{display:block;margin-top:2px;color:#68746d;font-size:12px}
    .coach-notifications__empty{padding:10px 6px;color:#68746d;font-size:13px}
  `;
  document.head.appendChild(style);
}

function render(notifications) {
  document.getElementById('coachNotifications')?.remove();
  if (!document.getElementById('appScreen') || document.getElementById('appScreen').classList.contains('hidden')) return;

  const root = document.createElement('div');
  root.id = 'coachNotifications';
  root.className = 'coach-notifications';

  const badge = notifications.length
    ? `<span class="coach-notifications__badge">${notifications.length}</span>`
    : '';
  const items = notifications.length
    ? notifications.map((item) => `<div class="coach-notifications__item"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></div>`).join('')
    : '<div class="coach-notifications__empty">Aucune actualité pour le moment.</div>';

  root.innerHTML = `
    <button class="coach-notifications__button" type="button" aria-label="Ouvrir les notifications" aria-expanded="false">🔔${badge}</button>
    <div class="coach-notifications__panel" role="region" aria-label="Notifications">
      <div class="coach-notifications__title">Actualités</div>
      ${items}
    </div>
  `;

  const button = root.querySelector('button');
  button.addEventListener('click', () => {
    const open = root.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
  });

  document.body.appendChild(root);
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = value ?? '';
  return element.innerHTML;
}

async function refresh() {
  ensureStyles();
  render(await loadNotifications());
}

export function startCoachNotifications() {
  refresh();
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
}
