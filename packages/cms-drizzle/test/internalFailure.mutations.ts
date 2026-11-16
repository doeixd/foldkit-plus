/**
 * What an author reads when the CMS's server fails (#573), each side of the
 * rule broken in turn: this side's words told, and the CMS's own words for
 * the author withheld. `pnpm mutate packages/cms-drizzle/test/internalFailure.mutations.ts`.
 */
const index = '../src/index.ts'
const tests = ['packages/cms-drizzle/test/drafts.test.ts']

export default [
  {
    name: 'a refusal written for the author is withheld',
    edits: [
      {
        file: index,
        find: "RemoteServer.tell('An archived entry takes no draft')",
        replace: "new RemoteServerError({ message: 'An archived entry takes no draft' })",
      },
    ],
    tests,
  },
  {
    name: 'a draft that cannot be published is told what the Schema said of it',
    edits: [
      {
        file: index,
        find: 'RemoteServer.tell(notReady(error))',
        replace: 'RemoteServer.tell(`This draft is not ready to publish: ${String(error)}`)',
      },
    ],
    tests,
  },
  {
    name: 'a failed scheduled publish keeps a handler’s own words on the draft',
    edits: [
      {
        file: index,
        find: '({ told, message }) => (told === true ? message : SCHEDULE_FAILED)',
        replace: '({ message }) => message',
      },
    ],
    tests,
  },
  {
    name: 'a failed scheduled publish keeps a driver’s words on the draft',
    edits: [
      {
        file: index,
        find: 'Option.some({ own: String(defect), shown: SCHEDULE_FAILED })',
        replace: 'Option.some({ own: String(defect), shown: String(defect) })',
      },
    ],
    tests,
  },
  {
    name: 'a denial of a scheduled publish is kept off the draft',
    edits: [
      {
        file: index,
        find: '        Forbidden: ({ message }) => message,',
        replace: '        Forbidden: () => SCHEDULE_FAILED,',
      },
    ],
    tests,
  },
]
