/**
 * A check's answer is taken only for the values and subject it was asked
 * about (#303): `pnpm mutate packages/form/test/staleCheck.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/form/test/checks.test.ts']

export default [
  {
    name: 'an answer about other values is taken',
    edits: [
      {
        file,
        find: '(message.values !== undefined && !Equal.equals(message.values, decoded(model))) ||',
        replace: 'false ||',
      },
    ],
    tests,
  },
  {
    name: 'an answer about another subject is taken',
    edits: [
      {
        file,
        find: ' ||\n              (message.subject !== undefined && !Equal.equals(message.subject, model.subject))',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an answer made without its values is asked again',
    edits: [
      {
        file,
        find: '(message.values !== undefined && !Equal.equals(message.values, decoded(model)))',
        replace: '!Equal.equals(message.values, decoded(model))',
      },
    ],
    tests: ['packages/form/test/nested.test.ts'],
  },
  {
    name: 'a stale answer is dropped, not asked again',
    edits: [{ file, find: '                commands: [ask(model, message.key)],', replace: '' }],
    tests,
  },
  {
    // A follower written after its key's check was made gave every follows form a stale answer.
    name: 'a check is asked before the followers are written',
    edits: [
      {
        file,
        find: 'commands: result.asked.map(asked => ask(result.model, asked))',
        replace: 'commands: written.commands',
      },
    ],
    tests: ['packages/form/test/follows.test.ts'],
  },
]
