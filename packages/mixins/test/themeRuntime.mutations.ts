/**
 * The compiler-free theme code, broken in turn:
 * `pnpm mutate packages/mixins/test/themeRuntime.mutations.ts`.
 */
const runtime = '../src/theme/runtime.ts'
const data = '../src/theme/knobData.ts'
const generator = '../scripts/knobData.ts'
const build = ['packages/mixins/test/themeRuntimeBuild.test.ts']
const unit = ['packages/mixins/test/themeRuntime.test.ts']
const table = ['packages/mixins/test/knobData.test.ts']

export default [
  {
    name: 'the runtime half reads a style value',
    edits: [
      {
        file: runtime,
        find: "export const THEME_KEY = 'foldkit:theme'",
        replace: [
          "import { inline } from '../styleValue.js'",
          'export const THEME_KEY = String(Object.keys(inline({}).style))',
        ].join('\n'),
      },
    ],
    tests: build,
  },
  {
    name: 'the knob table reads the knob definitions',
    edits: [
      {
        file: data,
        find: 'export type { KnobData, RangeName }',
        replace: [
          "import { standard } from './knobs.js'",
          'export type { KnobData, RangeName }',
          'globalThis.leak = () => Object.keys(standard)',
        ].join('\n'),
      },
    ],
    tests: build,
  },
  {
    name: 'a page reading some knobs keeps all of them',
    edits: [
      {
        file: data,
        find: 'export type { KnobData, RangeName }',
        replace: ['export type { KnobData, RangeName }', 'globalThis.all = () => knobData'].join(
          '\n',
        ),
      },
    ],
    tests: build,
  },
  {
    name: 'the generator writes the wrong step',
    edits: [
      { file: generator, find: 'step: knob.control.step', replace: 'step: knob.control.min' },
    ],
    tests: table,
  },
  {
    name: 'the stream passes on a name no theme has',
    edits: [
      {
        file: runtime,
        find: 'themes.names.find(name => name === value) ?? themes.initial',
        replace: '(value as typeof themes.initial | null) ?? themes.initial',
      },
    ],
    tests: unit,
  },
  {
    name: 'a knob with two schemes is one entry',
    edits: [{ file: generator, find: "'light' in knob && 'dark' in knob", replace: 'false' }],
    tests: table,
  },
  {
    name: 'an entry names the knob, not the variable it writes',
    edits: [
      { file: generator, find: 'variable: knob.control.variable', replace: 'variable: name' },
    ],
    tests: table,
  },
]
