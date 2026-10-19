/**
 * The page's light or dark, broken in turn:
 * `pnpm mutate examples/site/test/scheme.mutations.ts`.
 */
const main = '../src/main.ts'
const tests = ['examples/site/test/scheme.test.ts', 'examples/site/test/prerender.test.ts']

export default [
  {
    name: 'the head applies no scheme',
    edits: [
      {
        file: '../src/site.ts',
        find: '`<script>${schemeScript()}</script><style>',
        replace: '`<style>',
      },
    ],
    tests,
  },
  {
    name: 'nothing reads the scheme back at boot',
    edits: [
      { file: main, find: 'boot: () => [ReadPageScheme(), ', replace: 'boot: () => [' },
    ],
    tests,
  },
  {
    name: 'a chosen scheme is shown but not applied',
    edits: [
      { file: main, find: '            commands: [ApplyPageScheme({ scheme })],\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'the scheme read at boot is applied again',
    edits: [
      {
        file: main,
        find: '        : { model: modifyFields(model, { pageScheme: () => scheme }) },\n    AppliedPageScheme',
        replace:
          '        : { model: modifyFields(model, { pageScheme: () => scheme }), commands: [ApplyPageScheme({ scheme })] },\n    AppliedPageScheme',
      },
    ],
    tests,
  },
]
