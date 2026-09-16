// Safety guard: an event can only be manually completed on its scheduled day.
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const todayLabel = () => new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date());

function isFutureFinishButton(button) {
  if (button.id === 'homeFinishEvent') {
    const meta = document.getElementById('nextEventMeta')?.textContent || '';
    return !!meta && !meta.includes(todayLabel());
  }
  const card = button.closest('[data-detail], .match-action-card, .life-card, .card');
  const eventId = button.dataset.finish || card?.dataset.detail;
  if (!eventId) return false;
  const lifecycleCard = document.querySelector(`.life-card[data-detail="${CSS.escape(eventId)}"]`);
  const dateText = lifecycleCard?.textContent || card?.textContent || '';
  const fr = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}` > localToday();
  // FlemiCoach cards use the same localized date format as the dashboard.
  if (dateText && !dateText.includes(todayLabel())) return true;
  return false;
}

function protectFutureFinishButtons() {
  document.querySelectorAll('[data-finish], #homeFinishEvent').forEach(button => {
    if (isFutureFinishButton(button)) {
      button.style.display = 'none';
      button.disabled = true;
      button.dataset.futureBlocked = '1';
    } else if (button.dataset.futureBlocked === '1') {
      button.style.display = '';
      button.disabled = false;
      delete button.dataset.futureBlocked;
    }
  });
}

// Hard guard in addition to hiding the button.
document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-finish], #homeFinishEvent');
  if (!button || !isFutureFinishButton(button)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  alert("Tu pourras terminer cet événement le jour où il a lieu.");
}, true);

const observer = new MutationObserver(protectFutureFinishButtons);
observer.observe(document.documentElement, { childList: true, subtree: true });
protectFutureFinishButtons();
setInterval(protectFutureFinishButtons, 1000);
