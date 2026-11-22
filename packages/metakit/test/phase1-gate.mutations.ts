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

const nullStrict = 'packages/metakit/test/null-strict.test.ts'
const propertyTests = ['packages/metakit/test/properties.test.ts']

const unsafeOperands = [
  mutation(
    gateTests,
    'arithmetic takes an operand past the safe range',
    '../src/ops/num.ts',
    'if (unsafe !== undefined) {',
    'if (false) {',
  ),
  mutation(
    [...gateTests, nullStrict],
    'an identity returns a number that may be past the safe range',
    '../src/ops/laws.ts',
    "(op.returns !== 'number' || view.safe(operand))",
    'true',
  ),
  mutation(
    [...gateTests, nullStrict],
    'partial evaluation takes every read as a safe number',
    '../src/ops/residualize.ts',
    'safe: isSafeRead,',
    'safe: () => true,',
  ),
  mutation(
    gateTests,
    'the judge takes every read as a safe number',
    '../src/ops/judge.ts',
    '? judged.path !== undefined && isSafeRead(judged.path)',
    '? true',
  ),
  mutation(
    [...gateTests, nullStrict],
    'a finite number read is a safe number',
    '../src/ops/kind.ts',
    'SchemaAST.isNumber(member) && declares(member.checks, INT)',
    'SchemaAST.isNumber(member)',
  ),
  mutation(
    gateTests,
    'the checker reads only the result’s range',
    '../src/abstract/state.ts',
    '[node, ...node.args].every(',
    '[node].every(',
  ),
  mutation(
    gateTests,
    'the prover reads only the result’s range',
    '../src/prove/lower.ts',
    'z3.Or(unsafe(x), unsafe(y), unsafe(result))',
    'unsafe(result)',
  ),
  mutation(
    propertyTests,
    'an identity is checked over numbers past the safe range',
    '../src/propertyChecks.ts',
    "x => op.returns !== 'number' || typeof x !== 'number' || isSafeNumber(x),",
    'x => x !== undefined,',
  ),
]

export default [...commuting, ...unsafeOperands]
