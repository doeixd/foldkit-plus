/**
 * What a new sandbox starts with: four people, a timeline, and some likes.
 * Ada is the one admin (`server.ts`); you are signed in as `you` unless the
 * address names someone else (`?as=ada`).
 */

/** Who can sign in to the demo, by id. */
export const PEOPLE = ['you', 'ada', 'grace', 'linus'] as const
export type Person = (typeof PEOPLE)[number]

// Ten minutes apart, the newest first, at a fixed moment in the past: a reset gives
// the same timeline every time, and anything posted since sorts above it.
const at = (minutesAgo: number) => Date.UTC(2026, 0, 1, 12, 0) - minutesAgo * 60_000

const posts: ReadonlyArray<readonly [string, Person, string]> = [
  ['p1', 'ada', 'The engine weaves algebraic patterns as the loom weaves flowers.'],
  ['p2', 'grace', 'A ship in port is safe, but that is not what ships are built for.'],
  ['p3', 'linus', 'One Model. One Message union. One update. Everything else is a view of it.'],
  ['p4', 'you', 'Hello, Chirp! My first post.'],
  [
    'p5',
    'ada',
    'Rename a user once and every post shows it: the author is a reference, not a copy.',
  ],
  [
    'p6',
    'grace',
    "It's easier to ask forgiveness than permission. Unless you're editing someone else's post.",
  ],
]

const quote = (text: string) => `'${text.replaceAll("'", "''")}'`

export const SEED = `
  insert into users values
    ('you', 'you', 'You'),
    ('ada', 'ada', 'Ada Lovelace'),
    ('grace', 'grace', 'Grace Hopper'),
    ('linus', 'lkay', 'Linus Kay');
  insert into posts values
    ${posts.map(([id, author, body], i) => `(${quote(id)}, ${quote(author)}, ${quote(body)}, ${at(i * 10)})`).join(',\n    ')};
  insert into likes values
    ('p1', 'grace'), ('p1', 'linus'), ('p1', 'you'),
    ('p2', 'ada'), ('p2', 'linus'),
    ('p3', 'ada'), ('p3', 'grace'), ('p3', 'you'),
    ('p5', 'grace');
`
