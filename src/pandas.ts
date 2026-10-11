// The panda roster and the pure logic behind the deck: match scoring, a seeded
// shuffle, and the swipe state machine. No DOM, no storage here.

export interface Panda {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly location: string;
  readonly emoji: string;
  readonly tagline: string;
  readonly bio: string;
  readonly likes: readonly string[];
  /** One of the palette keys; `accentFor` falls back to a hashed one. */
  readonly accent?: Accent;
}

export type SwipeAction = 'like' | 'pass';

export interface Match {
  readonly panda: Panda;
  readonly score: number;
}

/** The palette keys the stylesheet knows about. */
export const ACCENTS = ['mint', 'violet', 'sky', 'amber', 'coral', 'teal', 'lime', 'pink'] as const;

export type Accent = (typeof ACCENTS)[number];

export const ACTIONS: readonly SwipeAction[] = ['like', 'pass'];

export const PANDAS: readonly Panda[] = [
  {
    id: 'bamboo-bae',
    name: 'Bamboo Bae',
    age: 7,
    location: 'Chengdu, Sichuan',
    emoji: '🐼🎍',
    accent: 'mint',
    tagline: 'Bamboo is not a snack. Bamboo is a lifestyle.',
    bio: 'I eat for 14 hours a day and I will not be apologising for it. Looking for someone who can keep up at the buffet and still want to climb a tree afterwards.',
    likes: ['bamboo', 'napping', 'tree climbing', 'eating'],
  },
  {
    id: 'kung-fu-ling',
    name: 'Kung Fu Ling',
    age: 11,
    location: 'Wolong Reserve',
    emoji: '🐼🥋',
    accent: 'violet',
    tagline: 'I know kung fu. Mostly the rolling-down-a-hill part.',
    bio: 'Discipline, focus, and a deep commitment to the afternoon nap. I will teach you the ancient art of falling over gracefully.',
    likes: ['martial arts', 'bamboo', 'discipline', 'napping'],
  },
  {
    id: 'mister-nap',
    name: 'Mister Nap',
    age: 9,
    location: 'Beijing Zoo',
    emoji: '🐼😴',
    accent: 'sky',
    tagline: 'Professional sleeper. Amateur everything else.',
    bio: 'Roughly 20 hours a day horizontal. The other four are for eating and looking at you adoringly. Bring a pillow.',
    likes: ['napping', 'eating', 'cuddling', 'bamboo'],
  },
  {
    id: 'nutmeg',
    name: 'Nutmeg',
    age: 5,
    location: 'Chengdu, Sichuan',
    emoji: '🦊🎋',
    accent: 'amber',
    tagline: 'I am a red panda. I will be taking no further questions.',
    bio: 'Smaller, faster, and frankly better dressed than the giant pandas. I have a tail and I intend to use it.',
    likes: ['tree climbing', 'berries', 'napping', 'mischief'],
  },
  {
    id: 'bamboo-jiu',
    name: 'Bamboo Jiu',
    age: 12,
    location: 'Xi\u2019an',
    emoji: '🐼🍜',
    accent: 'coral',
    tagline: 'I put bamboo in everything. Yes, even that.',
    bio: 'Experimental chef with a soup dumpling obsession and a strict one-hour nap policy between courses.',
    likes: ['eating', 'bamboo', 'cooking', 'napping'],
  },
  {
    id: 'cloud-hugger',
    name: 'Cloud Hugger',
    age: 6,
    location: 'Qinling Mountains',
    emoji: '🐼☁️',
    accent: 'sky',
    tagline: 'Tall trees, longer naps, softest hugs.',
    bio: 'I live at altitude because the clouds are friendlier up here. Looking for a climbing partner with good grip and better vibes.',
    likes: ['tree climbing', 'cuddling', 'napping', 'clouds'],
  },
  {
    id: 'bamboo-grandpa',
    name: 'Bamboo Grandpa',
    age: 23,
    location: 'Chengdu, Sichuan',
    emoji: '🐼👴',
    accent: 'teal',
    tagline: 'I have been napping since before you were born.',
    bio: 'Thirty years of bamboo expertise and strong opinions about the perfect sunbeam. Slow walks, long stories, great snacks.',
    likes: ['napping', 'bamboo', 'eating', 'sunbeams'],
  },
  {
    id: 'sprout',
    name: 'Sprout',
    age: 3,
    location: 'Wolong Reserve',
    emoji: '🐼🌱',
    accent: 'lime',
    tagline: 'Small, loud, extremely fast.',
    bio: 'Recently out of the nursery and I have not stopped moving since. Teach me things. Bring snacks. Must love chaos.',
    likes: ['mischief', 'tree climbing', 'eating', 'berries'],
  },
];

