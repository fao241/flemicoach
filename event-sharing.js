import { supabase } from './supabase.js';

const APP_URL = 'https://fao241.github.io/flemicoach/';
const $ = id => document.getElementById(id);

function currentTeamId() {
  return $('teamSelect')?.value || null;
}

function currentTeamName() {
  return $('teamSelect')?.selectedOptions?.[0]?.textContent?.trim() || 'Équipe';
}

function todayISO() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(year, month - 1, day, 12));
}

function formatTime(value) {
  return String(value || '').slice(0, 5);
}

function eventName(event) {
  if (event.type === 'training') return 'Entraînement';
  return event.title || (event.type === 'match' ? 'Match' : 'Événement');
}

function publicLink(event) {
  return `${APP_URL}?event=${encodeURIComponent(event.public_token)}`;
}

function shareMessage(event) {
  const place = event.location ? ` · ${event.location}` : '';
  return `⚽ ${currentTeamName()} — ${eventName(event)}\n${formatDate(event.event_date)} à ${formatTime(event.start_time)}${place}\n\nMerci d’indiquer la présence :\n${publicLink(event)}`;
}

async function shareOnWhatsApp(event) {
  const message = shareMessage(event);

  try {
    if (navigator.share) {
      await navigator.share({ title: 'FlemiCoach', text: message });
    } else {
      await navigator.clipboard.writeText(message);
      alert('Message copié. Tu peux maintenant le coller dans WhatsApp.');
    }
    window.flemiTrack?.('share_whatsapp_clicked', {
      teamId: currentTeamId(),
      eventId: event.id,
    });
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error('FlemiCoach WhatsApp share', error);
      alert('Impossible de partager pour le moment.');
    }
  }
}

async function loadUpcomingEvents() {
  const teamId = currentTeamId();
  if (!teamId) return [];

  const { data, error } = await supabase
    .from('events')
    .select('id,type,title,event_date,start_time,location,public_token,completed,cancelled')
    .eq('team_id', teamId)
    .eq('completed', false)
    .eq('cancelled', false)
    .gte('event_date', todayISO())
    .order('event_date')
    .order('start_time')
    .limit(12);

  if (error) {
    console.error('FlemiCoach upcoming events', error);
    return [];
  }

  return data || [];
}

function ensureStyles() {
  if ($('eventSharingStyles')) return;

  const style = document.createElement('style');
  style.id = 'eventSharingStyles';
  style.textContent = `
    .event-sharing{margin-top:18px}
    .event-sharing-head{margin-bottom:10px}
    .event-sharing-head h3{margin:0 0 4px;font-size:1rem}
    .event-sharing-list{display:grid;gap:8px}
    .event-sharing-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border:1px solid #dfe7e2;border-radius:12px;background:#fff}
    .event-sharing-info{min-width:0}
    .event-sharing-title{font-weight:800}
    .event-sharing-meta{margin-top:2px;color:#6d7973;font-size:.8rem}
    .event-sharing-row .btn{flex:0 0 auto}
    @media(max-width:620px){.event-sharing-row{align-items:flex-start;flex-direction:column}.event-sharing-row .btn{width:100%}}
  `;
  document.head.appendChild(style);
}

function ensureHost() {
  const hero = document.querySelector('#dashboard .hero-card');
  if (!hero) return null;

  let host = $('eventSharing');
  if (host) return host;

  host = document.createElement('section');
  host.id = 'eventSharing';
  host.className = 'event-sharing';
  host.innerHTML = `
    <div class="event-sharing-head">
      <h3>Partager une disponibilité</h3>
      <div class="muted small">Choisis la séance ou le match que tu veux envoyer.</div>
    </div>
    <div id="eventSharingList" class="event-sharing-list"></div>
  `;

  hero.appendChild(host);
  return host;
}

async function render() {
  if (!document.querySelector('#dashboard.active-view')) return;

  ensureStyles();
  const host = ensureHost();
  if (!host) return;

  const list = $('eventSharingList');
  const events = await loadUpcomingEvents();
  list.replaceChildren();

  if (!events.length) {
    list.innerHTML = '<div class="muted small">Aucun événement à venir.</div>';
    return;
  }

  for (const event of events) {
    const row = document.createElement('div');
    row.className = 'event-sharing-row';

    const info = document.createElement('div');
    info.className = 'event-sharing-info';

    const title = document.createElement('div');
    title.className = 'event-sharing-title';
    title.textContent = eventName(event);

    const meta = document.createElement('div');
    meta.className = 'event-sharing-meta';
    meta.textContent = `${formatDate(event.event_date)} · ${formatTime(event.start_time)}${event.location ? ` · ${event.location}` : ''}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn primary small-btn';
    button.textContent = 'Partager WhatsApp';
    button.addEventListener('click', () => shareOnWhatsApp(event));

    info.append(title, meta);
    row.append(info, button);
    list.appendChild(row);
  }
}

function boot() {
  document.querySelector('[data-view="dashboard"]')?.addEventListener('click', () => setTimeout(render, 200));
  $('teamSelect')?.addEventListener('change', () => setTimeout(render, 350));
  window.addEventListener('focus', () => setTimeout(render, 150));
  setTimeout(render, 900);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
