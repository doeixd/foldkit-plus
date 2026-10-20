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
    name: 'an example forgets the values it pins',
    edits: [
      {
        file: '../src/gallery/showcases.ts',
        find: 'drawExample(styleOf({ ...selection, ...pins }), live)',
        replace: 'drawExample(styleOf(selection), live)',
      },
    ],
    tests: unit,
  },
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
        find: 'const clamped = Math.min(control.max, Math.max(control.min, value))',
        replace: 'const clamped = value',
      },
    ],
    tests: ['examples/site/test/components.test.ts'],
  },
  {
    name: 'a value its knob refuses installed',
    edits: [
      {
        file: '../src/main.ts',
        find: 'return Schema.decodeUnknownOption(knob.schema)(next).pipe(',
        replace: 'return Option.some(next).pipe(',
      },
    ],
    tests: ['examples/site/test/components.test.ts'],
  },
  {
    name: 'the same theme installed as a new Model',
    edits: [
      {
        file: '../src/main.ts',
        find: 'sameTheme(model.theme, values)\n    ? { model }',
        replace: 'false\n    ? { model }',
      },
    ],
    tests: ['examples/site/test/components.test.ts'],
  },
  {
    name: 'copied code left marked current after the knobs move',
    edits: [
      {
        file: '../src/main.ts',
        find: '          copied: () => false,\n          linkCopied',
        replace: '          linkCopied',
      },
    ],
    tests: unit,
  },
  {
    name: 'the code /create hands out leaves its knobs out',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: '`const theme = ${Theme.print(Theme.make(values))}`',
        replace: '`const theme = ${Theme.print(Theme.make({}))}`',
      },
    ],
    tests: ['examples/site/test/theme.test.ts'],
  },
  {
    name: 'the preview not told the scheme',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: "colorScheme: scheme === 'system' ? 'light dark' : scheme",
        replace: "colorScheme: 'light dark'",
      },
    ],
    tests: ['examples/site/test/theme.test.ts'],
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
    name: 'a base color reaches no neutral',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: 'hue: bases[base].h, saturation: bases[base].c',
        replace: 'saturation: bases[base].c',
      },
    ],
    tests: ['examples/site/test/components.test.ts', 'examples/site/test/theme.test.ts'],
  },
  {
    name: 'any theme is in every style',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: 'sameTheme(withLook(values, chosen), values)',
        replace: 'true',
      },
    ],
    tests: ['examples/site/test/theme.test.ts'],
  },
  {
    name: 'no two themes are told apart',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: 'Theme.print(Theme.make(a)) === Theme.print(Theme.make(b))',
        replace: 'true',
      },
    ],
    tests: ['examples/site/test/theme.test.ts', 'examples/site/test/components.test.ts'],
  },
  {
    name: "the previews' knobs are kept over a base the previews do not declare",
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: '{ base: iris, ...knobsPlace }',
        replace: '{ base: Theme.make({}), ...knobsPlace }',
      },
    ],
    tests: ['examples/site/test/knobs.browser.test.ts'],
  },
  {
    name: 'a picker installs a value that is none of its choices',
    edits: [
      {
        file: '../src/gallery/studio.ts',
        find: 'Schema.decodeUnknownOption(Base)(value).pipe(',
        replace: 'Option.some(value).pipe(Option.filter((base): base is Base => true),',
      },
    ],
    tests: unit,
  },
  {
    name: 'a base color leaves the surface tint',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: 'hue: bases[base].h, saturation: bases[base].c',
        replace: 'hue: bases[base].h',
      },
    ],
    tests: ['examples/site/test/components.test.ts', 'examples/site/test/theme.test.ts'],
  },
  {
    name: 'a pane chosen leaves the drawer closed',
    edits: [
      {
        file: '../src/main.ts',
        find: '                drawer: drawer => Drawer.open(drawer),',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a radio option’s words are not its label',
    edits: [
      {
        file: '../src/snippets/components.ts',
        find: '            options.map(option =>\n              h.label(',
        replace: '            options.map(option =>\n              h.div(',
      },
    ],
    tests: pages,
  },
  {
    name: 'the component pages offer no direction',
    edits: [
      {
        file: '../src/view/components.ts',
        find: '      schemeChoice(model, slots, h),\n      directionChoice(model, slots, h),',
        replace: '      schemeChoice(model, slots, h),',
      },
    ],
    tests: pages,
  },
  {
    name: 'a chosen direction never lands in the Model',
    edits: [
      {
        file: '../src/main.ts',
        find: 'modifyFields(model, { direction: () => direction })',
        replace: 'model',
      },
    ],
    tests: ['examples/site/test/components.test.ts'],
  },
]