function isAccent(value: unknown): value is Accent {
  return typeof value === 'string' && (ACCENTS as readonly string[]).includes(value);
}

/**
 * The accent for a panda: its own, or a stable one derived from its id, so a
 * panda added without an accent still gets a colour rather than none.
 */
export function accentFor(panda: Panda): Accent {
  if (isAccent(panda.accent)) return panda.accent;

  let hash = 0;
  for (const ch of panda.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

  // ACCENTS is non-empty, so the index is always in range; the assertion keeps
  // noUncheckedIndexedAccess happy without widening the return type.
  return ACCENTS[hash % ACCENTS.length] as Accent;
}

/**
 * Score how well two pandas get on, 0..100. The Jaccard overlap of their likes,
 * minus a penalty for a wide age gap. Deterministic and symmetric.
 */
export function matchScore(a: Panda, b: Panda): number {
  const setA = new Set(a.likes);
  const setB = new Set(b.likes);

  let shared = 0;
  for (const like of setA) {
    if (setB.has(like)) shared += 1;
  }

  const union = new Set([...setA, ...setB]).size;
  const overlap = union === 0 ? 0 : shared / union;

  const ageGap = Math.abs(a.age - b.age);
  const agePenalty = Math.min(ageGap / 40, 0.35);

  const raw = (overlap - agePenalty) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** A small deterministic PRNG (mulberry32), so shuffles are reproducible in tests. */
export function rng(seed: number): () => number {
  let t = seed >>> 0;
  return function next(): number {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shuffle a copy of the roster with a seeded PRNG (Fisher-Yates). */
export function buildDeck(list: readonly Panda[] = PANDAS, seed = 1): Panda[] {
  const deck = list.slice();
  const random = rng(seed);

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = deck[i] as Panda;
    const b = deck[j] as Panda;
    deck[i] = b;
    deck[j] = a;
  }

  return deck;
}

/** The swipe state machine: a deck, a cursor, and the likes collected so far. */
export class SwipeState {
  deck: Panda[];
  index = 0;
  liked: string[] = [];
  passed: string[] = [];
  seed: number;

  constructor(deck: Panda[] = buildDeck(), seed = 1) {
    this.deck = deck;
    this.seed = seed;
  }

  /** The panda currently on top, or null when the deck is exhausted. */
  get current(): Panda | null {
    return this.deck[this.index] ?? null;
  }

  get done(): boolean {
    return this.index >= this.deck.length;
  }

  get remaining(): number {
    return Math.max(0, this.deck.length - this.index);
  }

  /**
   * Swipe the current panda right (like) or left (pass).
   * @throws when the deck is finished or the action is unknown
   */
  swipe(action: SwipeAction): Panda {
    if (!ACTIONS.includes(action)) {
      throw new Error(`Unknown action: ${String(action)}`);
    }

    const panda = this.current;
    if (!panda) {
      throw new Error('The deck is finished');
    }

    if (action === 'like') {
      this.liked.push(panda.id);
    } else {
      this.passed.push(panda.id);
    }

    this.index += 1;
    return panda;
  }

  /**
   * The liked pandas, best match first, each scored against the other liked
   * pandas; against the whole roster when only one has been liked.
   */
  matches(): Match[] {
    const liked = this.deck.filter((p) => this.liked.includes(p.id));
    const others = liked.length > 1 ? liked : this.deck;

    return liked
      .map((panda): Match => {
        const peers = others.filter((other) => other.id !== panda.id);
        const total = peers.reduce((sum, peer) => sum + matchScore(panda, peer), 0);
        const score = peers.length === 0 ? 100 : Math.round(total / peers.length);
        return { panda, score };
      })
      .sort((x, y) => y.score - x.score || x.panda.name.localeCompare(y.panda.name));
  }

  /** Start over from a fresh shuffled deck. */
  reset(seed: number = Date.now()): void {
    this.deck = buildDeck(PANDAS, seed);
    this.index = 0;
    this.liked = [];
    this.passed = [];
    this.seed = seed;
  }
}
