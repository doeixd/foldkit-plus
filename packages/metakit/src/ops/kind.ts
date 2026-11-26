/**
 * What a node's value is, read off its shape and its Schema without
 * evaluating: the guard of every law that returns an operand in place of a
 * call (`x + 0 -> x` holds only where `x` is a finite number, null or refused).
 */
import { Option, Predicate, SchemaAST } from 'effect'
import * as Node from '../node.js'
import { DOMAIN_ANNOTATION_KEY } from '../domain/annotation.js'
import { optionInner } from '../path.js'

const FINITE: ReadonlySet<string> = new Set(['effect/schema/isInt', 'effect/schema/isFinite'])

/** Whether one of `checks`, or a check grouped in one, is one of `ids`. */
export const declares = (
  checks: ReadonlyArray<SchemaAST.Check<unknown>> | undefined,
  ids: ReadonlySet<string>,
): boolean =>
  (checks ?? []).some(check => {
    const id = check.annotations?.representation?.id
    return (
      (id !== undefined && ids.has(id)) ||
      (check._tag === 'FilterGroup' && declares(check.checks, ids))
    )
  })

/** The members of `ast` other than null and undefined; an `Option`'s are its value's, which a path reads. */
export const present = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> => {
  if (SchemaAST.isUnion(ast)) return ast.types.flatMap(present)
  const inner = optionInner(ast)
  if (Option.isSome(inner)) return present(inner.value)
  return SchemaAST.isNull(ast) || SchemaAST.isUndefined(ast) ? [] : [ast]
}

/** A number Schema that admits neither NaN nor an infinity (`Schema.Int`, `Schema.Finite`). */
export const isFiniteNumber = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNumber(ast) && declares(ast.checks, FINITE)

/** A check that refuses text holding a NUL: the one `Text.schema` makes, by its annotation. */
export const declaresNoNul = (check: SchemaAST.Check<unknown>): boolean => {
  const domain: unknown = check.annotations?.[DOMAIN_ANNOTATION_KEY]
  return (
    Predicate.hasProperty(domain, 'kind') &&
    (domain.kind === 'text' || domain.kind === 'id' || domain.kind === 'ordinal')
  )
}

const refusesNul = (checks: ReadonlyArray<SchemaAST.Check<unknown>>): boolean => {
  for (const check of checks) {
    if (check._tag === 'FilterGroup') {
      if (refusesNul(check.checks)) return true
      continue
    }
    if (declaresNoNul(check)) return true
  }
  return false
}

/**
 * Text `Text.schema` from `metakit/domain` describes, refinements after it
 * included: text holding no NUL, recognised by the annotation on the check
 * that refuses one (an annotation on the Schema alone refuses nothing).
 */
export const isText = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isString(ast) && refusesNul(ast.checks ?? [])

/** A value of `ast` is never text holding a NUL character. */
const holdsNoNulText = (ast: SchemaAST.AST): boolean =>
  present(ast).every(
    member =>
      SchemaAST.isNumber(member) ||
      SchemaAST.isBoolean(member) ||
      SchemaAST.isObjects(member) ||
      SchemaAST.isArrays(member) ||
      isText(member) ||
      (SchemaAST.isLiteral(member) && !Node.holdsNul([member.literal])),
  )

/**
 * A literal or a path that holds no text with a NUL character: a term
 * evaluation reads, which no text or equality operation refuses for it.
 */
export const isPortableRead = (node: Node.Node): boolean => {
  if (Node.$is('Lit')(node)) return isPortableValue(node.value)
  return Node.$is('Path')(node) && Option.isSome(node.ast) && holdsNoNulText(node.ast.value)
}

const INT: ReadonlySet<string> = new Set(['effect/schema/isInt'])

/** A number within ±(2^53−1), past which arithmetic refuses an operand. */
export const isSafeNumber = (value: unknown): boolean =>
  typeof value === 'number' && Math.abs(value) <= Number.MAX_SAFE_INTEGER

