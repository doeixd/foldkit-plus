/**
 * A portaled panel keeps its region's custom properties, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/popupRegion.mutations.ts`.
 */
const anchor = '../src/anchor.ts'
const tests = [
  'packages/mixins-ui/test/popupRegion.browser.test.ts',
  'packages/mixins-ui/test/popupLadder.browser.test.ts',
]

export default [
  {
    name: 'nothing is carried onto a relocated panel',
    edits: [
      {
        file: anchor,
        find: '          carryRegion(parent, node, record.nextSibling)',
        replace: '          void record',
      },
    ],
    tests,
  },
  {
    name: 'the wrapper around upstream popup Mounts watches nothing',
    edits: [
      {
        file: anchor,
        find: 'return origin === null ? () => {} : carryOnRelocation(origin, element)\n        }),\n        stop',
        replace: 'return () => {}\n        }),\n        stop',
      },
    ],
    tests,
  },
  {
    name: 'the Anchor Mount watches nothing',
    edits: [
      {
        file: anchor,
        find: 'const stopCarrying = origin === null ? () => {} : carryOnRelocation(origin, element)',
        replace: 'const stopCarrying = () => {}',
      },
    ],
    tests,
  },
  {
    name: 'a property equal to the document value is written too',
    edits: [
      {
        file: anchor,
        find: '    if (value === inherited.getPropertyValue(name)) continue\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a property the panel sets itself is overwritten by the region',
    edits: [
      {
        file: anchor,
        find: '    if (own.getPropertyValue(name) !== value) continue\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: "the panel's own value is compared where it stands, with what it inherits there",
    edits: [
      {
        file: anchor,
        find: 'const own = view.getComputedStyle(probe)',
        replace: 'const own = view.getComputedStyle(panel)',
      },
      {
        file: anchor,
        find: '    if (own.getPropertyValue(name) !== value) continue\n',
        replace:
          '    if (own.getPropertyValue(name) !== inherited.getPropertyValue(name)) continue\n',
      },
    ],
    tests,
  },
  {
    name: 'the names are read from the computed style alone',
    edits: [
      {
        file: anchor,
        find: '  for (const name of declaredNames(origin)) {',
        replace: "  for (const name of Array.from(from).filter(each => each.startsWith('--'))) {",
      },
    ],
    survives:
      'Chromium, the one engine the browser tests run, lists custom properties in a computed style; the sheets are read for the engines that do not',
    tests,
  },
  {
    name: 'a popup keeps no wrapper around its upstream Mount',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: 'inheritRegion(UpstreamListbox.AnchorListbox({ buttonId: `${id}-button`, anchor })),',
        replace: 'UpstreamListbox.AnchorListbox({ buttonId: `${id}-button`, anchor }),',
      },
    ],
    tests,
  },
]
