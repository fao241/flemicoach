import './fff-sync.js';

const $ = id => document.getElementById(id);
let observer = null;

function currentFilter() {
  return document.querySelector('#calendar .filter.active')?.dataset.filter || 'all';
}

function lifecycleType(card) {
  const label = (card.querySelector('.eyebrow')?.textContent || '').trim().toLowerCase();
  if (label.startsWith('match')) return 'match';
  if (label.startsWith('entraînement') || label.startsWith('entrainement')) return 'training';
  return 'event';
}

function applyLifecycleFilter() {
  const host = $('lifecycleHost');
  const filter = currentFilter();

  if (host) {
    host.querySelectorAll('.life-card').forEach(card => {
      const visible = filter === 'all' || lifecycleType(card) === filter;
      card.style.display = visible ? '' : 'none';
    });
  }

  const matchActions = $('matchActions');
  if (matchActions) {
    matchActions.style.display = filter === 'match' ? '' : 'none';
  }
}

function attachObserver() {
  const calendar = $('calendar');
  if (!calendar) return;

  if (observer) observer.disconnect();
  observer = new MutationObserver(() => applyLifecycleFilter());
  observer.observe(calendar, { childList: true, subtree: true });
  applyLifecycleFilter();
}

// IMPORTANT : on ne bloque plus les listeners natifs de app.js.
// app.js gère déjà correctement calendarFilter + renderCalendar().
// Ce fichier ne fait que synchroniser la vue enrichie de event-lifecycle.js.
document.querySelectorAll('#calendar .filter').forEach(btn => {
  btn.addEventListener('click', () => {
    // Le listener app.js s'exécute sur le même clic et met d'abord la classe active.
    queueMicrotask(applyLifecycleFilter);
    setTimeout(applyLifecycleFilter, 80);
    setTimeout(applyLifecycleFilter, 250);
  });
});

document.querySelector('[data-view="calendar"]')?.addEventListener('click', () => {
  setTimeout(attachObserver, 180);
});

$('teamSelect')?.addEventListener('change', () => {
  setTimeout(attachObserver, 220);
});

setTimeout(attachObserver, 700);
setTimeout(attachObserver, 1500);
