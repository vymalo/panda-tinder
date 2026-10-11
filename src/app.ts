// Rendering, gestures and storage. All logic lives in pandas.ts.
import {
  type Accent,
  accentFor,
  buildDeck,
  matchScore,
  PANDAS,
  type Panda,
  type SwipeAction,
  SwipeState,
} from './pandas.js';

const STORAGE_KEY = 'panda-tinder-v2';
const SWIPE_THRESHOLD = 110;

interface SavedState {
  seed: number;
  index: number;
  liked: string[];
  passed: string[];
}

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

const els = {
  deck: must<HTMLElement>('#deck'),
  controls: must<HTMLElement>('#controls'),
  donePanel: must<HTMLElement>('#done-panel'),
  doneSummary: must<HTMLElement>('#done-summary'),
  reset: must<HTMLButtonElement>('#reset'),
  resetMatches: must<HTMLButtonElement>('#reset-matches'),
  like: must<HTMLButtonElement>('#like'),
  pass: must<HTMLButtonElement>('#pass'),
  matchList: must<HTMLUListElement>('#match-list'),
  noMatches: must<HTMLElement>('#no-matches'),
  matchCount: must<HTMLElement>('#match-count'),
  tabs: Array.from(document.querySelectorAll<HTMLButtonElement>('.tab')),
  views: Array.from(document.querySelectorAll<HTMLElement>('.view')),
};

/** Persist the swipe state. localStorage throws in some private modes. */
function save(state: SwipeState): void {
  try {
    const data: SavedState = {
      seed: state.seed,
      index: state.index,
      liked: state.liked,
      passed: state.passed,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable: the app still works, it just will not remember.
  }
}

function isSavedState(value: unknown): value is SavedState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<SavedState>;
  return (
    typeof v.index === 'number' &&
    typeof v.seed === 'number' &&
    Array.isArray(v.liked) &&
    Array.isArray(v.passed)
  );
}

