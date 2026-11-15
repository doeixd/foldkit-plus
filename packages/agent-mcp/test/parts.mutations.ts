/**
 * `app://parts`, broken in turn: `pnpm mutate packages/agent-mcp/test/parts.mutations.ts`.
 */
const file = '../src/handler.ts'
const tests = ['packages/agent-mcp/test/parts.test.ts']

export default [
  {
    name: 'app://parts is listed for a runtime with no parts',
    edits: [{ file, find: 'agent.parts.ids.length > 0 &&', replace: '' }],
    tests,
  },
  {
    name: 'app://parts takes the place of a declared resource of that name',
    edits: [
      {
        file,
        find: "agent.parts.ids.length > 0 && !agent.definition.resources.some(r => r.name === 'parts')",
        replace: 'agent.parts.ids.length > 0',
      },
    ],
    tests,
  },
  {
    name: 'an absent value is written as null',
    edits: [
      {
        file,
        find: '...Option.match(part.value, { onNone: () => ({}), onSome: value => ({ value }) }),',
        replace: 'value: Option.getOrNull(part.value),',
      },
    ],
    tests,
  },
]
