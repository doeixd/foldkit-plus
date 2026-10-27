/**
 * The meta-package and its setup guide, broken in turn:
 * `pnpm mutate packages/plus/test/plus.mutations.ts` checks that a test fails
 * for every one.
 */
const tests = [
  'packages/plus/test/generated.test.ts',
  'packages/plus/test/setup.test.ts',
  'packages/plus/test/exports.test.ts',
]

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a workspace package counted as a library, every package an adapter',
    '../scripts/entries.ts',
    "!peer.startsWith('foldkit-') &&",
    '',
  ),
  edit(
    'an optional peer counted as required',
    '../scripts/entries.ts',
    'manifest.peerDependenciesMeta?.[peer]?.optional !== true',
    'true',
  ),
  edit('npm told to add', '../src/setup.ts', "manager === 'npm' ? 'install' : 'add'", "'add'"),
  edit(
    'Foldkit compared by major version only, so 0.163 fits',
    '../src/setup.ts',
    "library === 'foldkit'",
    'false',
  ),
  edit(
    'a declaration file re-exported as an entry point',
    '../scripts/entries.ts',
    "|| source.endsWith('.d.ts'))",
    ')',
  ),
  {
    name: 'an empty folder is not sent to the greenfield guide',
    edits: [
      {
        file: '../src/setup.ts',
        find: '      `- ${GREENFIELD} (in the skill of step 3,',
        replace: '      `- (in the skill of step 3,',
      },
    ],
    tests: ['packages/plus/test/setup.test.ts'],
  },
  {
    name: 'the scaffold command ignores the package manager',
    edits: [
      {
        file: '../src/setup.ts',
        find: '--example counter --package-manager ${manager}`',
        replace: '--example counter --package-manager pnpm`',
      },
    ],
    tests: ['packages/plus/test/setup.test.ts'],
  },
  {
    name: 'a project is not told of the greenfield guide',
    edits: [
      {
        file: '../src/setup.ts',
        find: '    `Building a new application rather than extending one?',
        replace: '    `Extending an application?',
      },
    ],
    tests: ['packages/plus/test/setup.test.ts'],
  },
  {
    name: 'the CLI imports the effect it finds rather than carrying its own',
    edits: [
      {
        file: '../tsdown.config.ts',
        find: "deps: { alwaysBundle: ['effect'] },",
        replace: '',
      },
    ],
    tests: ['packages/plus/test/cli.test.ts'],
  },
]
