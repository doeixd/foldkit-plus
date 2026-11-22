/**
 * Mutations of the fixes for the Phase 1 review gate, each in the direction of
 * the finding it fixes:
 *   `pnpm mutate packages/metakit/test/phase1-gate.mutations.ts`
 */
const commutes = '../src/transitionCommutes.ts'
const arr = '../src/ops/arr.ts'

const gateTests = ['packages/metakit/test/phase1-gate.test.ts']

const mutation = (
  tests: ReadonlyArray<string>,
  name: string,
  file: string,
  find: string,
  replace: string,
) => ({ name, edits: [{ file, find, replace }], tests })

const commuting = [
  mutation(
    gateTests,
    'different literals are compared as raw values',
    commutes,
    'return Option.exists(literals(wa, wb), ([x, y]) => differ(x, y))',
    'return Option.exists(literals(wa, wb), ([x, y]) => !sameAnswer(x, y))',
  ),
  mutation(
    gateTests,
    'different texts are compared by UTF-16 unit',
    commutes,
    'Node.textIdentity(x) !== Node.textIdentity(y)',
    'x !== y',
  ),
  mutation(gateTests, 'different texts may hold a NUL', commutes, '!Node.holdsNul([x, y]) && ', ''),
  mutation(
    gateTests,
    'two includes or two excludes commute whatever their kinds',
    commutes,
    'return Option.isSome(kx) && Option.isSome(ky) && kx.value === ky.value',
    'return true',
  ),
  mutation(
    gateTests,
    'a removal by key is steady whatever its key may hold',
    commutes,
    'remove: ({ key, value }) => keyed(key, value),',
    'remove: () => true,',
  ),
  mutation(
    gateTests,
    'a patch beside a removal need not be steady',
    commutes,
    'return steady(changed) && !touches(',
    'return !touches(',
  ),
  mutation(
    gateTests,
    'an include stores the text as it was given',
    arr,
    '[...list.slice(0, at), value, ...list.slice(at)]',
    '[...list.slice(0, at), raw, ...list.slice(at)]',
  ),
  mutation(gateTests, 'a set holds -0 as given', arr, '    ? value + 0\n', '    ? value\n'),
]

export default [...commuting]
