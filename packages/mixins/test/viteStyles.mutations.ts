/**
 * The Vite plugin and `Style.complete`, broken:
 * `pnpm mutate packages/mixins/test/viteStyles.mutations.ts`.
 */
const tests = ['packages/mixins/test/viteStyles.test.ts']

export default [
  {
    name: 'the sheet build emits no files',
    edits: [{ file: '../src/vite.ts', find: 'emitAssets: true,', replace: 'emitAssets: false,' }],
    tests,
  },
  {
    name: 'a file only the sheet names is not emitted',
    edits: [
      {
        file: '../src/vite.ts',
        find: 'if (!(asset.fileName in bundle))',
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'a class the sheet lacks is not appended',
    edits: [
      {
        file: '../src/inject.ts',
        find: 'if (!held.has(className)) rules.push',
        replace: 'if (false) rules.push',
      },
    ],
    tests,
  },
  {
    name: 'a class the sheet holds is appended again',
    edits: [
      {
        file: '../src/inject.ts',
        find: 'if (!held.has(className)) rules.push',
        replace: 'if (true) rules.push',
      },
    ],
    tests,
  },
  {
    name: 'a global rule the sheet lacks is not appended',
    edits: [
      {
        file: '../src/inject.ts',
        find: ".filter(css => css !== '' && !sheet.includes(css))",
        replace: '.filter(() => false)',
      },
    ],
    tests,
  },
  {
    name: 'a global rule the sheet holds is appended again',
    edits: [
      {
        file: '../src/inject.ts',
        find: ".filter(css => css !== '' && !sheet.includes(css))",
        replace: ".filter(css => css !== '')",
      },
    ],
    tests,
  },
  {
    name: 'the build keeps a module only imported to compile its Styles',
    edits: [{ file: '../src/vite.ts', find: 'treeshake: false', replace: 'treeshake: true' }],
    tests,
  },
  {
    name: 'the address leaves out the base',
    edits: [
      {
        file: '../src/vite.ts',
        find: 'href: `${config.base}${fileName}`',
        replace: 'href: `/${fileName}`',
      },
    ],
    tests,
  },
  {
    name: 'the file name is not its content’s hash',
    edits: [
      {
        file: '../src/vite.ts',
        find: ".update(css).digest('hex').slice(0, 8)",
        replace: ".update('x').digest('hex').slice(0, 8)",
      },
    ],
    tests,
  },
  {
    name: 'the asset is not written into the browser build',
    edits: [
      {
        file: '../src/vite.ts',
        find: "if (this.environment.name !== 'client') return",
        replace: 'return',
      },
    ],
    tests,
  },
] as const
