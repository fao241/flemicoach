import { supabase } from './supabase.js';
import './fff-sync.js';

const $ = id => document.getElementById(id);
let selectedFilter = 'all';
let observer = null;
const typeCache = new Map();

function ensureStrictCss() {
  if ($('strictCalendarFilterCss')) return;
  const style = document.createElement('style');
  style.id = 'strictCalendarFilterCss';
  style.textContent = `
    #calendar[data-event-filter="training"] #matchActions{display:none!important}
    #calendar[data-event-filter="training"] #lifecycleHost .life-card[data-event-type="match"]{display:none!important}
    #calendar[data-event-filter="training"] #lifecycleHost .life-card[data-event-type="event"]{display:none!important}

    #calendar[data-event-filter="match"] #lifecycleHost .life-card[data-event-type="training"]{display:none!important}
    #calendar[data-event-filter="match"] #lifecycleHost .life-card[data-event-type="event"]{display:none!important}
  `;
  document.head.appendChild(style);
}

async function classifyCards() {
  const host = $('lifecycleHost');
  if (!host) return;
  const cards = [...host.querySelectorAll('.life-card[data-detail]')];
  const missing = [...new Set(cards.map(card => card.dataset.detail).filter(id => id && !typeCache.has(id)))];

  if (missing.length) {
    const { data, error } = await supabase.from('events').select('id,type').in('id', missing);
    if (error) throw error;
    for (const event of data || []) typeCache.set(event.id, event.type);
  }

  for (const card of cards) {
    const type = typeCache.get(card.dataset.detail);
    if (type) card.dataset.eventType = type;
  }
}

async function applyFilter() {
  const calendar = $('calendar');
  const host = $('lifecycleHost');
  if (!calendar || !host) return;

  ensureStrictCss();
  calendar.dataset.eventFilter = selectedFilter;
  await classifyCards();

  const cards = [...host.querySelectorAll('.life-card[data-detail]')];
  for (const card of cards) {
    const type = card.dataset.eventType;
    const visible = selectedFilter === 'all' || type === selectedFilter;
    if (visible) card.style.removeProperty('display');
    else card.style.setProperty('display', 'none', 'important');
  }

  document.querySelectorAll('#calendar .filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === selectedFilter);
  });

  let empty = $('calendarFilterEmpty');
  if (!empty) {
    empty = document.createElement('div');
    empty.id = 'calendarFilterEmpty';
    empty.className = 'card muted';
    empty.style.cssText = 'padding:24px;text-align:center;display:none';
    host.appendChild(empty);
  }

  const visibleCount = cards.filter(card => selectedFilter === 'all' || card.dataset.eventType === selectedFilter).length;
  if (!visibleCount) {
    empty.textContent = selectedFilter === 'training'
      ? 'Aucun entraînement dans cette période.'
      : selectedFilter === 'match'
        ? 'Aucun match dans cette période.'
        : 'Aucun événement dans cette période.';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
  }
}

function selectFilter(value) {
  selectedFilter = value || 'all';
  const calendar = $('calendar');
  if (calendar) calendar.dataset.eventFilter = selectedFilter;
  applyFilter().catch(console.error);
}

function wireFilters() {
  document.querySelectorAll('#calendar .filter').forEach(btn => {
    if (btn.dataset.strictFilterBound) return;
    btn.dataset.strictFilterBound = '1';
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectFilter(btn.dataset.filter);
    }, true);
  });
}

function attach() {
  ensureStrictCss();
  wireFilters();
  const calendar = $('calendar');
  if (!calendar) return;
  calendar.dataset.eventFilter = selectedFilter;

  if (observer) observer.disconnect();
  observer = new MutationObserver(() => applyFilter().catch(console.error));
  observer.observe(calendar, { childList: true, subtree: true });

  applyFilter().catch(console.error);
}

document.querySelector('[data-view="calendar"]')?.addEventListener('click', () => setTimeout(attach, 150));
$('teamSelect')?.addEventListener('change', () => {
  typeCache.clear();
  setTimeout(attach, 200);
});

setTimeout(attach, 500);
setTimeout(attach, 1200);
