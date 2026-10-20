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
]
