/**
 * The component pages and the theme creator, broken in turn: `pnpm mutate
 * examples/site/test/components.mutations.ts` checks that a test fails for
 * every one.
 */
const unit = [
  'examples/site/test/theme.test.ts',
  'examples/site/test/showcases.test.ts',
  'examples/site/test/components.test.ts',
]
const pages = ['examples/site/test/prerender.test.ts']

export default [
  {
    name: 'a picked value the recipe does not have reaches it',
    edits: [
      {
        file: '../src/gallery/showcases.ts',
        find: 'picked !== undefined && axis.values.includes(picked)',
        replace: 'picked !== undefined',
      },
    ],
    tests: unit,
  },
  {
    name: "a picked value read through the selection's prototype",
    edits: [
      {
        file: '../src/gallery/showcases.ts',
        find: 'Object.hasOwn(selection, axis.name) ? selection[axis.name] : undefined',
        replace: 'selection[axis.name]',
      },
    ],
    tests: unit,
  },
  {
    name: 'every value named in the code, the defaults too',
    edits: [
      {
        file: '../src/gallery/showcases.ts',
        find: "value === axis.initial ? [] : [`${axis.name}: '${value}'`]",
        replace: "[`${axis.name}: '${value}'`]",
      },
    ],
    tests: unit,
  },
  {
    name: 'a knob kept outside its slider',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: 'const clamped = Math.min(range.max, Math.max(range.min, value))',
        replace: 'const clamped = value',
      },
    ],
    tests: unit,
  },
  {
    name: 'a knob that is no number installed',
    edits: [
      {
        file: '../src/main.ts',
        find: 'range === undefined || !Number.isFinite(value)',
        replace: 'range === undefined',
      },
    ],
    tests: unit,
  },
  {
    name: 'the same knobs installed as a new Model',
    edits: [
      {
        file: '../src/main.ts',
        find: '  sameKnobs(model.knobs, knobs)\n    ? { model }',
        replace: '  false\n    ? { model }',
      },
    ],
    tests: unit,
  },
  {
    name: 'copied code left marked current after the knobs move',
    edits: [
      {
        file: '../src/main.ts',
        find: 'knobs: () => knobs, copied: () => false',
        replace: 'knobs: () => knobs',
      },
    ],
    tests: unit,
  },
  {
    name: 'the code /create hands out leaves a knob out',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: "    `    motion: '${knobs.motion}',`,\n",
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'the preview not told the scheme',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: "colorScheme: scheme === 'system' ? 'light dark' : scheme,",
        replace: "colorScheme: 'light dark',",
      },
    ],
    tests: unit,
  },
  {
    name: "a thumbnail's controls left in reach",
    edits: [
      {
        file: '../src/view/components.ts',
        find: "...(size === 'thumb' ? [h.Attribute('inert', '')] : []),",
        replace: '',
      },
    ],
    tests: pages,
  },
  {
    name: "the creator's preview drawn without the knobs",
    edits: [
      {
        file: '../src/view/components.ts',
        find: 'h.Style(knobStyleOf(model.knobs, model.scheme)),',
        replace: '',
      },
    ],
    tests: pages,
  },
  {
    name: 'a base color reaches no neutral',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: "...(knobs.base === 'accent' ? {} : { neutral: { h: bases[knobs.base].h } }),",
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'the menu look is left out',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: '      menu: { accent: knobs.menuAccent, color: knobs.menuColor },',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'the spring is never chosen',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: "knobs.easing === 'spring' ? `var(",
        replace: 'false ? `var(',
      },
    ],
    tests: unit,
  },
  {
    name: 'any knobs are in every style',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: '    knob => knobs[knob] === look.shape[knob],',
        replace: '    () => true,',
      },
    ],
    tests: unit,
  },
  {
    name: 'a menu choice does not tell knobs apart',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: '  choiceKnobs.every(knob => left[knob] === right[knob])',
        replace: '  left.font === right.font',
      },
    ],
    tests: unit,
  },
  {
    name: "a radio option's words are not its label",
    edits: [
      {
        file: '../src/snippets/components.ts',
        find: '          options.map(option =>\n            h.label(',
        replace: '          options.map(option =>\n            h.div(',
      },
    ],
    tests: pages,
  },
]
