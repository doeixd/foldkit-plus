/**
 * The rating, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/rating.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/rating.test.ts'
const browser = 'packages/mixins-ui/test/rating.browser.test.ts'
const recipe = '../src/recipes/rating.ts'

export default [
  {
    name: 'every star up to the one given is checked',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'h.Checked(value === given)',
        replace: 'h.Checked(value <= given)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the star given is not filled',
    edits: [
      {
        file: '../src/rating.ts',
        find: "h.DataAttribute('filled', String(value <= given))",
        replace: "h.DataAttribute('filled', String(value < given))",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a choice sends the rating already given',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'h.OnChange(() => options.onChange(value))',
        replace: 'h.OnChange(() => options.onChange(given))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the radios are grouped by a client-only property',
    edits: [
      {
        file: '../src/rating.ts',
        find: "h.Attribute('name', options.id),",
        replace: 'h.Name(options.id),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a disabled rating still takes a choice',
    edits: [
      {
        file: '../src/rating.ts',
        find: '            ...(disabled\n              ? [h.Disabled(true)]',
        replace: '            ...(false\n              ? [h.Disabled(true)]',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the group is not named by its label',
    edits: [
      {
        file: '../src/rating.ts',
        find: "h.Role('radiogroup'),\n      h.AriaLabelledBy(labelId),",
        replace: "h.Role('radiogroup'),",
      },
    ],
    tests: [unit],
  },
  {
    name: 'read-only, the rating does not say out of how many',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'onSome: value => `${starLabel(value)} of ${max}`,',
        replace: 'onSome: value => starLabel(value),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'read-only, the label is read twice',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'h.span(builders.label.attrs([h.AriaHidden(true)]), [options.label])',
        replace: 'h.span(builders.label.attrs([]), [options.label])',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a fraction fills nothing of its last star',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'Math.round(Math.min(1, Math.max(0, left)) * 1000) / 1000',
        replace: 'Math.floor(Math.min(1, Math.max(0, left)))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a fraction keeps its float noise',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'Math.round(Math.min(1, Math.max(0, left)) * 1000) / 1000',
        replace: 'Math.min(1, Math.max(0, left))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'halves are not marked as the first of a star',
    edits: [
      {
        file: '../src/rating.ts',
        find: "...(Number.isInteger(value) ? [] : [h.DataAttribute('half', 'start')]),",
        replace: '',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a choice takes whole stars whatever the precision',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'const step = options.precision ?? 1',
        replace: 'const step = 1',
      },
    ],
    tests: [unit],
  },
  {
    name: 'every star clears',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'onClear !== undefined && value === given ?',
        replace: 'onClear !== undefined ?',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the rating in words is read twice',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'h.span(builders.value.attrs([h.AriaHidden(true)]), [starLabel(value)])',
        replace: 'h.span(builders.value.attrs([]), [starLabel(value)])',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a disabled rating still takes Home and End',
    edits: [
      {
        file: '../src/rating.ts',
        find: '...(disabled\n        ? []\n        : [h.OnMount(',
        replace: '...(false\n        ? []\n        : [h.OnMount(',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Home and End move the choice but not the focus',
    edits: [{ file: '../src/rating.ts', find: '            to.focus()\n', replace: '' }],
    tests: [browser],
  },
  {
    name: 'End goes to the first star',
    edits: [
      {
        file: '../src/rating.ts',
        find: "event.key === 'Home' ? radios[0] : radios[radios.length - 1]",
        replace: 'radios[0]',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a fraction fills from the left right to left',
    edits: [
      {
        file: recipe,
        find: "'linear-gradient(to left, var(--_fk-rating-on)",
        replace: "'linear-gradient(to right, var(--_fk-rating-on)",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a filled radio shows empty',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo('[data-filled=\"true\"]', { '--fk-rating-fill': '1' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the stars after the one pointed at keep their fill',
    edits: [
      {
        file: recipe,
        find: "Style.nest(`${pointed} ~ &`, { '--fk-rating-fill': '0' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a half is a whole star wide',
    edits: [
      {
        file: recipe,
        find: "        inlineSize: `calc(${size} / 2)`,\n        marginInlineEnd: '0',\n",
        replace: "        marginInlineEnd: '0',\n",
      },
    ],
    tests: [browser],
  },
  {
    name: "a star's halves stand a gap apart",
    edits: [
      {
        file: recipe,
        find: "        inlineSize: `calc(${size} / 2)`,\n        marginInlineEnd: '0',\n",
        replace: '        inlineSize: `calc(${size} / 2)`,\n',
      },
    ],
    tests: [browser],
  },
  {
    name: "the end half shows the glyph's start",
    edits: [
      {
        file: recipe,
        find: 'Style.nest(\'[data-half="start"] + &::before\', { marginInlineStart: `calc(${size} / -2)` }),',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a heart is a star',
    edits: [
      {
        file: recipe,
        find: "heart: { root: variant(Style.self({ '--_fk-rating-shape': heart })) },",
        replace: 'heart: {},',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a large star is small',
    edits: [{ file: recipe, find: 'lg: { root: steps.lg },', replace: 'lg: { root: steps.sm },' }],
    tests: [browser],
  },
]