/**
 * A literal or a path that, whenever it holds a number, holds one within
 * ±(2^53−1): a path whose Schema admits only integers (`Schema.Int` takes
 * only safe ones). The guard of a numeric law that returns an operand.
 */
export const isSafeRead = (node: Node.Node): boolean =>
  Node.$is('Lit')(node)
    ? isSafeNumber(node.value)
    : Node.$is('Path')(node) &&
      Option.exists(node.ast, ast =>
        present(ast).every(member => SchemaAST.isNumber(member) && declares(member.checks, INT)),
      )

/** A literal `isPortableRead` takes: not a refusal, and no text holding a NUL. */
export const isPortableValue = (value: unknown): boolean =>
  !Node.isRefusal(value) && !Node.holdsNul([value])

/** A value no operation refuses for itself: not a refusal, no text holding a NUL, no NaN or infinity. */
export const admitted = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.every(admitted)
  if (typeof value === 'number') return Number.isFinite(value)
  return !Node.isRefusal(value) && !Node.holdsNul([value])
}

/** Every value of `ast`, null aside, is one `admitted` takes. */
const admitsNoRefusable = (ast: SchemaAST.AST): boolean =>
  present(ast).every(
    member =>
      isFiniteNumber(member) ||
      SchemaAST.isBoolean(member) ||
      isText(member) ||
      (SchemaAST.isLiteral(member) && admitted(member.literal)),
  )

/** The kind every operand of a core operation must be of for it to refuse nothing more. */
const operandKinds: Partial<Record<Node.CoreOpId, Node.ValueKind>> = {
  'bool.and': 'boolean',
  'bool.or': 'boolean',
  'bool.not': 'boolean',
  'ord.lt': 'number',
  'ord.lte': 'number',
  'ord.gt': 'number',
  'ord.gte': 'number',
  'str.lt': 'text',
  'str.lte': 'text',
  'str.gt': 'text',
  'str.gte': 'text',
  'str.len': 'text',
  'str.startsWith': 'text',
  'str.contains': 'text',
  'str.lowerAscii': 'text',
  'str.trim': 'text',
}

/** The core operations whose only refusals are of their operands' values (no result past a range). */
const refusesOperandsOnly: ReadonlySet<Node.CoreOpId> = new Set<Node.CoreOpId>([
  ...(Object.keys(operandKinds) as ReadonlyArray<Node.CoreOpId>),
  'eq.is',
  'eq.isNot',
  'eq.equals',
  'null.isNull',
  'null.coalesce',
])

/**
 * Whether evaluation can never refuse `node`, nor give a value an operation
 * refuses for itself (text holding a NUL, NaN), judged from the expression
 * and its Schemas: a literal of none; a path whose Schema admits none (a
 * finite number, a boolean, a literal set of none, `Text`); a core
 * operation that refuses only for its operands' values, over operands of its
 * kind that cannot be refused; an `any` or `every` over a list or a row's
 * related rows whose test cannot be refused (`foldCannotRefuse`). The guard
 * of every rewrite that drops an operand: a refusal decides before null and
 * is not absorbed.
 */
export const cannotRefuse = (node: Node.Node): boolean =>
  Node.$match(node, {
    Lit: ({ value }) => admitted(value),
    Path: ({ ast }) => Option.exists(ast, admitsNoRefusable),
    Call: ({ op, args }) =>
      !Node.isForeign(op) && (op.id === 'eq.in' || op.id === 'eq.among')
        ? args.length === 2 &&
          cannotRefuse(args[0]!) &&
          cannotRefuse(args[1]!) &&
          Node.$is('Lit')(args[1]!) &&
          Array.isArray(args[1]!.value)
        : args.length === 2 &&
            cannotRefuse(args[0]!) &&
            cannotRefuse(args[1]!) &&
            safeBoundedSum(
              op,
              Node.$is('Lit')(args[0]!) && typeof args[0]!.value === 'number'
                ? Option.some(Math.abs(args[0]!.value))
                : Node.$is('Path')(args[0]!)
                  ? Option.flatMap(args[0]!.ast, maxAbsOfAst)
                  : Option.none(),
              Node.$is('Lit')(args[1]!) && typeof args[1]!.value === 'number'
                ? Option.some(Math.abs(args[1]!.value))
                : Node.$is('Path')(args[1]!)
                  ? Option.flatMap(args[1]!.ast, maxAbsOfAst)
                  : Option.none(),
            )
          ? true
          : callCannotRefuse(
              op,
              args.map(arg => [cannotRefuse(arg), kindOf(arg)]),
            ),
    If: () => false,
    Match: () => false,
    Opaque: () => false,
    Rows: rows => {
      const source = Node.rowsSource(rows.over)
      return foldCannotRefuse(
        rows,
        Node.$is('Lit')(source)
          ? holdsValue(rows.over, source.value)
          : Node.$is('Path')(source) && holdsRead(rows.over, source),
        Option.match(rows.where, { onNone: () => true, onSome: cannotRefuse }),
      )
    },
  })

