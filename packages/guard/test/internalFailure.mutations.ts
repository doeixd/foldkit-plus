/**
 * What a caller reads when a guarded server fails (#573), each side of the
 * rule broken in turn: this side's words told, and a rule's own explanation
 * withheld. `pnpm mutate packages/guard/test/internalFailure.mutations.ts`.
 */
const drizzle = '../src/drizzle.ts'
const server = '../src/server.ts'
const canary = 'packages/guard/test/internalFailure.test.ts'

export default [
  {
    name: 'a Read rule’s compile error is told to who asked',
    edits: [
      {
        file: drizzle,
        find: "                  message: `${name}'s Read rule could not be compiled to SQL`,\n                  cause,\n",
        replace: '                  message: String(cause),\n                  told: true,\n',
      },
    ],
    tests: [canary],
  },
  {
    name: 'a Read rule’s compile error is left out of the report',
    edits: [
      {
        file: drizzle,
        find: "                  message: `${name}'s Read rule could not be compiled to SQL`,\n                  cause,\n",
        replace: "                  message: `${name}'s Read rule could not be compiled to SQL`,\n",
      },
    ],
    tests: [canary],
  },
  {
    name: 'the members a Read rule hides are named to the writer they are hidden from',
    edits: [
      {
        file: server,
        find: 'which a Read rule hides from its writer`,\n',
        replace: 'which a Read rule hides from its writer`,\n                  told: true,\n',
      },
    ],
    tests: ['packages/guard/test/write.test.ts'],
  },
  {
    name: 'a row that kept moving is told to its writer',
    edits: [
      {
        file: server,
        find: '                    message: `${entity.name} ${id} changed while it was written`,\n',
        replace:
          '                    message: `${entity.name} ${id} changed while it was written`,\n                    told: true,\n',
      },
    ],
    tests: ['packages/guard/test/pinned.test.ts'],
  },
  {
    name: 'a rule’s explanation is withheld from its reader',
    edits: [
      {
        file: server,
        find: 'Explain: ({ reason }) => RemoteServer.forbid(reason),',
        replace: 'Explain: () => RemoteServer.forbid(),',
      },
    ],
    tests: [canary],
  },
]
