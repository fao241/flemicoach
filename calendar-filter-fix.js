import { supabase } from './supabase.js';
import './fff-sync.js';

const $ = id => document.getElementById(id);
let selectedFilter = 'all';
let observer = null;
let applyVersion = 0;
let applyScheduled = false;
const typeCache = new Map();

function scheduleApply(delay = 0) {
  if (applyScheduled && delay === 0) return;
  if (delay > 0) {
    setTimeout(() => applyFilter().catch(console.error), delay);
    return;
  }
  applyScheduled = true;
  requestAnimationFrame(() => {
    applyScheduled = false;
    applyFilter().catch(console.error);
  });
}

async function loadTypes(cards) {
  const ids = cards.map(card => card.dataset.detail).filter(Boolean);
  const missing = [...new Set(ids.filter(id => !typeCache.has(id)))];
  if (!missing.length) return;

  const { data, error } = await supabase
    .from('events')
    .select('id,type')
    .in('id', missing);

  if (error) throw error;
  for (const event of data || []) typeCache.set(event.id, event.type);
}

function setMatchActionsVisibility() {
  const box = $('matchActions');
  if (!box) return;
  if (selectedFilter === 'match') {
    box.style.removeProperty('display');
  } else {
    box.style.setProperty('display', 'none', 'important');
  }
}

async function applyFilter() {
  const version = ++applyVersion;
  const host = $('lifecycleHost');
  if (!host) return;

  const cards = [...host.querySelectorAll('.life-card[data-detail]')];

  // Pendant le changement de filtre, on évite d'afficher brièvement le mauvais type.
  if (selectedFilter !== 'all') {
    for (const card of cards) card.style.setProperty('display', 'none', 'important');
  }

  await loadTypes(cards);
  if (version !== applyVersion) return;

  let visibleCount = 0;
  for (const card of cards) {
    const type = typeCache.get(card.dataset.detail);
    const visible = selectedFilter === 'all' || type === selectedFilter;
    if (visible) {
      card.style.removeProperty('display');
      visibleCount++;
    } else {
      card.style.setProperty('display', 'none', 'important');
    }
  }

  setMatchActionsVisibility();

  let empty = $('calendarFilterEmpty');
  if (!empty) {
    empty = document.createElement('div');
    empty.id = 'calendarFilterEmpty';
    empty.className = 'card muted';
    empty.style.cssText = 'padding:24px;text-align:center;display:none';
    host.appendChild(empty);
  }

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
  document.querySelectorAll('#calendar .filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === selectedFilter);
  });
  scheduleApply();
  scheduleApply(120);
  scheduleApply(450);
}

function wireFilters() {
  document.querySelectorAll('#calendar .filter').forEach(btn => {
    if (btn.dataset.realFilterWired) return;
    btn.dataset.realFilterWired = '1';

    // Capture phase: ce gestionnaire devient l'unique source de vérité du filtre.
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectFilter(btn.dataset.filter);
    }, true);
  });
}

function attach() {
  wireFilters();
  const calendar = $('calendar');
  if (!calendar) return;

  if (observer) observer.disconnect();
  observer = new MutationObserver(() => scheduleApply());
  observer.observe(calendar, { childList: true, subtree: true });

  scheduleApply();
}

document.querySelector('[data-view="calendar"]')?.addEventListener('click', () => setTimeout(attach, 180));
$('teamSelect')?.addEventListener('change', () => {
  typeCache.clear();
  setTimeout(attach, 220);
});

setTimeout(attach, 700);
setTimeout(attach, 1500);
