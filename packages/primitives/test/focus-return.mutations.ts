/**
 * An overlay's focus return when its opener is gone, broken in turn:
 * `pnpm mutate packages/primitives/test/focus-return.mutations.ts`.
 */
const source = '../src/dom/focus-return.ts'
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
        file: source,
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
        file: source,
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
      { file: source, find: '  if (below !== undefined) {', replace: '  if (false as boolean) {' },
    ],
    tests,
  },
  {
    name: 'the page is not the last resort',
    edits: [
      {
        file: source,
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
        find: '  [...trail].reverse().find(each => each.isConnected && !overlay.contains(each))',
        replace: '  undefined',
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
        find: 'import { activeOutside, backToOpener,',
        replace: 'import { activeOutside, openerOf, backToOpener,',
      },
    ],
    tests,
  },
]
