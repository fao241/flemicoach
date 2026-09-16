// Safety guard: an event can only be manually completed on its scheduled day.
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

function eventDateForFinishButton(button) {
  if (button.id === 'homeFinishEvent') {
    const meta = document.getElementById('nextEventMeta')?.textContent || '';
    const match = meta.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    return null;
  }
  const card = button.closest('[data-detail], .match-action-card, .life-card, .card');
  const eventId = button.dataset.finish || card?.dataset.detail;
  if (!eventId) return null;
  const lifecycleCard = document.querySelector(`.life-card[data-detail="${CSS.escape(eventId)}"]`);
  const dateText = lifecycleCard?.textContent || card?.textContent || '';
  const fr = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  return card?.dataset.eventDate || null;
}

function protectFutureFinishButtons() {
  document.querySelectorAll('[data-finish], #homeFinishEvent').forEach(button => {
    const date = eventDateForFinishButton(button);
    if (date && date > localToday()) {
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

// Hard guard as well as hiding the button: prevents a future event being completed
// even if another script re-renders the button before the observer runs.
document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-finish], #homeFinishEvent');
  if (!button) return;
  const date = eventDateForFinishButton(button);
  if (date && date > localToday()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    alert("Tu pourras terminer cet événement le jour où il a lieu.");
  }
}, true);

const observer = new MutationObserver(protectFutureFinishButtons);
observer.observe(document.documentElement, { childList: true, subtree: true });
protectFutureFinishButtons();
setInterval(protectFutureFinishButtons, 1000);
