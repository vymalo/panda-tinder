import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PANDAS,
  ACTIONS,
  ACCENTS,
  accentFor,
  matchScore,
  buildDeck,
  rng,
  SwipeState,
} from '../src/pandas.js';

test('roster is well formed', () => {
  assert.ok(PANDAS.length >= 8, 'wants at least 8 pandas');
  const ids = new Set();
  for (const p of PANDAS) {
    assert.equal(typeof p.name, 'string');
    assert.ok(p.name.length > 0);
    assert.ok(Number.isInteger(p.age) && p.age > 0);
    assert.ok(Array.isArray(p.likes) && p.likes.length > 0);
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
  }
});

test('every panda resolves to a known accent', () => {
  for (const p of PANDAS) {
    assert.ok(ACCENTS.includes(accentFor(p)), `${p.id} -> ${accentFor(p)}`);
  }
});

test('accentFor falls back to a stable accent from the id', () => {
  const nameless = { id: 'no-accent-here', name: 'X', age: 5, location: '', emoji: '', tagline: '', bio: '', likes: ['a'] };
  const first = accentFor(nameless);
  assert.ok(ACCENTS.includes(first));
  assert.equal(first, accentFor(nameless), 'not stable across calls');
});

test('accentFor ignores an unknown accent and still returns a real one', () => {
  const odd = { id: 'x', name: 'X', age: 5, location: '', emoji: '', tagline: '', bio: '', likes: ['a'], accent: 'chartreuse' };
  assert.ok(ACCENTS.includes(accentFor(odd)));
});

test('the roster uses a spread of accents, not just one', () => {
  const used = new Set(PANDAS.map((p) => accentFor(p)));
  assert.ok(used.size >= 5, `only ${used.size} distinct accents in use`);
});

test('matchScore stays within 0..100 and returns an integer', () => {
  for (const a of PANDAS) {
    for (const b of PANDAS) {
      const score = matchScore(a, b);
      assert.ok(Number.isInteger(score));
      assert.ok(score >= 0 && score <= 100, `${score} out of range`);
    }
  }
});

test('matchScore is symmetric', () => {
  for (const a of PANDAS) {
    for (const b of PANDAS) {
      assert.equal(matchScore(a, b), matchScore(b, a));
    }
  }
});

test('a panda matches itself highest', () => {
  for (const p of PANDAS) {
    for (const other of PANDAS) {
      if (other.id === p.id) continue;
      assert.ok(matchScore(p, p) >= matchScore(p, other));
    }
  }
});

test('identically-interested pandas score full marks', () => {
  const a = { id: 'a', name: 'A', age: 10, location: 'x', emoji: '🐼', tagline: '', bio: '', likes: ['bamboo', 'napping'] };
  const b = { ...a, id: 'b', name: 'B' };
  assert.equal(matchScore(a, b), 100);
});

test('a wide age gap lowers the score', () => {
  const likes = ['bamboo', 'napping', 'eating'];
  const young = { id: 'y', name: 'Y', age: 3, location: 'x', emoji: '🐼', tagline: '', bio: '', likes };
  const old = { id: 'o', name: 'O', age: 23, location: 'x', emoji: '🐼', tagline: '', bio: '', likes };
  assert.ok(matchScore(young, old) < 100);
  assert.ok(matchScore(young, old) > 0);
});

test('rng is deterministic for a seed and stays in [0,1)', () => {
  const a = rng(42);
  const b = rng(42);
  for (let i = 0; i < 50; i += 1) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
});

test('buildDeck is deterministic for a seed', () => {
  assert.deepEqual(
    buildDeck(PANDAS, 7).map((p) => p.id),
    buildDeck(PANDAS, 7).map((p) => p.id)
  );
});

test('buildDeck keeps every panda exactly once and does not mutate the input', () => {
  const original = PANDAS.map((p) => p.id);
  const deck = buildDeck(PANDAS, 3);
  assert.equal(deck.length, PANDAS.length);
  assert.deepEqual([...deck.map((p) => p.id)].sort(), [...original].sort());
  assert.deepEqual(PANDAS.map((p) => p.id), original, 'input was mutated');
});

test('ACTIONS lists exactly like and pass', () => {
  assert.deepEqual(ACTIONS, ['like', 'pass']);
});

test('swiping walks the whole deck and records both buckets', () => {
  const state = new SwipeState(buildDeck(PANDAS, 5));
  const total = state.deck.length;
  let seen = 0;
  while (!state.done) {
    const panda = state.swipe(seen % 2 === 0 ? 'like' : 'pass');
    assert.ok(panda.id);
    seen += 1;
  }
  assert.equal(seen, total);
  assert.equal(state.liked.length + state.passed.length, total);
  assert.equal(state.remaining, 0);
  assert.equal(state.current, null);
});

test('swiping past the end throws', () => {
  const state = new SwipeState(buildDeck(PANDAS, 5));
  while (!state.done) state.swipe('like');
  assert.throws(() => state.swipe('like'), /finished/);
});

test('an unknown action throws and does not advance', () => {
  const state = new SwipeState(buildDeck(PANDAS, 5));
  const before = state.index;
  assert.throws(() => state.swipe('super-like'), /Unknown action/);
  assert.equal(state.index, before);
  assert.equal(state.liked.length, 0);
});

test('matches returns only liked pandas, best first', () => {
  const state = new SwipeState(buildDeck(PANDAS, 9));
  const likedIds = [];
  while (!state.done) {
    if (state.index % 3 === 0) {
      state.swipe('like');
      likedIds.push(state.deck[state.index - 1].id);
    } else {
      state.swipe('pass');
    }
  }
  const matches = state.matches();
  assert.equal(matches.length, likedIds.length);
  assert.deepEqual([...matches.map((m) => m.panda.id)].sort(), [...likedIds].sort());

  for (let i = 1; i < matches.length; i += 1) {
    assert.ok(matches[i - 1].score >= matches[i].score, 'not sorted by score');
  }

  for (const m of matches) {
    assert.ok(m.score >= 0 && m.score <= 100);
  }
});

test('reset shuffles again and clears the buckets', () => {
  const state = new SwipeState(buildDeck(PANDAS, 5));
  state.swipe('like');
  state.swipe('pass');
  state.reset(11);
  assert.equal(state.index, 0);
  assert.deepEqual(state.liked, []);
  assert.deepEqual(state.passed, []);
  assert.equal(state.deck.length, PANDAS.length);
});
