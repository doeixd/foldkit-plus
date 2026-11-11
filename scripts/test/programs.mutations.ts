/**
 * The programs the type-reading checks share: `pnpm mutate scripts/test/programs.mutations.ts`.
 */
const file = '../programs.mjs'
const tests = ['scripts/test/programs.test.ts']

export default [
  {
    name: 'projects with different options share a program',
    edits: [{ file, find: 'const key = JSON.stringify(rest)', replace: "const key = ''" }],
    tests,
  },
  {
    name: 'a path mapped to another file is merged over the first',
    edits: [
      {
        file,
        find: 'const group = candidates.find(candidate =>',
        replace: 'const group = candidates.find(candidate => true ||',
      },
    ],
    tests,
  },
  {
    name: 'the paths of a second project are not merged',
    edits: [
      {
        file,
        find: 'for (const [name, targets] of absolute) group.paths.set(name, targets)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the files of a second project are not merged',
    edits: [{ file, find: 'for (const file of files) group.files.add(file)', replace: '' }],
    tests,
  },
]