function load(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    return isSavedState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Rebuild state from saved data, ignoring ids no longer in the roster. */
function stateFromSaved(saved: SavedState): SwipeState {
  const deck = buildDeck(PANDAS, saved.seed);
  const state = new SwipeState(deck, saved.seed);

  const known = new Set(PANDAS.map((p) => p.id));
  state.liked = saved.liked.filter((id) => known.has(id));
  state.passed = saved.passed.filter((id) => known.has(id));
  state.index = Math.min(saved.index, deck.length);

  return state;
}

function freshState(seed: number): SwipeState {
  return new SwipeState(buildDeck(PANDAS, seed), seed);
}

let state: SwipeState = (() => {
  const saved = load();
  return saved ? stateFromSaved(saved) : freshState(1);
})();

/* ---------------- card rendering ---------------- */

function cardMarkup(panda: Panda, top: boolean): string {
  const likes = panda.likes.map((l) => `<li class="pd-chip">#${l}</li>`).join('');
  const accent = accentFor(panda);

  return `
    <article
      class="pd-card ${top ? 'is-top' : 'pd-card-behind'}"
      data-id="${panda.id}"
      data-accent="${accent}"
    >
      <div class="pd-stamp pd-stamp-like">LIKE</div>
      <div class="pd-stamp pd-stamp-pass">NOPE</div>
      <div class="pd-art">${panda.emoji}</div>
      <div class="pd-body">
        <h2 class="pd-name">${panda.name} <span class="pd-age">${panda.age}</span></h2>
        <p class="pd-location">📍 ${panda.location}</p>
        <p class="pd-tagline">“${panda.tagline}”</p>
        <p class="pd-bio">${panda.bio}</p>
        <ul class="pd-likes">${likes}</ul>
      </div>
    </article>`;
}

/** Give the element the CSS variable its accent utility expects. */
function tint(el: HTMLElement, accent: Accent): void {
  el.style.setProperty('--accent', `var(--color-${accent})`);
}

/** Draw the next two cards; the top one carries the drag handlers. */
function renderDeck(): void {
  const upcoming = state.deck.slice(state.index, state.index + 2);

  els.deck.innerHTML = upcoming
    .map((panda, i) => cardMarkup(panda, i === 0))
    .reverse()
    .join('');

  for (const card of els.deck.querySelectorAll<HTMLElement>('.pd-card')) {
    const accent = card.dataset.accent;
    if (accent) tint(card, accent as Accent);
  }

  const top = els.deck.querySelector<HTMLElement>('.pd-card.is-top');
  if (top) attachDrag(top);

  const finished = state.done;
  els.controls.hidden = finished;
  els.donePanel.hidden = !finished;

  if (finished) {
    els.doneSummary.textContent =
      `You passed on ${state.passed.length} and liked ${state.liked.length}. ` +
      `${state.liked.length} waiting in Matches.`;
  }

  els.like.disabled = finished;
  els.pass.disabled = finished;
}

/* ---------------- gestures ---------------- */

function attachDrag(card: HTMLElement): void {
  const likeStamp = card.querySelector<HTMLElement>('.pd-stamp-like');
  const passStamp = card.querySelector<HTMLElement>('.pd-stamp-pass');

  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dragging = false;

  const move = (event: PointerEvent): void => {
    dx = event.clientX - startX;
    const dy = event.clientY - startY;

    card.classList.add('dragging');
    card.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${dx / 22}deg)`;

    const progress = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
    if (likeStamp) likeStamp.style.opacity = String(dx > 0 ? progress : 0);
    if (passStamp) passStamp.style.opacity = String(dx < 0 ? progress : 0);
  };

  const end = (): void => {
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
      if (likeStamp) likeStamp.style.opacity = '0';
      if (passStamp) passStamp.style.opacity = '0';
      setTimeout(() => card.classList.remove('settling'), 300);
    }
  };

  card.addEventListener('pointerdown', (event: PointerEvent) => {
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
function commit(action: SwipeAction, flyClass: string): void {
  const card = els.deck.querySelector<HTMLElement>('.pd-card.is-top');
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

function renderMatches(): void {
  const matches = state.matches();

  els.matchCount.hidden = matches.length === 0;
  els.matchCount.textContent = String(matches.length);

  els.noMatches.hidden = matches.length > 0;

  els.matchList.innerHTML = matches
    .map(
      ({ panda, score }) => `
      <li class="pd-match" data-accent="${accentFor(panda)}">
        <div class="pd-match-emoji">${panda.emoji}</div>
        <div>
          <h3 class="pd-match-name">${panda.name}, ${panda.age}</h3>
          <p class="pd-match-meta">${panda.location} · ${panda.tagline}</p>
        </div>
        <div class="pd-match-score"><b>${score}%</b><span>match</span></div>
      </li>`,
    )
    .join('');

  for (const row of els.matchList.querySelectorAll<HTMLElement>('.pd-match')) {
    const accent = row.dataset.accent;
    if (accent) tint(row, accent as Accent);
  }
}

/* ---------------- views and wiring ---------------- */

function showView(name: string): void {
  for (const tab of els.tabs) {
    tab.classList.toggle('is-active', tab.dataset.view === name);
  }
  for (const view of els.views) {
    view.classList.toggle('is-active', view.id === `view-${name}`);
  }
  if (name === 'matches') renderMatches();
}

for (const tab of els.tabs) {
  tab.addEventListener('click', () => showView(tab.dataset.view ?? 'swipe'));
}

els.like.addEventListener('click', () => commit('like', 'fly-right'));
els.pass.addEventListener('click', () => commit('pass', 'fly-left'));

function resetDeck(): void {
  state = freshState(Math.floor(Math.random() * 1e9));
  save(state);
  renderDeck();
  renderMatches();
  showView('swipe');
}

els.reset.addEventListener('click', resetDeck);
els.resetMatches.addEventListener('click', resetDeck);

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    commit('like', 'fly-right');
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    commit('pass', 'fly-left');
  }
});

// A little state for poking at in the console.
declare global {
  interface Window {
    pandaTinder: {
      readonly state: SwipeState;
      readonly pandas: readonly Panda[];
      matchScore: typeof matchScore;
    };
  }
}

window.pandaTinder = {
  get state() {
    return state;
  },
  pandas: PANDAS,
  matchScore,
};

renderDeck();
renderMatches();
