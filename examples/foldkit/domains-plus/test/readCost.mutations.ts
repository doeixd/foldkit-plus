/**
 * A read builds what it names, and refuses what is no name:
 * `pnpm mutate examples/foldkit/domains-plus/test/readCost.mutations.ts`.
 */
const tests = ['examples/foldkit/domains-plus/test/readCost.test.ts']
const remote = '../src/server/remote.ts'

export default [
  {
    name: "a read builds each label's whole catalog",
    edits: [
      {
        file: remote,
        find: "import { makeDemoDomain } from '../shared/demoDomains'",
        replace: "import { makeDemoDomain, makeDemoDomains } from '../shared/demoDomains'",
      },
      {
        file: remote,
        find: 'rowOf(makeDemoDomain(label, tld))',
        replace: 'rowOf(makeDemoDomains(label).find(domain => domain.name === id)!)',
      },
    ],
    tests,
  },
  {
    name: 'an extension the demo does not know is read',
    edits: [{ file: remote, find: 'tlds.has(tld)', replace: 'true' }],
    tests,
  },
  {
    name: 'a name with no label is read',
    edits: [{ file: remote, find: 'isLabel(label) && ', replace: '' }],
    tests,
  },
  {
    name: 'a name with no dot is read',
    edits: [{ file: remote, find: 'dot > 0 && ', replace: '' }],
    tests,
  },
]
