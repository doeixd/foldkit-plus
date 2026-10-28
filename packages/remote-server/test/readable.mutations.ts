/**
 * What a principal may see of rows, broken in turn:
 * `pnpm mutate packages/remote-server/test/readable.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/remote-server/test/readable.test.ts']

export default [
  {
    name: 'a source read skips its filter',
    edits: [{ file, find: '  source.filter === undefined', replace: '  true' }],
    tests,
  },
  {
    name: 'a plan reads only the fields allowed',
    edits: [{ file, find: 'read(plan.fields)', replace: 'read(fields)' }],
    tests,
  },
  {
    name: 'a live patch skips the filter',
    edits: [
      {
        file,
        find: 'const records = yield* readFiltered(source, principal, allowed, fields =>\n              source.read({\n                ids: [ref.id]',
        replace:
          'const records = yield* ((_s: unknown, _p: unknown, a: readonly string[], r: (f: readonly string[]) => any) => r(a))(source, principal, allowed, fields =>\n              source.read({\n                ids: [ref.id]',
      },
    ],
    tests,
  },
  {
    name: 'a row the principal may not read is read by id',
    edits: [
      {
        file,
        find: 'if (row === undefined || !readable(name, row)) return []',
        replace: 'if (row === undefined) return []',
      },
    ],
    tests,
  },
  {
    name: 'a query lists a row the principal may not read',
    edits: [
      {
        file,
        find: '.filter(row => readable(entity, row))',
        replace: '.filter(() => true)',
      },
    ],
    tests,
  },
  {
    name: 'a list keeps a ref to a row the principal may not read',
    edits: [{ file, find: 'return value.filter(shown)', replace: 'return value' }],
    tests,
  },
  {
    name: 'a one ref to a row the principal may not read is kept',
    edits: [{ file, find: 'return shown(value) ? value : null', replace: 'return value' }],
    tests,
  },
  {
    name: 'a readable is given no row to follow',
    edits: [
      {
        file,
        find: '(entity, id) => Option.fromUndefinedOr(table(entity).get(id))',
        replace: '() => Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'a filter may name an Entity the domain lacks',
    edits: [{ file, find: "    ['filter', filter],\n", replace: '' }],
    tests,
  },
]
