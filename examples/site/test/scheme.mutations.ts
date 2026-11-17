/**
 * The page's light or dark, broken in turn:
 * `pnpm mutate examples/site/test/scheme.mutations.ts`.
 */
const shell = '../src/shell.ts'
const tests = ['examples/site/test/scheme.test.ts', 'examples/site/test/prerender.test.ts']

export default [
  {
    name: 'the head applies no scheme',
    edits: [
      {
        file: '../src/head.ts',
        find: '`<script>${schemeScript()}</script><script>',
        replace: '`<script>',
      },
    ],
    tests,
  },
  {
    name: 'nothing reads the scheme back at boot',
    edits: [{ file: shell, find: 'boot: () => [ReadPageScheme()]', replace: 'boot: () => []' }],
    tests,
  },
  {
    name: 'a chosen scheme is shown but not applied',
    edits: [
      { file: shell, find: '            commands: [ApplyPageScheme({ scheme })],\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'the scheme read at boot is applied again',
    edits: [
      {
        file: shell,
        find: '        : { model: modifyFields(model, { pageScheme: () => scheme }) },\n    AppliedPageScheme',
        replace:
          '        : { model: modifyFields(model, { pageScheme: () => scheme }), commands: [ApplyPageScheme({ scheme })] },\n    AppliedPageScheme',
      },
    ],
    tests,
  },
]
