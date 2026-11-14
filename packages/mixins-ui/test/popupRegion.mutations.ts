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
        find: 'if (node.isConnected && !parent.contains(node)) carryRegion(parent, node)',
        replace: '',
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
        find: '    if (own.getPropertyValue(name) !== inherited.getPropertyValue(name)) continue\n',
        replace: '',
      },
    ],
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
