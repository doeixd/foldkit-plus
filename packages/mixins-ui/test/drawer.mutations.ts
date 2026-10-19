/**
 * The Drawer, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/drawer.mutations.ts` checks that a test fails for every one.
 */
const unit = ['packages/mixins-ui/test/drawer.test.ts']
const browser = ['packages/mixins-ui/test/drawer.browser.test.ts']
const file = '../src/drawer.ts'
const recipe = '../src/recipes/drawer.ts'

export default [
  {
    name: 'the click after a drag toggles it',
    edits: [
      {
        file,
        find: '    Pressed: () =>\n      model.dragged',
        replace: '    Pressed: () =>\n      false',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a press that barely moves settles as a drag',
    edits: [
      {
        file,
        find: 'if (!completed || Math.abs(delta) < PRESS_SLOP)',
        replace: 'if (!completed)',
      },
    ],
    tests: unit,
  },
  {
    name: 'a flick down is read as a rest',
    edits: [{ file, find: 'if (velocity > FLICK_SPEED) return false', replace: '' }],
    tests: unit,
  },
  {
    name: 'a drag up from the peek never opens it',
    edits: [
      {
        file,
        find: ': -delta >= CLOSE_SHARE * size',
        replace: ': false',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a drag is not drawn',
    edits: [
      {
        file,
        find: "'--fk-drawer-offset': `${drag.delta}px`,",
        replace: "'--fk-drawer-offset': '0px',",
      },
    ],
    tests: browser,
  },
  {
    name: 'down, it rests open',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo('[data-open=\"false\"]', { '--_fk-drawer-rest': travel,",
        replace: 'Style.pseudo(\'[data-open="false"]\', {',
      },
    ],
    tests: browser,
  },
  {
    name: 'the handle bends the wrong way',
    edits: [
      {
        file: recipe,
        find: 'rotate: `calc(var(--_fk-drawer-bend, 0) * -${BEND}deg)`,',
        replace: 'rotate: `calc(var(--_fk-drawer-bend, 0) * ${BEND}deg)`,',
      },
    ],
    tests: browser,
  },
  {
    name: 'the bend does not follow the finger',
    edits: [
      { file: recipe, find: "'--_fk-drawer-bend': 'var(--fk-drawer-progress)',", replace: '' },
    ],
    tests: browser,
  },
  {
    name: 'a body down stays in view',
    edits: [
      {
        file: recipe,
        find: "      visibility: 'hidden',\n    }),",
        replace: '    }),',
      },
    ],
    tests: browser,
  },
  {
    name: 'a dock below lg docks at any width',
    edits: [
      {
        file: recipe,
        find: 'pieces.map(piece => Style.at(`@media (max-width: ${width})`, piece))',
        replace: 'pieces',
      },
    ],
    tests: browser,
  },
  {
    name: 'a swipe on a grip swallows the next press',
    edits: [{ file, find: "dragged: () => from === 'handle',", replace: 'dragged: () => true,' }],
    tests: [...unit, ...browser],
  },
  {
    name: 'a grip takes sideways swipes from its row',
    edits: [
      {
        file,
        find: "grip: builders.grip.attrs([h.Style({ touchAction: 'pan-x' }),",
        replace: "grip: builders.grip.attrs([h.Style({ touchAction: 'none' }),",
      },
    ],
    tests: browser,
  },
  {
    name: 'a grip drags nothing',
    edits: [{ file, find: "h.OnMount(swipe('grip'))", replace: "h.Id('no-grip')" }],
    tests: browser,
  },
  {
    name: 'the handle is a sliver to press',
    edits: [{ file: recipe, find: "blockSize: '2.75rem',", replace: "blockSize: '1.75rem'," }],
    tests: browser,
  },
  {
    name: 'the handle takes all its room in the column',
    edits: [{ file: recipe, find: "marginBlock: '-0.75rem',", replace: '' }],
    tests: browser,
  },
  {
    name: 'a grip captures the press, and takes its click',
    edits: [{ file, find: "slop: from === 'grip' ? PRESS_SLOP : 0", replace: 'slop: 0' }],
    tests: browser,
  },
]
