import { supabase } from './supabase.js';

const MAX_NOTIFICATIONS = 5;

async function loadNotifications() {
  const { data, error } = await supabase
    .from('announcements')
    .select('id,title,message,created_at')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(MAX_NOTIFICATIONS);

  if (error) {
    console.error('FlemiCoach notifications:', error);
    return [];
  }

  return data || [];
}

function ensureStyles() {
  if (document.getElementById('coachNotificationsStyles')) return;

  const style = document.createElement('style');
  style.id = 'coachNotificationsStyles';
  style.textContent = `
    .coach-notifications{position:fixed;top:14px;right:14px;z-index:1100;font-family:inherit}
    .coach-notifications__button{position:relative;width:42px;height:42px;border:1px solid #dfe7e2;border-radius:50%;background:#fff;cursor:pointer;font-size:19px;box-shadow:0 4px 16px rgba(0,0,0,.08)}
    .coach-notifications__badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#173f2d;color:#fff;font-size:11px;line-height:18px;text-align:center}
    .coach-notifications__panel{display:none;position:absolute;top:50px;right:0;width:min(340px,calc(100vw - 28px));padding:10px;border:1px solid #e3e9e5;border-radius:14px;background:#fff;box-shadow:0 12px 32px rgba(0,0,0,.12)}
    .coach-notifications.is-open .coach-notifications__panel{display:block}
    .coach-notifications__title{margin:2px 4px 8px;font-size:14px;font-weight:700}
    .coach-notifications__item{padding:10px 6px;border-top:1px solid #eef2ef}
    .coach-notifications__item:first-of-type{border-top:0}
    .coach-notifications__item strong{display:block;font-size:13px}
    .coach-notifications__item span{display:block;margin-top:4px;color:#68746d;font-size:12px;line-height:1.45}
    .coach-notifications__empty{padding:10px 6px;color:#68746d;font-size:13px}
  `;
  document.head.appendChild(style);
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = value ?? '';
  return element.innerHTML;
}

function render(notifications) {
  document.getElementById('coachNotifications')?.remove();

  const appScreen = document.getElementById('appScreen');
  if (!appScreen || appScreen.classList.contains('hidden')) return;

  const root = document.createElement('div');
  root.id = 'coachNotifications';
  root.className = 'coach-notifications';

  const badge = notifications.length
    ? `<span class="coach-notifications__badge">${notifications.length}</span>`
    : '';

  const items = notifications.length
    ? notifications.map((notification) => `
        <div class="coach-notifications__item">
          <strong>${escapeHtml(notification.title)}</strong>
          <span>${escapeHtml(notification.message)}</span>
        </div>
      `).join('')
    : '<div class="coach-notifications__empty">Aucune actualité pour le moment.</div>';

  root.innerHTML = `
    <button class="coach-notifications__button" type="button" aria-label="Ouvrir les actualités" aria-expanded="false">🔔${badge}</button>
    <div class="coach-notifications__panel" role="region" aria-label="Actualités FlemiCoach">
      <div class="coach-notifications__title">Actualités FlemiCoach</div>
      ${items}
    </div>
  `;

  const button = root.querySelector('button');
  button.addEventListener('click', () => {
    const isOpen = root.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(isOpen));
  });

  document.body.appendChild(root);
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
