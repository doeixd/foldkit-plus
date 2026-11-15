/**
 * An input judged over the row it edits, each step broken in turn:
 * `pnpm mutate packages/entity/test/judgeOver.mutations.ts`.
 */
const tests = ['packages/entity/test/judgeOver.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/invariant.ts', find, replace }],
  tests,
})

export default [
  edit(
    'the row is dropped from the judgement',
    'if (options.over === undefined) return',
    'if (true) return',
  ),
  edit(
    'the row is not the row before',
    'return judgeAgainst(invariants, { after, before: options.over }, operators)',
    'return judgeAgainst(invariants, { after }, operators)',
  ),
  edit(
    'the input is not laid over the row',
    'for (const [key, held] of Object.entries(row)) put(after, key, held)',
    '',
  ),
  edit(
    'a one relation is left out of the row',
    'Option.map(linkId(value[link.key]), id => put(row, link.key, id))',
    '',
  ),
  edit(
    'judgedBy names nothing',
    'for (const key of reads) if (!sets.has(key)) put(read, key, true)',
    '',
  ),
  edit(
    'judgedBy names what an invariant reading nothing of the input reads',
    'if (!reads.some(key => sets.has(key))) continue',
    '',
  ),
  edit(
    'judgedBy reads only the row after',
    'const reads = [...held.after, ...held.before]',
    'const reads = [...held.after]',
  ),
]
