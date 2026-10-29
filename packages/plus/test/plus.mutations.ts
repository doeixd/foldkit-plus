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
  edit(
    'an ssg or ssr scaffold is told to take an example',
    '../src/setup.ts',
    '--rendering <ssg|ssr> --package-manager',
    '--rendering <ssg|ssr> --example counter --package-manager',
  ),
  edit(
    'a `.gitattributes` the project has is written over',
    '../src/setup.ts',
    '...(found.gitattributes',
    '...(false',
  ),
  edit(
    'the `.gitattributes` it gives does not keep LF',
    '../src/setup.ts',
    "'* text=auto eol=lf',",
    "'* text=auto',",
  ),
  {
    name: 'a `.gitattributes` above the repository counts',
    edits: [
      {
        file: '../src/project.ts',
        find: "if (existsSync(join(at, '.git')) || dirname(at) === at) break",
        replace: 'if (dirname(at) === at) break',
      },
    ],
    tests: ['packages/plus/test/project.test.ts'],
  },
  {
    name: 'a `.gitattributes` at the repository root is missed',
    edits: [
      {
        file: '../src/project.ts',
        find: "projectFolders(folder).some(at => existsSync(join(at, '.gitattributes')))",
        replace: "existsSync(join(folder, '.gitattributes'))",
      },
    ],
    tests: ['packages/plus/test/project.test.ts'],
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
  edit(
    'npm overrides a dependency of the project at a version the project does not name',
    '../src/setup.ts',
    'effectPackages.filter(name => direct.has(name))',
    'effectPackages.filter(() => false)',
  ),
  edit(
    'an Effect package the project names stays where it was',
    '../src/setup.ts',
    "const moved = new Set(['effect', '@effect/platform-browser', ...listed])",
    "const moved = new Set(['effect', '@effect/platform-browser'])",
  ),
  edit(
    'pnpm is not let past Foldkit’s exact peers',
    '../src/setup.ts',
    'peerDependencyRules: {',
    'peerDependencyRule: {',
  ),
  edit(
    'the install leaves ranges to float',
    '../src/setup.ts',
    '    true,\n  )',
    '    false,\n  )',
  ),
  edit(
    'a range is left to the shell',
    '../src/setup.ts',
    'spec => (/^[\\w@/.-]+$/.test(spec) ? spec : `"${spec}"`)',
    'spec => spec',
  ),
  edit(
    'an adapter library is named bare',
    '../scripts/entries.ts',
    '.map(([peer, range]) => `${peer}@${range}`)',
    '.map(([peer]) => peer)',
  ),
  edit(
    'setup installs the Effect Foldkit names, not the one tested',
    '../scripts/entries.ts',
    '({ foldkit: foldkit.version, effect: effect.version })',
    "({ foldkit: foldkit.version, effect: '4.0.0' })",
  ),
  {
    name: "a pnpm workspace member's pins stay in its own package.json",
    edits: [
      {
        file: '../src/project.ts',
        find: "projectFolders(folder).find(at => existsSync(join(at, 'pnpm-workspace.yaml')))",
        replace: "[folder].find(at => existsSync(join(at, 'pnpm-workspace.yaml')))",
      },
    ],
    tests: ['packages/plus/test/project.test.ts'],
  },
  {
    name: "the root's pnpm field is passed over for the YAML",
    edits: [
      {
        file: '../src/project.ts',
        find: "file: field ? 'package.json' : 'pnpm-workspace.yaml',",
        replace: "file: 'pnpm-workspace.yaml',",
      },
    ],
    tests: ['packages/plus/test/project.test.ts'],
  },
  edit(
    'the YAML pins are written as package.json fields',
    '../src/setup.ts',
    "if (manager === 'pnpm' && pnpmSettings.file === 'pnpm-workspace.yaml') {",
    'if (false) {',
  ),
  edit(
    "a project is not given the skill's AGENTS.md block",
    '../src/setup.ts',
    'Paste the block in its \\`references/agents-md.md\\` (${AGENTS_BLOCK})',
    'Paste the block',
  ),
]
