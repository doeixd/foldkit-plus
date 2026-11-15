/**
 * The compiler-free theme code, broken in turn:
 * `pnpm mutate packages/mixins/test/themeRuntime.mutations.ts`.
 */
const runtime = '../src/theme/runtime.ts'
const data = '../src/theme/knobData.ts'
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
        replace:
          "import { inline } from '../styleValue.js'\nexport const THEME_KEY = String(Object.keys(inline({}).style))",
      },
    ],
    tests: build,
  },
  {
    name: 'the knob table reads a style value',
    edits: [
      {
        file: data,
        find: "knob.control.kind === 'range' &&",
        replace: "String(inline({})) !== '' && knob.control.kind === 'range' &&",
      },
      {
        file: data,
        find: "import type { Knob, Schemed } from './knob.js'",
        replace:
          "import type { Knob, Schemed } from './knob.js'\nimport { inline } from '../styleValue.js'\nexport const leaked = inline({}).classes",
      },
    ],
    tests: build,
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
    edits: [{ file: data, find: "'light' in knob && 'dark' in knob", replace: 'false' }],
    tests: table,
  },
  {
    name: 'an entry names the knob, not the variable it writes',
    edits: [{ file: data, find: 'variable: knob.control.variable', replace: 'variable: name' }],
    tests: table,
  },
]
