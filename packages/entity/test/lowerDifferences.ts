/**
 * Where today's judge and metakit's reading of the translation answer a
 * predicate over a row differently, each with why. `expected`: a decision
 * says the meaning changes (the kernel convergence note, or a decision on
 * metakit's meaning since), and step 5 makes it the user's. `uncovered`: no
 * decision covers it yet; the test holds this kind to none.
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
  readonly kind: 'expected' | 'uncovered'
  readonly why: string
}

const rows = (
  what: string,
  ids: ReadonlyArray<string>,
  entity: Answer | Judged,
  metakit: Answer | Judged,
  why: string,
): ReadonlyArray<Difference> =>
  ids.map(row => ({ what, row, at: 0, entity, metakit, kind: 'expected', why }))

const refusalFirst =
  'A refusal decides before null and is not absorbed (metakit decision of 2026-11-21, "a refusal decides before null"): metakit models one statement, which a database refuses as a whole.'
const notAbsorbed = `${refusalFirst} Partial evaluation drops the operand \`and\` or \`or\` does not need only where its Schemas say it cannot be refused; a text field of plain \`Schema.String\` may hold a NUL, a \`Schema.Number\` NaN, and a related-rows fold is not judged, so over a partly held world metakit leaves open what today's judge decides.`
const viewerPath = `Entity answers SQL's null as soon as one side of \`=\` is a held null; metakit folds a strict call beside a known null only where every other operand cannot be refused by its Schema (metakit decision of 2026-11-21, "partial evaluation keeps its precision through a type check"). The team's \`name\` is plain \`Schema.String\`, which may hold a NUL; declared \`Text.schema\` from \`metakit/domain\`, the rows match.`

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
    "no team: a path from the viewer reads their team's name, on the table it judges",
    ['m3'],
    'false',
    'unknown',
    viewerPath,
  ),
  ...rows(
    "a team's name and region hidden: a path from the viewer reads their team's name, on the table it judges",
    ['m3', 'm4'],
    'false',
    'unknown',
    viewerPath,
  ),
  ...rows(
    'no team: and joins a path and the negation of an exists',
    ['m1', 'm2', 'm4'],
    'false',
    'unknown',
    notAbsorbed,
  ),
  ...rows(
    "a team's name and region hidden: and joins a path and the negation of an exists",
    ['m1', 'm2'],
    'false',
    'unknown',
    notAbsorbed,
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
