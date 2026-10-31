/**
 * Every disagreement the suite finds today, by case, with where it comes
 * from. A case not listed agrees everywhere. An entry that stops appearing
 * fails the suite too: remove it, since what it recorded was fixed.
 */
import type { Disagreement } from './harness.js'

export interface Known {
  readonly drawer: string
  readonly step: number
  readonly aspect: Disagreement['aspect']
}

interface Recorded {
  /** Where the disagreement lives, and what tracks it. */
  readonly because: string
  readonly found: ReadonlyArray<Known>
}

export const known: Readonly<Record<string, Recorded>> = {
  'table rows outside a tbody': {
    because:
      'Foldkit: `renderToString` refuses a view whose markup a parser would build differently (a parser inserts the tbody); the runtime and Scene draw it as written. By design.',
    found: [
      { drawer: 'server', step: 0, aspect: 'markup' },
      { drawer: 'server', step: 1, aspect: 'markup' },
    ],
  },
  'keyed list with Mounts': {
    because:
      'Foldkit: Scene does not model keys. It tracks a Mount by name and position, so dropping the first keyed row ends the last row’s Mount, and a row added at the front starts the Mount of a row that was already there.',
    found: [
      { drawer: 'scene', step: 1, aspect: 'mounts' },
      { drawer: 'scene', step: 3, aspect: 'messages' },
      { drawer: 'scene', step: 3, aspect: 'mounts' },
    ],
  },
}
