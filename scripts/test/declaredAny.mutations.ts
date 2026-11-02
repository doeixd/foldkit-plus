/**
 * The build's check for declarations published as `any`:
 * `pnpm mutate scripts/test/declaredAny.mutations.ts`.
 */
const file = '../declared-any.mjs'
const tests = ['scripts/test/declaredAny.test.ts']

export default [
  {
    name: 'a variable declared any is published',
    edits: [
      { file, find: String.raw`(?:const|let|var)\s+${'$'}{name}\s*:\s*any`, replace: 'never' },
    ],
    tests,
  },
  {
    name: 'a type alias of any is published',
    edits: [{ file, find: String.raw`(?:<[^=]*>)?\s*=\s*any`, replace: 'never' }],
    tests,
  },
  {
    name: 'a function returning any is published',
    edits: [{ file, find: String.raw`\([^;]*?\)\s*:\s*any`, replace: 'never' }],
    tests,
  },
  {
    name: 'a declaration carries into the next',
    edits: [
      {
        file,
        find: String.raw`\([^;]*?\)\s*:\s*any\s*;`,
        replace: String.raw`\([\s\S]*?\)\s*:\s*any\s*;`,
      },
    ],
    tests,
  },
  {
    name: 'a property typed any is refused',
    edits: [
      {
        file,
        find: String.raw`(?:const|let|var)\s+`,
        replace: String.raw`(?:(?:const|let|var)\s+)?`,
      },
    ],
    tests,
  },
  {
    name: 'a declaration is matched mid-line, as in a doc comment',
    edits: [
      {
        file,
        find: String.raw`^[ \t]*(?:export\s+)?(?:declare\s+)?(?:const`,
        replace: String.raw`(?:export\s+)?(?:declare\s+)?(?:const`,
      },
    ],
    tests,
  },
]
