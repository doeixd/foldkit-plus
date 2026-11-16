/**
 * What a write answers an author who may not read unpublished work (#577),
 * the one gate every operation passes broken in turn:
 * `pnpm mutate packages/cms-drizzle/test/unread.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/cms-drizzle/test/unread.test.ts']

export default [
  {
    name: 'an operation answers one who may not read as it answers one who may',
    edits: [{ file, find: "(yield* isAuthor(context.principal, 'Read'))", replace: 'true' }],
    tests,
  },
  {
    name: 'a write made by one who may not read answers its rows',
    edits: [
      {
        file,
        find: 'Effect.map(({ output }): MutationOutcome<Output> => ({ output })),',
        replace: 'Effect.map((outcome): MutationOutcome<Output> => outcome),',
      },
    ],
    tests,
  },
  {
    name: 'a sentence about the entry is told to one who may not read it',
    edits: [
      {
        file,
        find: 'RemoteServerError: error => (error.told === true ? missing : error),',
        replace: 'RemoteServerError: error => error,',
      },
    ],
    tests,
  },
  {
    name: 'a failure of this side is answered as an entry that is not there',
    edits: [
      {
        file,
        find: 'RemoteServerError: error => (error.told === true ? missing : error),',
        replace: 'RemoteServerError: () => missing,',
      },
    ],
    tests,
  },
  {
    name: 'a declared refusal is told to one who may not read the entry',
    edits: [
      {
        file,
        find: 'MutationRefused: () => missing,',
        replace: 'MutationRefused: refused => refused,',
      },
    ],
    tests,
  },
  {
    name: 'a denial about the entry is told to one who may not read it',
    edits: [{ file, find: 'Forbidden: () => missing,', replace: 'Forbidden: denied => denied,' }],
    tests,
  },
  {
    name: 'what a type’s own handler said of a draft is told to one who may not read it',
    edits: [
      {
        file,
        find: 'Unauthenticated: () => missing,',
        replace: 'Unauthenticated: ended => ended,',
      },
    ],
    tests,
  },
  {
    name: 'what was sent is not judged before the entry is looked up',
    edits: [
      {
        file,
        find: 'if (steps.accepts !== undefined) yield* steps.accepts(context.input)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a save that names what it was made from is answered as a first save is',
    edits: [
      {
        file,
        find: "input.basedOn === null\n          ? RemoteServer.tell('This draft cannot be saved as this entry')",
        replace: "true\n          ? RemoteServer.tell('This draft cannot be saved as this entry')",
      },
    ],
    tests,
  },
  {
    name: 'a first save of a taken id is answered as a discarded draft',
    edits: [
      {
        file,
        find: "input.basedOn === null\n          ? RemoteServer.tell('This draft cannot be saved as this entry')",
        replace: "false\n          ? RemoteServer.tell('This draft cannot be saved as this entry')",
      },
    ],
    tests,
  },
]
