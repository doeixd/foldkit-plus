/**
 * `foldkit-plus laws`, broken in turn: `pnpm mutate packages/plus/test/laws.mutations.ts`
 * checks that a test fails for every one. These reach `src/laws.ts`, which
 * `laws.test.ts` imports.
 *
 * `src/cli.ts`'s part is not here: `cli.test.ts` builds it from disk, which
 * `pnpm mutate` cannot reach. It was mutated by hand (copy aside, edit, run
 * `npx vitest run packages/plus/test/cli.test.ts --project unit`, copy back):
 * the `laws` branch's usage guard removed, and the report's result printed with
 * `isError: false` whatever it says. Each turns `cli.test.ts` red.
 */
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/laws.ts', find, replace }],
  tests: ['packages/plus/test/laws.test.ts'],
})

export default [
  edit(
    'the named export ignored: always the default',
    "const exportName = hash === -1 ? 'default' : spec.slice(hash + 1)",
    "const exportName = 'default'",
  ),
  edit(
    'a report with findings fails the command',
    'isError: false }',
    'isError: isReport(value) && (value as { findings: Array<unknown> }).findings.length > 0 }',
  ),
  edit(
    'a throw from Laws.check escapes',
    '    return failed(`Laws could not report on the ${named} of ${file}: ${messageOf(error)}`)',
    '    throw error',
  ),
  edit(
    'entryOf takes import before node',
    "[value['node'], value['import'], value['default']]",
    "[value['import'], value['node'], value['default']]",
  ),
  edit(
    'entryOf ignores default',
    "[value['node'], value['import'], value['default']]",
    "[value['node'], value['import']]",
  ),
  edit(
    'a tsx without esm/api falls back to Node',
    'if (Option.isSome(tsx) && Option.isNone(api)) return failed(tsxWithoutApi(tsx.value))',
    '',
  ),
]
