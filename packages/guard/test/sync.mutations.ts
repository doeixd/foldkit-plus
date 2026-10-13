/**
 * A guard set's rules on Sync's cell edits, broken in turn:
 * `pnpm mutate packages/guard/test/sync.mutations.ts`.
 */
const file = '../src/sync.ts'
const tests = ['packages/guard/test/sync.test.ts']

export default [
  {
    name: 'a document may edit a member with a Read rule of its own',
    edits: [
      {
        file,
        find: "surfaceOf(attachment, { _tag: 'Member', member, interaction: 'Read' })",
        replace: 'Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'a reader need not be in the rows’ Read rule',
    edits: [{ file, find: 'if (!named) fail(', replace: 'if (false) fail(' }],
    tests,
  },
  {
    name: 'a guarded row needs no readers',
    edits: [{ file, find: 'if (options.readers.length === 0)', replace: 'if (false)' }],
    tests,
  },
  {
    name: 'always may read the row',
    edits: [
      {
        file,
        find: "if (attachment.always.some(rule => rule._tag !== 'PrincipalGuard' && !isAnyone(rule)))",
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'anyone opens the document',
    edits: [
      {
        file,
        find: '(document.readers.length === 0 || readers.some(Boolean)) && rules.every(Boolean)',
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'a reader need not pass always',
    edits: [
      {
        file,
        find: '(document.readers.length === 0 || readers.some(Boolean)) && rules.every(Boolean)',
        replace: '(document.readers.length === 0 || readers.some(Boolean))',
      },
    ],
    tests,
  },
  {
    name: 'the lock refuses no row rule the principal guards settled',
    edits: [{ file, find: 'if (isNever(row.condition)) return refusal(row.deny)', replace: '' }],
    tests,
  },
  {
    name: 'the lock refuses no member',
    edits: [
      {
        file,
        find: 'return first(members, condition => !isNever(condition))',
        replace: 'return true',
      },
    ],
    tests,
  },
  {
    name: 'a row the principal cannot see is admitted',
    edits: [
      {
        file,
        find: 'if (Option.isNone(current)) return refusal(row.deny)',
        replace: 'if (Option.isNone(current)) continue',
      },
    ],
    tests,
  },
  {
    name: 'a row is not checked as it is',
    edits: [{ file, find: 'if (before !== true) return before', replace: '' }],
    tests,
  },
  {
    name: 'a row is not checked as it would be',
    edits: [{ file, find: 'if (moved !== true) return moved', replace: '' }],
    tests,
  },
  {
    name: 'a refusal drops its explanation',
    edits: [
      {
        file,
        find: 'Explain: ({ reason }): AuthorizeDecision => ({ allowed: false, reason }),',
        replace: 'Explain: (): AuthorizeDecision => false,',
      },
    ],
    tests,
  },
  {
    name: 'a document that names no readers is no one’s',
    edits: [
      {
        file,
        find: '(document.readers.length === 0 || readers.some(Boolean))',
        replace: 'readers.some(Boolean)',
      },
    ],
    tests,
  },
  {
    name: 'a document may name what is not a field',
    edits: [
      {
        file,
        find: 'if (!Object.hasOwn(entity.fields, member)) fail(',
        replace: 'if (false) fail(',
      },
    ],
    tests,
  },
  {
    name: 'an edit outside the document is judged',
    edits: [
      {
        file,
        find: 'return document.members.includes(member)',
        replace: 'return Object.hasOwn(entity.fields, member)',
      },
    ],
    tests,
  },
  {
    name: 'a value is not encoded by its member',
    edits: [
      {
        file,
        find: 'Schema.encodeUnknownOption(schema)(change.value)',
        replace: 'Option.some(change.value)',
      },
    ],
    tests,
  },
  {
    name: "a row's edits are judged one by one",
    edits: [
      {
        file,
        find: 'byRow.set(id, { ...byRow.get(id), [member]: value })',
        replace: 'byRow.set(id, { [member]: value })',
      },
    ],
    tests,
  },
]
