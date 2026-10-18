/**
 * Controls' relief, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/relief.mutations.ts` checks that a test fails for
 * every one.
 */
const unit = ['packages/mixins-ui/test/relief.test.ts']
const browser = ['packages/mixins-ui/test/relief.browser.test.ts']
const both = [...unit, ...browser]
const tokens = '../../mixins/src/theme/tokens.ts'

export default [
  {
    name: 'a solid button stays flat',
    edits: [
      {
        file: '../src/recipes/button.ts',
        find: "...press(toneVar('fill'), toneVar('fill-hover'), toneVar('fill-active')),\n          ...raised,",
        replace: "...press(toneVar('fill'), toneVar('fill-hover'), toneVar('fill-active')),",
      },
    ],
    tests: both,
  },
  {
    name: 'a toggle that is on stands out',
    edits: [
      {
        file: '../src/recipes/button.ts',
        find: 'Style.pseudo(`:is(${held}, [aria-pressed="true"])`, { boxShadow',
        replace: 'Style.pseudo(held, { boxShadow',
      },
    ],
    tests: browser,
  },
  {
    name: 'an input does not sink',
    edits: [
      {
        file: '../src/recipes/field.ts',
        find: '    background: ref.surface.base,\n    boxShadow: ref.shadow.field,',
        replace: '    background: ref.surface.base,',
      },
    ],
    tests: both,
  },
  {
    name: 'a combobox does not sink',
    edits: [
      {
        file: '../src/recipes/combobox.ts',
        find: '        boxShadow: ref.shadow.field,\n',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a bevel pressed in stands out',
    edits: [{ file: tokens, find: 'pressed: bevel(-1)', replace: 'pressed: bevel(1)' }],
    tests: browser,
  },
  {
    name: 'a hard field is flat',
    edits: [{ file: tokens, find: 'field: hard(2) }', replace: 'field: FLAT }' }],
    tests: browser,
  },
  {
    name: 'the shipped controls are raised',
    edits: [
      { file: tokens, find: '    raised: FLAT,', replace: "    raised: shadow('0 1px 2px 0')," },
    ],
    tests: browser,
  },
  {
    name: 'a button keeps the field corner in a pill theme',
    edits: [
      {
        file: '../src/recipes/button.ts',
        find: 'borderRadius: ref.radius.control,',
        replace: 'borderRadius: ref.radius.md,',
      },
    ],
    tests: browser,
  },
  {
    name: 'the control corner ignores control-round',
    edits: [
      {
        file: tokens,
        find: "control: 'calc(var(--fk-radius-md) + var(--fk-knob-control-round, 0) * 9999px)',",
        replace: "control: 'var(--fk-radius-md)',",
      },
    ],
    tests: browser,
  },
  {
    name: 'a heading is set in the body font',
    edits: [
      {
        file: '../src/recipes/typography.ts',
        find: '      fontFamily: ref.font.heading,\n      fontSize: size,',
        replace: '      fontSize: size,',
      },
    ],
    tests: ['packages/mixins-ui/test/typography.test.ts'],
  },
]
