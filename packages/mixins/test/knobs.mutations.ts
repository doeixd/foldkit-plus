/**
 * Typed knobs and themes, broken in turn:
 * `pnpm mutate packages/mixins/test/knobs.mutations.ts`.
 */
const unit = ['packages/mixins/test/knobs.test.ts']
const page = ['packages/mixins/test/themePage.test.ts']
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
        find: 'unset: one(options.variable, options.follows ?? `${num(options.default)}${unit}`),',
        replace: 'unset: one(options.variable, `${num(options.default)}${unit}`),',
      },
    ],
    tests: [...unit, ...page],
  },
  {
    name: 'a knob the group lacks is taken',
    edits: [
      {
        file: knobs,
        find: 'if (!Object.hasOwn(knobs[group]!, name)) throw unknownKnob(caller, path)',
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
    tests: [...unit, ...page],
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
    tests: page,
  },
  {
    name: 'an outline ignores the ink the outlines choice gives it',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: "transparent) calc(${v('knob', 'outline-ink')} * 100%))`",
        replace: 'transparent) 0%)`',
      },
    ],
    tests: ['packages/mixins/test/knobChoices.browser.test.ts'],
  },
  {
    name: 'a thick border keeps its step whatever the width',
    edits: [
      {
        file: '../src/theme/tokens.ts',
        find: "thick: 'calc(var(--fk-knob-border-width) + 1px)',",
        replace: "thick: '2px',",
      },
    ],
    tests: ['packages/mixins/test/knobChoices.browser.test.ts'],
  },
  {
    name: 'a hard shadow style draws soft',
    edits: [
      {
        file: knobs,
        find: "hard: asVariables('shadow', elevation.hard),",
        replace: "hard: asVariables('shadow', elevation.soft),",
      },
    ],
    tests: ['packages/mixins/test/knobChoices.browser.test.ts'],
  },
  {
    name: 'the spring easing eases',
    edits: [
      {
        file: knobs,
        find: "spring: { ease: ref('motion', 'spring') } },",
        replace: "spring: { ease: 'ease-out' } },",
      },
    ],
    tests: ['packages/mixins/test/knobChoices.browser.test.ts'],
  },
  {
    name: 'print writes every knob a theme sets, defaults too',
    edits: [
      {
        file: knobs,
        find: 'value === undefined || atDefault(knob, value)',
        replace: 'value === undefined',
      },
    ],
    tests: unit,
  },
  {
    name: 'a font stack is printed unescaped',
    edits: [{ file: knobs, find: String.raw`.replaceAll("'", "\\'")`, replace: '' }],
    tests: unit,
  },
  {
    name: 'the hover strength writes a variable the palette never reads',
    edits: [
      { file: knobs, find: "variable: 'state-hover',", replace: "variable: 'state-hovered'," },
    ],
    tests: unit,
  },
  {
    name: 'an unknown knob is named by its group alone',
    edits: [
      {
        file: knobs,
        find: 'throw unknownKnob(caller, path)',
        replace: 'throw unknownKnob(caller, group)',
      },
    ],
    tests: unit,
  },
  {
    name: 'a refused value does not name its knob',
    edits: [
      {
        file: knobs,
        find: 'message: `${caller}: ${path} refuses its value: ',
        replace: 'message: `${caller}: refuses its value: ',
      },
    ],
    tests: unit,
  },
  {
    name: 'every refusal names Theme.make',
    edits: [
      {
        file: knobs,
        find: "checked('Theme.set', self.knobs, values)",
        replace: "checked('Theme.make', self.knobs, values)",
      },
    ],
    tests: unit,
  },
  {
    name: 'withValue takes any value',
    edits: [
      {
        file: knobs,
        find: "checkValue('Knobs.withValue', path, at(knobs, path), value)",
        replace: 'void 0',
      },
    ],
    tests: unit,
  },
  {
    name: 'a refused value carries the fluid range code',
    edits: [
      { file: knobs, find: "code: 'theme:knob-value',", replace: "code: 'theme:fluid-range'," },
    ],
    tests: unit,
  },
]
