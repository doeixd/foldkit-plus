/**
 * The server's renders said to a view's memos, broken in turn:
 * `pnpm mutate packages/ssr/test/serverRender.mutations.ts`.
 */
const file = '../src/context.ts'
const tests = ['packages/ssr/test/serverRender.test.ts']

export default [
  {
    name: 'a server render is never said',
    edits: [
      {
        file,
        find: "global[SERVER_RENDER] = next.mode === 'collect' || next.mode === 'replay'",
        replace: 'global[SERVER_RENDER] = false',
      },
    ],
    tests,
  },
  {
    name: 'the browser’s renders are said to be the server’s',
    edits: [
      {
        file,
        find: "global[SERVER_RENDER] = next.mode === 'collect' || next.mode === 'replay'",
        replace: 'global[SERVER_RENDER] = true',
      },
    ],
    tests,
  },
  {
    name: 'it stays set after the render',
    edits: [{ file, find: '    global[SERVER_RENDER] = rendering\n', replace: '' }],
    tests,
  },
  {
    name: "a post draws the application's view while it rebuilds the Model",
    edits: [
      {
        file: '../src/index.ts',
        find: "view: (_model: unknown, h: HtmlBuilder<unknown>) => ({ title: '', body: h.div([], []) }),",
        replace: '',
      },
    ],
    tests,
  },
]
