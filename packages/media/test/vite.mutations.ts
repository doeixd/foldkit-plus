/**
 * The icons plugin, broken in turn:
 * `pnpm mutate packages/media/test/vite.mutations.ts` checks that a test
 * fails for every one.
 */
const plugin = '../src/vite/index.ts'
const tests = ['packages/media/test/vite.test.ts']

export default [
  {
    name: 'a name starting with a digit is exported as it is',
    edits: [{ file: plugin, find: '/^[0-9]/.test(camel) ?', replace: 'false ?' }],
    tests,
  },
  {
    name: 'two icons imported by one name overwrite each other',
    edits: [{ file: plugin, find: 'if (earlier !== undefined) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'any set name is taken',
    edits: [{ file: plugin, find: 'if (!SET_NAME.test(name)) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a set given twice is taken',
    edits: [{ file: plugin, find: 'if (twice !== undefined) throw', replace: 'if (false) throw' }],
    tests,
  },
  {
    name: 'an Iconify icon the parser refuses fails the whole set',
    edits: [
      {
        file: plugin,
        find: 'refused.push([name, error instanceof Error ? error.message : String(error)])',
        replace: 'throw error',
      },
    ],
    tests,
  },
  {
    name: 'the declaration does not say what was left out',
    edits: [{ file: plugin, find: '...refused.map(', replace: '...[].map(' }],
    tests,
  },
  {
    name: 'the declaration types every icon as anything',
    edits: [{ file: plugin, find: '`  const i${at}: IconData`', replace: '`  const i${at}: any`' }],
    tests,
  },
  {
    name: 'every file in a folder is an icon',
    edits: [{ file: plugin, find: ".filter(file => extname(file) === '.svg')", replace: '' }],
    tests,
  },
  {
    name: 'dts: false still writes one',
    edits: [{ file: plugin, find: 'if (options.dts === false) return', replace: '' }],
    tests,
  },
  {
    name: 'the declaration is written on every build',
    edits: [
      {
        file: plugin,
        find: 'if (current !== text) writeFileSync(path, text)',
        replace: 'writeFileSync(path, text)',
      },
    ],
    tests,
  },
  {
    name: 'an import of a set not given loads nothing',
    edits: [{ file: plugin, find: 'if (!all().includes(name)) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a set file is read without its Schema',
    edits: [
      {
        file: plugin,
        find: 'Schema.decodeUnknownSync(IconifySet)(JSON.parse(',
        replace: '(JSON.parse(',
      },
    ],
    tests,
  },
  {
    name: 'a file added while serving keeps the set read before it',
    edits: [{ file: plugin, find: 'read.delete(changed[0])', replace: '' }],
    tests,
  },
  {
    name: 'a refused file added while serving ends the server',
    edits: [
      {
        file: plugin,
        find: 'server.config.logger.error(error instanceof Error ? error.message : String(error))',
        replace: 'throw error',
      },
    ],
    tests,
  },
  {
    name: 'a file added while serving leaves the module as it was',
    edits: [
      {
        file: plugin,
        find: 'if (module !== undefined) environment.moduleGraph.invalidateModule(module)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an alias spelt like its icon is read as a second icon by that name',
    edits: [{ file: plugin, find: 'if (exported.get(as) === drawn(name)) continue', replace: '' }],
    tests,
  },
  {
    name: 'any alias whose name is taken is left out, even one naming another icon',
    edits: [
      {
        file: plugin,
        find: 'if (exported.get(as) === drawn(name)) continue',
        replace: 'if (exported.has(as)) continue',
      },
    ],
    tests,
  },
]
