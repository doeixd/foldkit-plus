/**
 * Typed knobs and themes, broken in turn:
 * `pnpm mutate packages/mixins/test/knobs.mutations.ts`.
 */
const unit = ['packages/mixins/test/knobs.test.ts']
const golden = ['packages/mixins/test/knobsGolden.browser.test.ts']
const kinds = '../src/theme/knob.ts'
const knobs = '../src/theme/knobs.ts'

export default [
  {
    name: 'a range accepts any number',
    edits: [
      {
        file: kinds,
        find: 'schema: Schema.Number.check(Schema.isBetween({ minimum: options.min, maximum: options.max })),',
        replace: 'schema: Schema.Number,',
      },
    ],
    tests: unit,
  },
  {
    name: 'a bare schemed value sets the dark scheme too',
    edits: [
      {
        file: kinds,
        find: '? light.write(value)',
        replace: '? { ...light.write(value), ...dark.write(value) }',
      },
    ],
    tests: unit,
  },
  {
    name: 'a choice writes its default whatever is chosen',
    edits: [
      {
        file: kinds,
        find: 'write: value => options.options[value]!,',
        replace: 'write: () => options.options[options.default]!,',
      },
    ],
    tests: unit,
  },
  {
    name: 'an unset knob holds its default, not what it follows',
    edits: [
      {
        file: kinds,
        find: 'unset: { [options.variable]: options.follows ?? `${num(options.default)}${unit}` },',
        replace: 'unset: { [options.variable]: `${num(options.default)}${unit}` },',
      },
    ],
    tests: [...unit, ...golden],
  },
  {
    name: 'a knob the group lacks is taken',
    edits: [
      {
        file: knobs,
        find: 'if (!Object.hasOwn(knobs[group]!, name)) throw new Error(`Theme: no knob "${group}.${name}".`)',
        replace: 'if (!Object.hasOwn(knobs[group]!, name)) continue',
      },
    ],
    tests: unit,
  },
  {
    name: 'set replaces a group rather than merging it',
    edits: [
      {
        file: knobs,
        find: 'merged[group] = { ...merged[group], ...names }',
        replace: 'merged[group] = { ...names }',
      },
    ],
    tests: unit,
  },
  {
    name: 'a theme writes only its defaults',
    edits: [
      {
        file: knobs,
        find: 'Object.assign(declared, knob.unset, value === undefined ? {} : knob.write(value))',
        replace: 'Object.assign(declared, knob.unset)',
      },
    ],
    tests: [...unit, ...golden],
  },
  {
    name: 'the dark accent chroma follows nothing',
    edits: [
      {
        file: knobs,
        find: "follows: `min(0.4, calc(${ref('knob', 'accent-c')} + 0.03))`,",
        replace: '',
      },
    ],
    tests: golden,
  },
]