/**
 * `cannotRefuse` of a `Rows` node, from whether its source is what it folds
 * (`holdsValue`, `holdsRead`) and whether its test cannot be refused. `any`
 * and `every` refuse only for a source that is not, or for a test refused
 * where no other element settles them (`foldAnswers`); every other fold
 * refuses for an answer it needs or a total past a range.
 */
export const foldCannotRefuse = (
  rows: Node.Rows,
  sourceHolds: boolean,
  testCannotRefuse: boolean,
): boolean => (rows.fold === 'any' || rows.fold === 'every') && sourceHolds && testCannotRefuse

/** Whether a known source is what `over` folds, or null: a list of values `admitted` takes, or a row. */
export const holdsValue = (over: Node.RowsOver, value: unknown): boolean =>
  value === null ||
  value === undefined ||
  Node.RowsOver.$match(over, {
    List: () => Array.isArray(value) && admitted(value),
    Related: () => typeof value === 'object' && !Array.isArray(value) && !Node.isRefusal(value),
  })

/**
 * Whether a read is what `over` folds, or null, wherever it is read: a path
 * whose Schema admits only lists; over related rows any read, which is a row
 * or null, the rows pointing at it held as `{ rows, whole }` or not at all.
 */
export const holdsRead = (over: Node.RowsOver, path: Node.PathNode): boolean =>
  Node.RowsOver.$match(over, {
    List: () => Option.exists(path.ast, ast => present(ast).every(SchemaAST.isArrays)),
    Related: () => true,
  })

/** Max absolute value of a bounded numeric Schema AST, if both sides are finite. */
export const maxAbsOfAst = (ast: SchemaAST.AST): Option.Option<number> => {
  const members = present(ast)
  if (members.length === 0) return Option.none()
  let worst = 0
  for (const member of members) {
    if (
      SchemaAST.isLiteral(member) &&
      typeof member.literal === 'number' &&
      Number.isFinite(member.literal)
    ) {
      worst = Math.max(worst, Math.abs(member.literal))
      continue
    }
    if (!SchemaAST.isNumber(member)) return Option.none()
    let lo = Number.NEGATIVE_INFINITY
    let hi = Number.POSITIVE_INFINITY
    const scan = (checks: ReadonlyArray<SchemaAST.Check<unknown>>): void => {
      for (const check of checks) {
        const rep = check.annotations?.representation
        if (rep !== undefined && typeof rep.payload === 'object' && rep.payload !== null) {
          const p = rep.payload as Record<string, unknown>
          if (typeof p['minimum'] === 'number') lo = Math.max(lo, p['minimum'])
          if (typeof p['exclusiveMinimum'] === 'number') lo = Math.max(lo, p['exclusiveMinimum'])
          if (typeof p['maximum'] === 'number') hi = Math.min(hi, p['maximum'])
          if (typeof p['exclusiveMaximum'] === 'number') hi = Math.min(hi, p['exclusiveMaximum'])
        }
        if (check._tag === 'FilterGroup') scan(check.checks)
      }
    }
    if (member.checks !== undefined) scan(member.checks)
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return Option.none()
    worst = Math.max(worst, Math.abs(lo), Math.abs(hi))
  }
  return Option.some(worst)
}

