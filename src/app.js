// Rendering, gestures and storage. All logic lives in pandas.js.
import { PANDAS, SwipeState, buildDeck, matchScore, accentFor } from './pandas.js';

const STORAGE_KEY = 'panda-tinder-v1';
const SWIPE_THRESHOLD = 110;

const els = {
  deck: document.getElementById('deck'),
  controls: document.getElementById('controls'),
  donePanel: document.getElementById('done-panel'),
  doneSummary: document.getElementById('done-summary'),
  reset: document.getElementById('reset'),
  resetMatches: document.getElementById('reset-matches'),
  like: document.getElementById('like'),
  pass: document.getElementById('pass'),
  matchList: document.getElementById('match-list'),
  noMatches: document.getElementById('no-matches'),
  matchCount: document.getElementById('match-count'),
  tabs: Array.from(document.querySelectorAll('.tab')),
  views: Array.from(document.querySelectorAll('.view')),
};

/** Persist the swipe state. localStorage can throw in private modes, so guard it. */
function save(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        seed: state.seed ?? 1,
        index: state.index,
        liked: state.liked,
        passed: state.passed,
      })
    );
  } catch {
    /* storage unavailable: the app still works, it just won't remember */
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.liked) || typeof data.index !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/** Rebuild a SwipeState from saved data, ignoring ids no longer in the roster. */
function stateFromSaved(saved) {
  const deck = buildDeck(PANDAS, saved.seed ?? 1);
  const state = new SwipeState(deck);
  const known = new Set(PANDAS.map((p) => p.id));
  state.liked = saved.liked.filter((id) => known.has(id));
  state.passed = (saved.passed ?? []).filter((id) => known.has(id));
  state.index = Math.min(saved.index, deck.length);
  state.seed = saved.seed ?? 1;
  return state;
}

function freshState(seed) {
  const state = new SwipeState(buildDeck(PANDAS, seed));
  state.seed = seed;
  return state;
}

let state = (() => {
  const saved = load();
  return saved ? stateFromSaved(saved) : freshState(1);
})();

/* ---------------- card rendering ---------------- */

function cardMarkup(panda, { top }) {
  const likes = panda.likes.map((l) => `<li>#${l}</li>`).join('');
  const accent = accentFor(panda);
  return `
    <article class="card${top ? ' is-top' : ' card-behind'}" data-id="${panda.id}" data-accent="${accent}">
      <div class="stamp stamp-like">LIKE</div>
      <div class="stamp stamp-pass">NOPE</div>
      <div class="card-art">${panda.emoji}</div>
      <div class="card-body">
        <h2 class="card-name">${panda.name} <span class="card-age">${panda.age}</span></h2>
        <p class="card-location">📍 ${panda.location}</p>
        <p class="card-tagline">“${panda.tagline}”</p>
        <p class="card-bio">${panda.bio}</p>
        <ul class="likes">${likes}</ul>
      </div>
    </article>`;
}

/** Give the element the CSS variable its accent class expects. */
function tint(el, accent) {
  el.style.setProperty('--accent', `var(--${accent})`);
}

/** Draw the next two cards; the top one carries the drag handlers. */
function renderDeck() {
  const upcoming = state.deck.slice(state.index, state.index + 2);
  els.deck.innerHTML = upcoming
    .map((p, i) => cardMarkup(p, { top: i === 0 }))
    .reverse()
    .join('');

  for (const card of els.deck.querySelectorAll('.card')) {
    tint(card, card.dataset.accent);
  }

  const top = els.deck.querySelector('.card.is-top');
  if (top) attachDrag(top);

  const finished = state.done;
  els.controls.hidden = finished;
  els.donePanel.hidden = !finished;
  if (finished) {
    els.doneSummary.textContent = `You passed on ${state.passed.length} and liked ${state.liked.length}. ${state.liked.length} waiting in Matches.`;
  }
  els.like.disabled = finished;
  els.pass.disabled = finished;
}

/* ---------------- gestures ---------------- */

function attachDrag(card) {
  const likeStamp = card.querySelector('.stamp-like');
  const passStamp = card.querySelector('.stamp-pass');
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dragging = false;

  const move = (event) => {
    const point = event.touches ? event.touches[0] : event;
    dx = point.clientX - startX;
    const dy = point.clientY - startY;
    card.classList.add('dragging');
    card.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${dx / 22}deg)`;

    const p = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
    likeStamp.style.opacity = dx > 0 ? p : 0;
    passStamp.style.opacity = dx < 0 ? p : 0;
  };

  const end = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    if (!dragging) return;
    dragging = false;
    card.classList.remove('dragging');

    if (dx > SWIPE_THRESHOLD) {
      commit('like', 'fly-right');
    } else if (dx < -SWIPE_THRESHOLD) {
      commit('pass', 'fly-left');
    } else {
      card.classList.add('settling');
      card.style.transform = '';
      likeStamp.style.opacity = 0;
      passStamp.style.opacity = 0;
      setTimeout(() => card.classList.remove('settling'), 300);
    }
  };

  card.addEventListener('pointerdown', (event) => {
    if (state.done) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    dx = 0;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  });
}

/** Animate the top card away, then advance the state. */
function commit(action, flyClass) {
  const card = els.deck.querySelector('.card.is-top');
  if (!card) return;
  card.classList.add('settling', flyClass);
  setTimeout(() => {
    state.swipe(action);
    save(state);
    renderDeck();
    renderMatches();
  }, 200);
}

/* ---------------- matches ---------------- */

function renderMatches() {
  const matches = state.matches();

  els.matchCount.hidden = matches.length === 0;
  els.matchCount.textContent = String(matches.length);

  els.noMatches.hidden = matches.length > 0;
  els.matchList.innerHTML = matches
    .map(
      ({ panda, score }) => `
      <li class="match" data-accent="${accentFor(panda)}">
        <div class="match-emoji">${panda.emoji}</div>
        <div>
          <h3 class="match-name">${panda.name}, ${panda.age}</h3>
          <p class="match-meta">${panda.location} · ${panda.tagline}</p>
        </div>
        <div class="match-score"><b>${score}%</b><span>match</span></div>
      </li>`
    )
    .join('');

  for (const row of els.matchList.querySelectorAll('.match')) {
    tint(row, row.dataset.accent);
  }
}

/* ---------------- views and wiring ---------------- */

function showView(name) {
  for (const tab of els.tabs) {
    tab.classList.toggle('is-active', tab.dataset.view === name);
  }
  for (const view of els.views) {
    view.classList.toggle('is-active', view.id === `view-${name}`);
  }
  if (name === 'matches') renderMatches();
}

for (const tab of els.tabs) {
  tab.addEventListener('click', () => showView(tab.dataset.view));
}

els.like.addEventListener('click', () => commit('like', 'fly-right'));
els.pass.addEventListener('click', () => commit('pass', 'fly-left'));

function resetDeck() {
  state = freshState(Math.floor(Math.random() * 1e9));
  save(state);
  renderDeck();
  renderMatches();
  showView('swipe');
}

els.reset.addEventListener('click', resetDeck);
els.resetMatches.addEventListener('click', resetDeck);

window.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    commit('like', 'fly-right');
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    commit('pass', 'fly-left');
  }
});

// Expose a little state for manual poking in the console.
window.pandaTinder = { get state() { return state; }, matchScore, PANDAS };

renderDeck();
renderMatches();
