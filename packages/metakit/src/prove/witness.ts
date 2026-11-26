import { Option, Result, Schema, SchemaAST } from 'effect'
import type { Model } from 'z3-solver'
import type { Slice } from '../abstract/unordered.js'
import * as Expr from '../expr.js'
import * as Node from '../node.js'
import { wrap } from '../ops/core.js'
import * as Path from '../path.js'
import type { Lowered, Z3 } from './lower.js'
import type { PathInfo, Shape } from './shape.js'

/** A value for a path the solver holds no more of than a token: empty, where empty is valid. */
const placeholder = (ast: SchemaAST.AST): Option.Option<unknown> => {
  if (SchemaAST.isArrays(ast)) return Option.some([])
  if (SchemaAST.isObjects(ast)) return Option.some({})
  if (SchemaAST.isString(ast)) return Option.some('')
  if (SchemaAST.isNumber(ast)) return Option.some(0)
  if (SchemaAST.isBoolean(ast)) return Option.some(false)
  if (SchemaAST.isLiteral(ast)) return Option.some(ast.literal)
  if (SchemaAST.isUnion(ast)) {
    return Option.firstSomeOf(
      ast.types.filter(m => !SchemaAST.isNull(m) && !SchemaAST.isUndefined(m)).map(placeholder),
    )
  }
  return Option.none()
}

/** Text of `length` code points for the solver's `code`, distinct from other codes where it has room. */
const witnessText = (code: string, length: Option.Option<number>): string =>
  Option.match(length, {
    onNone: () => `model-string:${code}`,
    onSome: size => `#${code}`.padEnd(size, '_').slice(0, size),
  })

/** The environment, and its `path -> value` form, that a solver's model assigns. */
export const readModel = (
  z3: Z3,
  model: Model<'metakit'>,
  shape: Shape,
  { flagVar, vars, lengths, codeTexts }: Lowered,
): { readonly env: unknown; readonly flat: Readonly<Record<string, unknown>> } => {
  const isSet = (flag: string): boolean => model.eval(flagVar(flag), true).toString() === 'true'
  const absent = new Set(Array.from(shape.absences.keys()).filter(isSet))
  const valueOf = (name: string, info: PathInfo): Option.Option<unknown> => {
    const assigned = model.eval(vars.get(name)!, true)
    switch (info.sort) {
      case 'bool':
        return Option.some(assigned.toString() === 'true')
      case 'int':
      case 'real':
        if (z3.isIntVal(assigned)) return Option.some(Number(assigned.value()))
        if (z3.isFPVal(assigned)) return Option.some(assigned.value())
        return z3.isRealVal(assigned) ? Option.some(assigned.asNumber()) : Option.none()
      case 'text': {
        const code = Number(assigned.toString())
        const measured = lengths.get(
          `strLen:${Node.key(Node.Path({ segments: info.segments, ast: Option.none() }))}`,
        )
        const size =
          measured === undefined
            ? Option.none<number>()
            : Option.some(Number(model.eval(measured, true).toString()))
        return Option.some(codeTexts.get(code) ?? witnessText(assigned.toString(), size))
      }
      case 'struct':
        return Option.some({})
      case 'other':
        return placeholder(info.ast)
    }
  }

  let env: unknown = {}
  const flat: Record<string, unknown> = {}
  const write = (segments: ReadonlyArray<string>, value: unknown): void => {
    env = Path.set(Path.make<unknown, unknown>(segments), env, value)
  }
  // A struct comes before its fields, so a parent that is null is written once and its fields left out.
  const byDepth = Array.from(shape.paths).sort(
    ([, a], [, b]) => a.segments.length - b.segments.length,
  )
  for (const [name, info] of byDepth) {
    const flags = info.flags.filter(flag => absent.has(flag))
    if (flags.length > 0) {
      const own = shape.absences.get(`absent:${name}`)
      if (flags.length === 1 && own !== undefined && flags[0] === `absent:${name}`) {
        if (own.as === 'none') write(info.segments, Option.none())
        if (own.as === 'null') write(info.segments, null)
        if (own.as === 'undefined') write(info.segments, undefined)
        if (info.sort !== 'struct') flat[name] = null
      }
      continue
    }
    const value = valueOf(name, info)
    if (Option.isNone(value)) continue
    write(info.segments, info.isOption ? Option.some(value.value) : value.value)
    if (info.sort !== 'struct' && info.sort !== 'other') flat[name] = value.value
  }
  return { env, flat }
}

/** A rule holds only where it evaluates to true: not where it is null, and not where it is refused. */
export const holdsOf = (node: Node.Node, env: unknown): boolean =>
  Result.match(Expr.evalResult(wrap<unknown, unknown>(node), env), {
    onSuccess: value => value === true,
    onFailure: () => false,
  })

export const at = (env: unknown, under: ReadonlyArray<string>): unknown =>
  Option.getOrUndefined(Path.get(Path.make<unknown, unknown>(under), env))

export const valid = (slices: ReadonlyArray<Slice>, env: unknown): boolean =>
  slices.every(([under, schema]) => Schema.is(schema)(at(env, under)))

export interface Replay {
  readonly before: unknown
  readonly input: unknown
  readonly after: unknown
}

/** Structured counterexample report for a refuted transition. */
export interface WitnessReport {
  readonly before: unknown
  readonly input: unknown
  readonly after: unknown
  /** The rules the state after breaks; never empty. */
  readonly violated: ReadonlyArray<string>
  readonly reproducer: string
}

export const witnessReport = <State>(
  tag: string,
  stateSchema: Schema.Codec<State>,
  { before, input, after }: Replay,
): WitnessReport => {
  const broken = Expr.refinementsOf(stateSchema)
    .filter(rule => !holdsOf(rule.node, after))
    .map(rule => Expr.show(rule))
  return {
    before,
    input,
    after,
    // A replayed state the Schema refuses breaks a rule, or a check no rule reads.
    violated: broken.length > 0 ? broken : ['a check of the state Schema that is no rule'],
    reproducer: `Transition.run(${tag}, ${JSON.stringify(before)}, ${JSON.stringify(input)})`,
  }
}
