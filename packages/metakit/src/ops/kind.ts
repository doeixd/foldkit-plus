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

const declares = (
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

/** A number Schema that admits only safe integers (`Schema.Int`). */
export const isInteger = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNumber(ast) && declares(ast.checks, new Set(['effect/schema/isInt']))

/**
 * Text `Text.schema` from `metakit/domain` describes, refinements after it
 * included: text holding no NUL, recognised by the annotation on the check
 * that refuses one (an annotation on the Schema alone refuses nothing).
 */
export const isText = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isString(ast) &&
  (ast.checks ?? []).some(check => {
    const domain: unknown = check.annotations?.[DOMAIN_ANNOTATION_KEY]
    return Predicate.hasProperty(domain, 'kind') && domain.kind === 'text'
  })

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
  if (Node.$is('Lit')(node)) return !Node.isRefusal(node.value) && !Node.holdsNul([node.value])
  return Node.$is('Path')(node) && Option.isSome(node.ast) && holdsNoNulText(node.ast.value)
}

/** A value no operation refuses for itself: not a refusal, no text holding a NUL, no NaN or infinity. */
const admitted = (value: unknown): boolean => {
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
  'eq.in',
  'eq.among',
  'null.isNull',
  'null.coalesce',
])

/**
 * Whether evaluation can never refuse `node`, nor give a value an operation
 * refuses for itself (text holding a NUL, NaN), judged from the expression
 * and its Schemas: a literal of none; a path whose Schema admits none (a
 * finite number, a boolean, a literal set of none, `Text`); a core
 * operation that refuses only for its operands' values, over operands of its
 * kind that cannot be refused. The guard of every rewrite that drops an
 * operand: a refusal decides before null and is not absorbed.
 */
export const cannotRefuse = (node: Node.Node): boolean =>
  Node.$match(node, {
    Lit: ({ value }) => admitted(value),
    Path: ({ ast }) => Option.exists(ast, admitsNoRefusable),
    Call: ({ op, args }) => {
      if (Node.isForeign(op) || !refusesOperandsOnly.has(op.id)) return false
      const kind = operandKinds[op.id]
      return args.every(
        arg =>
          cannotRefuse(arg) &&
          (kind === undefined || Option.exists(kindOf(arg), each => each === kind)),
      )
    },
    If: () => false,
    Match: () => false,
    Opaque: () => false,
    Rows: () => false,
  })

const kindOfAst = (ast: SchemaAST.AST): Option.Option<Node.ValueKind> => {
  const members = present(ast)
  if (members.length !== 1) return Option.none()
  const only = members[0]!
  if (isFiniteNumber(only)) return Option.some('number')
  if (SchemaAST.isString(only)) return Option.some('text')
  return SchemaAST.isBoolean(only) ? Option.some('boolean') : Option.none()
}

const sameKind = (nodes: ReadonlyArray<Node.Node>): Option.Option<Node.ValueKind> => {
  const kinds = nodes.map(kindOf)
  const first = kinds[0] ?? Option.none()
  return kinds.every(
    kind => Option.isSome(kind) && Option.isSome(first) && kind.value === first.value,
  )
    ? first
    : Option.none()
}

/** The kind of `node`'s value where it is neither null nor refused; none when unknown. */
export const kindOf = (node: Node.Node): Option.Option<Node.ValueKind> =>
  Node.$match(node, {
    Lit: ({ value }) => {
      if (typeof value === 'number' && Number.isFinite(value)) return Option.some('number' as const)
      if (typeof value === 'string') return Option.some('text' as const)
      return typeof value === 'boolean' ? Option.some('boolean' as const) : Option.none()
    },
    Path: ({ ast }) => Option.flatMap(ast, kindOfAst),
    Call: ({ op, args }) => (op.returns === 'operand' ? sameKind(args) : Option.some(op.returns)),
    If: ({ then, otherwise }) => sameKind([then, otherwise]),
    Match: ({ cases, otherwise }) =>
      sameKind([...cases.map(([, arm]) => arm), ...Option.toArray(otherwise)]),
    Opaque: () => Option.none(),
    Rows: ({ fold }) => {
      if (fold === 'any' || fold === 'every') return Option.some('boolean' as const)
      // `min` and `max` of no element are null, which a kind does not rule out.
      return fold === 'count' || fold === 'sum' || fold === 'min' || fold === 'max'
        ? Option.some('number' as const)
        : Option.none()
    },
  })
