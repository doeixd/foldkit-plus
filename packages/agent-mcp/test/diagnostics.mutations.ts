/**
 * What an MCP host reports instead of telling the caller, each report broken
 * in turn: `pnpm mutate packages/agent-mcp/test/diagnostics.mutations.ts`.
 */
const handler = '../src/handler.ts'
const http = '../src/http.ts'
const stdio = '../src/stdio.ts'
const diagnostics = '../src/diagnostics.ts'
const handlerTests = ['packages/agent-mcp/test/handler.test.ts']
const httpTests = ['packages/agent-mcp/test/http.test.ts']
const stdioTests = ['packages/agent-mcp/test/stdio.test.ts']

export default [
  {
    name: 'a capability that dies is not reported',
    edits: [{ file: handler, find: 'void report(capabilityDefect(name, cause))', replace: '' }],
    tests: [...handlerTests, ...stdioTests],
  },
  {
    name: 'a request whose handling throws is not reported',
    edits: [
      { file: handler, find: 'void report(requestDefect(incoming.method, cause))', replace: '' },
    ],
    tests: handlerTests,
  },
  {
    name: 'a tool listing that breaks is not reported',
    edits: [{ file: handler, find: 'void report(toolListDefect(cause))', replace: '' }],
    tests: handlerTests,
  },
  {
    name: "the host's reporter is ignored",
    edits: [
      {
        file: handler,
        find: 'const report = reportTo(options.diagnostics)',
        replace: 'const report = reportTo(undefined)',
      },
    ],
    tests: handlerTests,
  },
  {
    name: "a session's handler is not given the host's reporter",
    edits: [{ file: http, find: '          diagnostics: options.diagnostics,\n', replace: '' }],
    tests: httpTests,
  },
  {
    name: 'a transport that breaks as its session ends is not reported',
    edits: [
      { file: http, find: 'void report(transportEndDefect(session.id, cause))', replace: '' },
    ],
    tests: httpTests,
  },
  {
    name: 'a broken transport is reported as an error',
    edits: [
      {
        file: diagnostics,
        find: "  level: 'warning',\n  message: `a client transport broke",
        replace: "  level: 'error',\n  message: `a client transport broke",
      },
    ],
    tests: httpTests,
  },
  {
    name: 'a capability defect is reported as a warning',
    edits: [
      {
        file: diagnostics,
        find: "  level: 'error',\n  message: `the capability",
        replace: "  level: 'warning',\n  message: `the capability",
      },
    ],
    tests: handlerTests,
  },
  {
    name: 'stdio sends diagnostics to the default log, which is stdout',
    edits: [
      {
        file: stdio,
        find: 'diagnostics: options.diagnostics ?? toStderr,',
        replace: 'diagnostics: options.diagnostics,',
      },
    ],
    tests: stdioTests,
  },
]
