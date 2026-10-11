/**
 * A guard set's read rules as remote-server's seams, broken in turn:
 * `pnpm mutate packages/guard/test/server.mutations.ts`.
 */
const file = '../src/server.ts'
const tests = ['packages/guard/test/server.test.ts']

export default [
  {
    name: 'a redacted member is omitted instead',
    edits: [{ file, find: "member.deny._tag === 'Redact'", replace: 'false' }],
    tests,
  },
  {
    name: 'a member rule is decided without the fields it reads',
    edits: [
      {
        file,
        find: '...members.flatMap(({ condition }) => Condition.members(condition)),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a member rule always holds',
    edits: [
      {
        file,
        find: 'if (Condition.holds(condition, record.values, input, () => false)) continue',
        replace: 'continue',
      },
    ],
    tests,
  },
  {
    name: 'an inherited Read holds without looking at the related row',
    edits: [
      {
        file,
        find: 'onSome: target => holds(ref.entity, target, new Set([...seen, key])),',
        replace: 'onSome: () => true,',
      },
    ],
    tests,
  },
  {
    name: 'an Entity not given is read by no one',
    edits: [
      {
        file,
        find: 'if (condition === undefined) return true',
        replace: 'if (condition === undefined) return false',
      },
    ],
    tests,
  },
  {
    name: 'a loop of inherited Reads is followed for ever',
    edits: [{ file, find: 'if (seen.has(key)) return false', replace: '' }],
    tests,
  },
]
