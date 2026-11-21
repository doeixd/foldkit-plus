/**
 * Where the judge answered a predicate over a row differently before it read
 * metakit's evaluation of the translation (step 5 of the kernel convergence
 * note), each with why: every one is now what a user sees. `before` is the
 * old judge's answer, `now` metakit's, which `lower.test.ts` and
 * `lowerKinds.test.ts` hold the judge to.
 */
import type { Answer, Judged } from './lowerHarness.js'

export interface Difference {
  /** The case by its `what`, after the held world's name for a partial one. */
  readonly what: string
  readonly row: string
  /** Which of the case's predicates, by position in `where`. */
  readonly at: number
  readonly before: Answer | Judged
  readonly now: Answer | Judged
  readonly why: string
}

const rows = (
  what: string,
  ids: ReadonlyArray<string>,
  before: Answer | Judged,
  now: Answer | Judged,
  why: string,
): ReadonlyArray<Difference> => ids.map(row => ({ what, row, at: 0, before, now, why }))

const refusalFirst =
  'A refusal decides before null and is not absorbed (metakit decision of 2026-11-21, "a refusal decides before null"): metakit models one statement, which a database refuses as a whole.'
const notAbsorbed = `${refusalFirst} Partial evaluation drops the operand \`and\` or \`or\` does not need only where it cannot be refused; a related-rows fold is not judged, so over a partly held world metakit leaves open what the old judge decided. (A stored text field cannot be refused, since a write refuses text holding a NUL; the rows over the team's \`name\` match since step 5.)`

export const differences: ReadonlyArray<Difference> = [
  ...rows(
    'add past the safe integer range',
    ['i1', 'i2'],
    'true',
    'refused',
    'Note, "Where do the two languages disagree": arithmetic past 2^53-1 is refused, since SQLite gives a real and Postgres refuses the statement.',
  ),
  ...rows(
    'an implementation reading the collation it is told',
    ['i1', 'i2'],
    'true',
    'false',
    'Note, "How does a collation reach a text operation?": an implementation that read `context.collation` is told none, and is given folded text instead.',
  ),
  ...rows(
    'contains of stored text holding NUL, given a null search',
    ['n1'],
    'null',
    'refused',
    `${refusalFirst} The stored text holding a NUL is refused before the null search makes the call null.`,
  ),
  ...rows(
    'every other row of each table: and joins a path and the negation of an exists',
    ['m3'],
    'false',
    'unknown',
    notAbsorbed,
  ),
  ...rows(
    'no badge, and not every pin: and joins a path and the negation of an exists',
    ['m3', 'm4'],
    'false',
    'unknown',
    notAbsorbed,
  ),
  ...['every other row of each table', 'no badge, and not every pin', 'no link held'].flatMap(
    world =>
      rows(
        `${world}: or holds by either side, an exists or the row's own field`,
        ['m5'],
        'true',
        'unknown',
        notAbsorbed,
      ),
  ),
]
