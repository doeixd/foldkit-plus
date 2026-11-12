/**
 * Style modules frozen at build (#420), broken:
 * `pnpm mutate packages/mixins/test/viteFreeze.mutations.ts`.
 */
const tests = ['packages/mixins/test/viteFreeze.test.ts']

export default [
  {
    name: 'a compiler left in a freezing build is not refused',
    edits: [
      {
        file: '../src/vite.ts',
        find: 'if (compiler.length === 0) return',
        replace: 'return',
      },
    ],
    tests,
  },
  {
    name: 'a Style.whenInput in a listed module is written as data',
    edits: [
      {
        file: '../src/viteFreeze.ts',
        find: "if (typeof contribution === 'function') {",
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a Style.perItem is named as a whenInput',
    edits: [
      {
        file: '../src/viteFreeze.ts',
        find: "(piece?.items ?? []).length > 0 ? 'Style.perItem'",
        replace: "false ? 'Style.perItem'",
      },
    ],
    tests,
  },
  {
    name: 'an export that is no data is written anyway',
    edits: [{ file: '../src/viteFreeze.ts', find: ': isStrings(value)', replace: ': true' }],
    tests,
  },
  {
    name: 'a frozen Slot loses its events',
    edits: [
      {
        file: '../src/viteFreeze.ts',
        find: "`events: ${this.tokens(slot['events'])}`",
        replace: '`events: []`',
      },
    ],
    tests,
  },
  {
    name: 'a frozen capability loses its parents',
    edits: [
      {
        file: '../src/viteFreeze.ts',
        find: "{ extends: [${parents.join(', ')}] }",
        replace: '{ extends: [] }',
      },
    ],
    tests,
  },
  {
    name: 'a frozen Style loses its inline declarations',
    edits: [
      {
        file: '../src/viteFreeze.ts',
        find: "Object.keys(inline ?? {}).length === 0 ? '' :",
        replace: "true ? '' :",
      },
    ],
    tests,
  },
  {
    name: 'the classes a frozen module draws are not collected for the rule check',
    edits: [
      {
        file: '../src/viteFreeze.ts',
        find: 'if (COMPILED.test(name)) this.classes.add(name)',
        replace: 'if (false) this.classes.add(name)',
      },
    ],
    tests,
  },
  {
    name: 'the rule check reads every class as held',
    edits: [
      {
        file: '../src/viteFreeze.ts',
        find: 'const missing = [...module.classes].filter(name => !held.has(name))',
        replace: 'const missing = [...module.classes].filter(() => false)',
      },
    ],
    tests,
  },
  {
    name: 'the sheet build does not evaluate the listed modules',
    edits: [
      {
        file: '../src/vite.ts',
        find: '...modules.map((id, index) => `import * as module${index} from ${JSON.stringify(id)}`),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the browser build loads a listed module as written',
    edits: [
      {
        file: '../src/vite.ts',
        find: 'if (module !== undefined) return (await build()).frozen.get(module)?.source',
        replace: 'if (false) return (await build()).frozen.get(module)?.source',
      },
    ],
    tests,
  },
  {
    name: 'development freezes too',
    edits: [
      {
        file: '../src/vite.ts',
        find: "modules.length > 0 && config.command === 'build' && environment === 'client'",
        replace: "modules.length > 0 && environment === 'client'",
      },
    ],
    tests,
  },
  {
    name: 'the build keeps the run-time injection',
    edits: [
      {
        file: '../src/vite.ts',
        find: "return { define: { [FROZEN_DEFINE]: 'true' } }",
        replace: 'return undefined',
      },
    ],
    tests,
  },
  {
    name: 'a Slot injects whatever the build says',
    edits: [
      {
        file: '../src/slotView.ts',
        find: 'if (injects) ensure(evaluated)',
        replace: 'ensure(evaluated)',
      },
    ],
    tests,
  },
] as const
