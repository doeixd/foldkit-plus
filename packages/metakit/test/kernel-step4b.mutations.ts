/**
 * The meanings step 4's differential asked for, broken in each reader:
 * `eq.among` of no candidate, NaN in `eq.equals` and `eq.among`, a refusal
 * before null and not absorbed, the fold beside a known null, and
 * `Text.schema`:
 *   `pnpm mutate packages/metakit/test/kernel-step4b.mutations.ts`
 */
const node = '../src/node.ts'
const eq = '../src/ops/eq.ts'
const bool = '../src/ops/bool.ts'
const kind = '../src/ops/kind.ts'
const residualize = '../src/ops/residualize.ts'
const laws = '../src/ops/laws.ts'
const textChecks = '../src/ops/textChecks.ts'
const evaluate = '../src/ops/eval.ts'
const propertyChecks = '../src/propertyChecks.ts'
const abstractOps = '../src/abstract/ops.ts'
const values = '../src/abstract/values.ts'
const fields = '../src/abstract/fields.ts'
const state = '../src/abstract/state.ts'
const proveLower = '../src/prove/lower.ts'
const proveText = '../src/prove/text.ts'
const shape = '../src/prove/shape.ts'

const step = ['packages/metakit/test/kernel-step4b.test.ts']
const withEntity = [...step, 'packages/entity/test/lower.test.ts']
const withProperties = [...step, 'packages/metakit/test/properties.test.ts']
const foreign = ['packages/metakit/test/foreign.test.ts']

