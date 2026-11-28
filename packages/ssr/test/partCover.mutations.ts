/**
 * A read of a path a resume part restores (a Remote store `Remote.resume`
 * carries) is covered by that part when it is a read the part resumes, and by
 * nothing else, each step broken in turn:
 * `pnpm mutate packages/ssr/test/partCover.mutations.ts` checks that a test
 * fails for each.
 */
const index = '../src/index.ts'
const tests = [
  'packages/ssr/test/coverage.test.ts',
  'packages/ssr/test/parts.test.ts',
  'packages/ssr/test/family.test.ts',
]
const restores = 'coveredBy(part.restores ?? [])'
const resumes = 'part.covers.some(name => reads.includes(name))'

export default [
  {
    name: 'a path no part restores is covered as if one did',
    edits: [{ file: index, find: restores, replace: 'true' }],
    tests,
  },
  {
    name: 'a path a part restores is not covered by it',
    edits: [{ file: index, find: restores, replace: 'false' }],
    tests,
  },
  {
    name: 'a plain reference to a restored path is covered though the part resumes no read of it',
    edits: [{ file: index, find: resumes, replace: 'true' }],
    tests,
  },
  {
    name: 'a read is covered by a part without the metadata it carries being asked',
    edits: [
      {
        file: index,
        find: 'cover: coverOf(path, plan, names),',
        replace: 'cover: coverOf(path, plan),',
      },
    ],
    tests,
  },
]
