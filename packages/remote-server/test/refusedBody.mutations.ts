/**
 * A refused call's body (workerd drops the next request on the connection
 * when it is left unread), broken in turn:
 * `pnpm mutate packages/remote-server/test/refusedBody.mutations.ts`.
 */
const tests = ['packages/remote-server/test/refusedBody.test.ts']
const workerd = ['packages/plus/test/workers.refusedBody.test.ts']

export default [
  {
    name: 'serveFetch answers a refusal without consuming its body',
    edits: [
      {
        file: '../src/fetch.ts',
        find: '    await discardBody(request, maxBodyBytes)\n',
        replace: '',
      },
    ],
    tests: [...tests, ...workerd],
  },
  {
    name: 'a refusal reads an unbounded body',
    edits: [{ file: '../src/body.ts', find: 'if (total > limit) break', replace: '' }],
    tests,
  },
  {
    name: 'a body is never cancelled once past the limit',
    edits: [
      { file: '../src/body.ts', find: '  await reader.cancel().catch(() => {})\n}', replace: '}' },
    ],
    tests,
  },
]
