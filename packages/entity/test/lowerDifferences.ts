/**
 * Where today's judge and metakit's reading of the translation answer a
 * predicate over a row differently, each with why. `changes`: the kernel
 * convergence note says the meaning changes, in the section named, and step 5
 * makes it the user's. `open`: the note does not decide it; it is reported
 * for a decision, and pinned here so a change to either side shows.
 */
import type { Answer, Judged } from './lowerHarness.js'

export interface Difference {
  /** The case by its `what`, after the held world's name for a partial one. */
  readonly what: string
  readonly row: string
  /** Which of the case's predicates, by position in `where`. */
  readonly at: number
  readonly entity: Answer | Judged
  readonly metakit: Answer | Judged
  readonly kind: 'changes' | 'open'
  readonly why: string
}

const rows = (
  what: string,
  ids: ReadonlyArray<string>,
  entity: Answer | Judged,
  metakit: Answer | Judged,
  kind: Difference['kind'],
  why: string,
): ReadonlyArray<Difference> => ids.map(row => ({ what, row, at: 0, entity, metakit, kind, why }))

const emptyAmong =
  "SQL's `x in ()` is false whatever x is (SQLite's answer; a Drizzle `inArray` of no values compiles to `false`), and the case pins it. metakit's `eq.among` is null-strict, so a null value gives null before the empty list is looked at."
const nan =
  'The databases part over NaN (SQLite stores it as null, Postgres orders it after every number), so entity refuses it, as metakit refuses arithmetic past the safe range; `ord.*` refuse NaN, `eq.equals` and `eq.among` compare it.'
const givenNul =
  'A NUL given to a comparison makes SQL refuse the statement whatever a row holds; metakit checks a null operand first, or lets `or` absorb the refusal.'
const viewerPath =
  "Entity answers SQL's null as soon as one side of `=` is a held null, whatever is not held beside it; metakit's partial evaluation keeps the call, since an operand not held might be refused, and a refusal comes before null in its order (`Node.applying`)."

export const differences: ReadonlyArray<Difference> = [
  ...rows(
    'add past the safe integer range',
    ['i1', 'i2'],
    'true',
    'refused',
    'changes',
    'Note, "Where do the two languages disagree": arithmetic past 2^53-1 is refused, since SQLite gives a real and Postgres refuses the statement.',
  ),
  ...rows(
    'an implementation reading the collation it is told',
    ['i1', 'i2'],
    'true',
    'false',
    'changes',
    'Note, "How does a collation reach a text operation?": an implementation that read `context.collation` is told none, and is given folded text instead.',
  ),
  ...rows(
    'in against an empty list compared to false matches every row, null or not',
    ['a', 'c'],
    'true',
    'null',
    'open',
    emptyAmong,
  ),
  ...rows('an equality refuses NaN', ['a', 'b', 'c', 'd', 'e'], 'refused', 'false', 'open', nan),
  ...rows('a membership test refuses a list holding NaN', ['a'], 'refused', 'false', 'open', nan),
  ...rows('a membership test refuses a list holding NaN', ['b'], 'refused', 'true', 'open', nan),
  ...rows(
    'a membership test refuses a list holding NaN',
    ['c', 'd', 'e'],
    'refused',
    'false',
    'open',
    nan,
  ),
  ...rows(
    'or beside a contains given text holding NUL',
    ['i1'],
    'refused',
    'true',
    'open',
    givenNul,
  ),
  ...rows(
    'eq given text holding NUL beside a null field',
    ['i3'],
    'refused',
    'null',
    'open',
    givenNul,
  ),
  ...rows(
    'contains of stored text holding NUL, given a null search',
    ['n1'],
    'null',
    'refused',
    'open',
    'A NUL stored in a row meets SQL only beside a value that is not null, so entity answers null; the translation folds the stored text with `str.lowerAscii`, which refuses it, and metakit passes a refusal before a null.',
  ),
  ...rows(
    "no team: a path from the viewer reads their team's name, on the table it judges",
    ['m3'],
    'false',
    'unknown',
    'open',
    viewerPath,
  ),
  ...rows(
    "a team's name and region hidden: a path from the viewer reads their team's name, on the table it judges",
    ['m3', 'm4'],
    'false',
    'unknown',
    'open',
    viewerPath,
  ),
]
