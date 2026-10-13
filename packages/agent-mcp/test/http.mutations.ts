/**
 * Who an MCP caller is, each step broken in turn: `pnpm mutate
 * packages/agent-mcp/test/http.mutations.ts` checks that a test fails for
 * every one.
 */
const file = '../src/http.ts'
const tests = ['packages/agent-mcp/test/http.test.ts', 'packages/agent-mcp/test/httpApp.test.ts']

export default [
  {
    name: 'a refused caller is served as no one',
    edits: [
      {
        file,
        find: 'if (Result.isFailure(authenticated)) {',
        replace: 'if (Result.isFailure(authenticated) && false) {',
      },
    ],
    tests,
  },
  {
    name: 'a refusal does not say why',
    edits: [
      {
        file,
        find: '...(reason === undefined ? {} : { reason })',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an authenticate that throws escapes the handler',
    edits: [
      {
        file,
        find: 'Effect.suspend(() => authenticate(request))',
        replace: 'authenticate(request)',
      },
    ],
    tests,
  },
  {
    name: 'a broken authenticate refuses the caller instead of saying the server broke',
    edits: [
      {
        file,
        find: "if (authenticated === undefined) return json(500, { error: 'Internal error' })",
        replace: "if (authenticated === undefined) return json(401, { error: 'Unauthenticated' })",
      },
    ],
    tests,
  },
]