const mutation = (
  tests: ReadonlyArray<string>,
  name: string,
  file: string,
  find: string,
  replace: string,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  // eq.among of no candidate.
  mutation(
    step,
    'a null value among no candidate is null',
    eq,
    'if (candidates.length === 0) return false',
    'if (candidates.length === 0 && needle !== null) return false',
  ),
  mutation(
    withEntity,
    'a list not given is ill-typed, not null',
    eq,
    'if (candidates === null) return null',
    '',
  ),
  mutation(
    step,
    'partial evaluation takes a value that may be refused as among no candidate',
    laws,
    'list.length === 0 && (view.isRead(left) || view.cannotRefuse(left))',
    'list.length === 0',
  ),
  mutation(
    step,
    'the checker decides nothing among no candidate',
    abstractOps,
    "      if (noCandidate(candidates)) {\n        return state.notRefused(needle!) ? refuted() : Verdict.Unknown('the value may be refused')\n      }\n",
    '',
  ),
  mutation(
    step,
    'the checker takes among no candidate of a null value to have no value',
    abstractOps,
    '      noCandidate(candidates)\n        ? state.notRefused(needle!)\n        : state.hasValue(needle!) &&',
    '      state.hasValue(needle!) &&',
  ),
  mutation(
    step,
    'among no candidate marks its value portable, which it never read',
    state,
    "if (call.op.id === 'eq.among' && noCandidate(call.args[1])) return",
    '',
  ),
  mutation(
    step,
    'the solver takes a null value among no candidate as null',
    proveLower,
    'if (candidates.length === 0) return nullSafe([needle!], never)',
    '',
  ),
  // NaN in eq.equals and eq.among.
  mutation(
    step,
    'eq.equals compares NaN',
    eq,
    "  refuses: value => Node.refusedForEquality('eq.equals', value),\n",
    '',
  ),
  mutation(
    step,
    'an equality takes NaN',
    node,
    'return Number.isNaN(value) ? unordered(at) : undefined',
    'return undefined',
  ),
  mutation(
    step,
    'the checker takes a comparison of a number that may be NaN as not refused',
    values,
    '(!refusesNaN.has(node.op.id) || node.args.every(arg => notNaN.call(this, arg)))',
    'true',
  ),
  {
    ...mutation(
      step,
      'the checker takes what coalesce gives back as never NaN',
      values,
      "Call: ({ op, args }) => op.returns !== 'operand' || args.every(arg => notNaN.call(this, arg)),",
      'Call: () => true,',
    ),
    survives:
      'notRefused asks notNaN only of operands it already holds not refused, and a coalesce (a Value row) is that only where it has a value, which rules out NaN; the guard keeps the claim true should that change.',
  },
  // A refusal decides before null and is not absorbed.
  mutation(
    step,
    'null decides before an operand a strict operation refuses',
    node,
    '    const refuses = isForeign(op) ? undefined : op.refuses',
    '    if (values.includes(null)) return null\n    const refuses = isForeign(op) ? undefined : op.refuses',
  ),
  mutation(
    step,
    'false absorbs a refusal in and, and true in or',
    bool,
    '    const refused = args.find(Node.isRefusal)\n    if (refused !== undefined) return refused\n    if (args.includes(decided)) return decided',
    '    if (args.includes(decided)) return decided\n    const refused = args.find(Node.isRefusal)\n    if (refused !== undefined) return refused',
  ),
  mutation(
    step,
    'partial evaluation drops an operand that may be refused',
    laws,
    'unlessRefused !== true || view.cannotRefuse(operand)',
    'true',
  ),
  mutation(
    withProperties,
    'the absorbing check skips a refusal whatever the table says',
    propertyChecks,
    'absorbing.unlessRefused === true ? awkward.filter(x => !Node.isRefusal(x)) : awkward',
    'awkward.filter(x => !Node.isRefusal(x))',
  ),
  mutation(
    step,
    'the checker lets a decided operand absorb one that may be refused',
    abstractOps,
    '  if (!decisive(direct)) return direct\n  const settled',
    '  return direct\n  const settled',
  ),
  mutation(
    step,
    'the checker proves or by cases where the other side may be refused',
    abstractOps,
    '|| !state.hasValue(a) || !state.notRefused(b)) return direct',
    '|| !state.hasValue(a)) return direct',
  ),
  mutation(
    step,
    'the solver lets a decided operand absorb a refusal',
    proveLower,
    '      const refused = anyRefused(args)\n      const settled = z3.And(z3.Not(refused), z3.Or(...args.map(settles)))',
    '      const settled = z3.Or(...args.map(settles))\n      const refused = z3.And(z3.Not(settled), anyRefused(args))',
  ),
  // The fold beside a known null, and what cannot be refused.
  mutation(
    step,
    'a strict call beside a known null folds to null whatever else it holds',
    laws,
    'args.every((arg, index) => isNull(index) || view.cannotRefuse(arg))',
    'true',
  ),
  mutation(
    step,
    'a strict call beside a known null is never folded',
    residualize,
    'if (nullBesideUnrefused(residual, op, nextArgs)) return Node.Lit({ value: null })',
    '',
  ),
  mutation(
    step,
    'a path cannot be refused whatever its Schema',
    kind,
    'Path: ({ ast }) => Option.exists(ast, admitsNoRefusable),',
    'Path: () => true,',
  ),
  mutation(
    step,
    'a call over operands of the wrong kind cannot be refused',
    kind,
    'unrefused && (kind === undefined || Option.exists(each, operand => operand === kind)),',
    'unrefused,',
  ),
  // Text.
  mutation(
    step,
    'every string is Text',
    kind,
    'export const isText = (ast: SchemaAST.AST): boolean =>\n  SchemaAST.isString(ast) &&',
    'export const isText = (ast: SchemaAST.AST): boolean =>\n  SchemaAST.isString(ast) ||',
  ),
  mutation(
    step,
    'the checker reads no field as Text',
    fields,
    "set({ kind: 'text', nulFree: isText(only) })",
    "set({ kind: 'text', nulFree: false })",
  ),
  mutation(
    step,
    'the checker takes a Text field to hold a NUL',
    values,
    "(info.kind === 'text' && info.nulFree) ||",
    '',
  ),
  mutation(
    step,
    'the solver reads no field as Text',
    shape,
    "return info('text', { text: textChecksOf(inner) })",
    "return info('text', { text: { ...textChecksOf(inner), nulFree: false } })",
  ),
  mutation(
    step,
    'the solver takes a Text field to hold a NUL',
    proveText,
    'info.text.nulFree ||',
    '',
  ),
  // A lone surrogate is U+FFFD to every reader.
  mutation(
    step,
    'the solver gives a lone surrogate a code of its own',
    proveLower,
    'const text = Node.wellFormed(raw)',
    'const text = raw',
  ),
  mutation(
    step,
    'a match compares raw text',
    evaluate,
    'if (held === Node.wellFormed(value)) return { arm }',
    'if (target === value) return { arm }',
  ),
  mutation(
    step,
    'the checker keeps a raw literal as a fact',
    abstractOps,
    'Node.textIdentity(lit.value ?? null)',
    'lit.value ?? null',
  ),
  mutation(
    step,
    'the checker matches a raw value',
    '../src/abstract/matches.ts',
    'if (Node.wellFormed(k) === held) return Option.some(arm)',
    'if (k === value) return Option.some(arm)',
  ),
  // Text written to a field with checks.
  mutation(
    step,
    'the checker fits text to a check it does not model',
    '../src/abstract/fits.ts',
    '      if (!checks.modelled) return unknown\n',
    '',
  ),
  mutation(
    step,
    'the checker fits text that may hold a NUL to Text',
    '../src/abstract/fits.ts',
    '      if (checks.nulFree && !made && !state.portable(value)) return unknown\n',
    '',
  ),
  mutation(
    step,
    'the checker ignores a minimum length',
    '../src/abstract/fits.ts',
    'checks.minLength > 0',
    'false',
  ),
  mutation(
    step,
    'the checker ignores a maximum length',
    '../src/abstract/fits.ts',
    'Number.isFinite(checks.maxLength)',
    'false',
  ),
  mutation(
    step,
    'the solver fits text to a check it does not model',
    '../src/prove/transition.ts',
    "  if (!checks.modelled) throw new Unsupported('a check on text the solver does not model')\n",
    '',
  ),
  mutation(
    step,
    'the solver ignores a minimum length',
    '../src/prove/transition.ts',
    'checks.minLength > 0 ?',
    'false ?',
  ),
  mutation(
    step,
    'the solver ignores a maximum length',
    '../src/prove/transition.ts',
    '...(Number.isFinite(checks.maxLength)',
    '...(false',
  ),
  mutation(
    step,
    'the solver fits text that may hold a NUL to Text',
    '../src/prove/transition.ts',
    'checks.nulFree && !made && !isPortableRead(value)',
    'false',
  ),
  mutation(
    step,
    'a check of no length is taken as modelled',
    textChecks,
    '      } else modelled = false',
    '      }',
  ),
  // A foreign implementation that throws.
  mutation(
    foreign,
    'a throw is refused as unsupported',
    evaluate,
    'return Node.failed(op, error)',
    'return Node.unsupported(op)',
  ),
]