/** Whether `num.add` / `num.sub` over two bounded numeric operands cannot overflow `±MAX_SAFE_INTEGER`. */
export const safeBoundedSum = (
  op: Node.AnyOp,
  leftBound: Option.Option<number>,
  rightBound: Option.Option<number>,
): boolean =>
  !Node.isForeign(op) &&
  (op.id === 'num.add' || op.id === 'num.sub') &&
  Option.isSome(leftBound) &&
  Option.isSome(rightBound) &&
  leftBound.value + rightBound.value <= Number.MAX_SAFE_INTEGER

/**
 * `cannotRefuse` of a call, from whether each operand cannot be refused and
 * its kind: a core operation that refuses only for its operands' values,
 * over operands of its kind that cannot be refused.
 */
export const callCannotRefuse = (
  op: Node.AnyOp,
  operands: ReadonlyArray<readonly [cannotRefuse: boolean, kind: Option.Option<Node.ValueKind>]>,
): boolean => {
  if (Node.isForeign(op) || !refusesOperandsOnly.has(op.id)) return false
  const kind = operandKinds[op.id]
  return operands.every(
    ([unrefused, each]) =>
      unrefused && (kind === undefined || Option.exists(each, operand => operand === kind)),
  )
}

const kindOfAst = (ast: SchemaAST.AST): Option.Option<Node.ValueKind> => {
  const members = present(ast)
  if (members.length !== 1) return Option.none()
  const only = members[0]!
  if (isFiniteNumber(only)) return Option.some('number')
  if (SchemaAST.isString(only)) return Option.some('text')
  return SchemaAST.isBoolean(only) ? Option.some('boolean') : Option.none()
}

/** The one kind all of `kinds` are, where each is known and they agree. */
const sameKind = (
  kinds: ReadonlyArray<Option.Option<Node.ValueKind>>,
): Option.Option<Node.ValueKind> => {
  const first = kinds[0] ?? Option.none()
  return kinds.every(
    kind => Option.isSome(kind) && Option.isSome(first) && kind.value === first.value,
  )
    ? first
    : Option.none()
}

/** The kind of a value: a finite number, text or a boolean. */
export const kindOfValue = (value: unknown): Option.Option<Node.ValueKind> => {
  if (typeof value === 'number' && Number.isFinite(value)) return Option.some('number')
  if (typeof value === 'string') return Option.some('text')
  return typeof value === 'boolean' ? Option.some('boolean') : Option.none()
}

/** The kind of a call's value, from its operands' kinds. */
export const callKind = (
  op: Node.AnyOp,
  operands: ReadonlyArray<Option.Option<Node.ValueKind>>,
): Option.Option<Node.ValueKind> =>
  op.returns === 'operand' ? sameKind(operands) : Option.some(op.returns)

/** The kind of `node`'s value where it is neither null nor refused; none when unknown. */
export const kindOf = (node: Node.Node): Option.Option<Node.ValueKind> =>
  Node.$match(node, {
    Lit: ({ value }) => kindOfValue(value),
    Path: ({ ast }) => Option.flatMap(ast, kindOfAst),
    Call: ({ op, args }) => callKind(op, args.map(kindOf)),
    If: ({ then, otherwise }) => sameKind([then, otherwise].map(kindOf)),
    Match: ({ cases, otherwise }) =>
      sameKind([...cases.map(([, arm]) => arm), ...Option.toArray(otherwise)].map(kindOf)),
    Opaque: () => Option.none(),
    Rows: ({ fold, op }) => {
      if (fold === 'any' || fold === 'every') return Option.some('boolean' as const)
      if (fold === 'reduce') return op === undefined ? Option.none() : Option.some(op.returns)
      // `min` and `max` of no element are null, which a kind does not rule out.
      return fold === 'count' || fold === 'sum' || fold === 'min' || fold === 'max'
        ? Option.some('number' as const)
        : Option.none()
    },
  })
