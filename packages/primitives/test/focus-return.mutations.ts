/**
 * An overlay's focus return when its opener is gone, broken in turn:
 * `pnpm mutate packages/primitives/test/focus-return.mutations.ts`.
 */
const source = '../src/dom/focus-return.ts'
const way = '../src/dom/focus-way.ts'
const recovery = '../src/dom/focus-recovery.ts'
const stack = '../src/dom/layer-stack.ts'
const scope = '../src/dom/focus-scope.ts'
const tests = [
  'packages/primitives/test/focus-return.browser.test.ts',
  'packages/mixins-ui/test/audit/dialog-nesting.browser.test.ts',
]

export default [
  {
    name: 'a redrawn opener is not found by its id',
    edits: [
      {
        file: way,
        find: "opener === undefined || opener.id === '' ? null : doc.getElementById(opener.id)",
        replace: 'null',
      },
    ],
    tests,
  },
  {
    name: "the opener's owner is not asked for its fallback",
    edits: [
      {
        file: way,
        find: 'if (recovery?.() === true) return',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the owner has no fallbacks registered, so every opener falls through',
    edits: [{ file: recovery, find: '          fallbacks.set(element, fallback)\n', replace: '' }],
    tests,
  },
  {
    name: 'the layer below is not tried',
    edits: [
      { file: way, find: '  if (below !== undefined) {', replace: '  if (false as boolean) {' },
    ],
    tests,
  },
  {
    name: 'the page is not the last resort',
    edits: [
      {
        file: way,
        find: 'take(tabbableWithin(doc.body).find(each => !overlay.contains(each)))',
        replace: 'take(undefined)',
      },
    ],
    tests,
  },
  {
    name: 'the opener is read from the active element alone, after focus moved in',
    edits: [
      {
        file: source,
        find: '    activeOutside(overlay) ??\n    trail',
        replace: '    activeOutside(overlay) ??\n    []',
      },
    ],
    tests,
  },
  {
    name: 'FocusReturn acts although the user moved focus elsewhere',
    edits: [
      {
        file: source,
        find: 'if (lostIn(element) && !backToOpener(way)) fallBack(element, way, below)',
        replace: 'if (!backToOpener(way)) fallBack(element, way, below)',
      },
    ],
    tests,
  },
  {
    name: 'the layer below is read after the overlay left the stack',
    edits: [
      {
        file: source,
        find: '            const below = LayerStack.below(element)\n            release()',
        replace: '            release()\n            const below = LayerStack.below(element)',
      },
    ],
    tests,
  },
  {
    name: 'a layer reads the one above it as its lower neighbour',
    edits: [{ file: stack, find: 'layers[at - 1]?.element', replace: 'layers[at + 1]?.element' }],
    tests,
  },
  {
    name: 'FocusScope does not give focus back',
    edits: [
      {
        file: scope,
        find: '            if (!restore || backToOpener(way)) return',
        replace: '            return',
      },
    ],
    tests,
  },
  {
    name: 'FocusScope replaces a gone opener although the user moved focus on',
    edits: [
      {
        file: scope,
        find: 'if (way.opener !== undefined && lostIn(element)) fallBack',
        replace: 'if (way.opener !== undefined) fallBack',
      },
    ],
    tests,
  },
  {
    name: 'FocusScope opened with focus on nothing still falls back',
    edits: [
      {
        file: scope,
        find: 'if (way.opener !== undefined && lostIn(element)) fallBack',
        replace: 'if (lostIn(element)) fallBack',
      },
    ],
    tests,
  },
  {
    name: 'FocusScope takes its opener from the focus trail',
    edits: [
      {
        file: scope,
        find: 'const way = returnOf(activeOutside(element))',
        replace: 'const way = returnOf(openerOf(element))',
      },
      {
        file: scope,
        find: "import * as LayerStack from './layer-stack.js'",
        replace:
          "import * as LayerStack from './layer-stack.js'\nimport { openerOf } from './focus-return.js'",
      },
    ],
    tests,
  },
  {
    name: "a frame's document is never followed",
    edits: [
      {
        file: source,
        find: 'const trail = follow(overlay.ownerDocument)',
        replace: 'const trail = follow(document)',
      },
    ],
    tests,
  },
  {
    name: 'FocusScope brings the focus trail along',
    edits: [
      {
        file: scope,
        find: "import * as LayerStack from './layer-stack.js'",
        replace: "import * as LayerStack from './layer-stack.js'\nimport './focus-return.js'",
      },
    ],
    tests: ['packages/primitives/test/focus-trail.test.ts'],
  },
]
