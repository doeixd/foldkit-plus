/**
 * `Walk`: seeded random walks of Messages over a Model, checking every step
 * (#538), and starts derived from a Schema for walks to begin from (#543).
 *
 * A law that holds from the Model an example builds by hand may fail from one
 * nothing the example does can produce (a checkpoint, a hydrated snapshot, a
 * row written by SQL), so a walk begins from a list of named starts.
 */
import { Exit, Match, Option, Schema, SchemaAST } from 'effect'
import { Evidence } from 'foldkit-metadata'

/** A Model a walk begins from, by name, so a failure says which. */
export interface Start<Model> {
  readonly name: string
  readonly start: () => Model
}

/** One way to produce a Message from the Model a walk has reached. */
export interface WalkCase<Model, Message> {
  readonly tag: string
  readonly name: string
  readonly generate: (model: Model) => Message
}

/** A law a step broke, and how. */
export interface Violation {
  readonly law: string
  readonly message: string
}

/** A walk (or a regression) that broke a law, with everything needed to replay it. */
export interface WalkFailure {
  readonly start: string
  /** None for a regression, which is one Message and no seed. */
  readonly seed: Option.Option<number>
  /** The cases applied, in order, the last one being what broke the law. */
  readonly path: ReadonlyArray<string>
  readonly broken: ReadonlyArray<Violation>
}

export interface WalkOptions<Model, Message> {
  readonly cases: ReadonlyArray<WalkCase<Model, Message>>
  readonly from: ReadonlyArray<Start<Model>>
  /** May answer later: a walk of declared writes goes through the writer. */
  readonly step: (model: Model, message: Message) => Model | Promise<Model>
  readonly violations: (before: Model, message: Message, after: Model) => ReadonlyArray<Violation>
  /**
   * Every law `violations` judges: a walk with no failure is evidence for
   * each. A violation naming another law throws, but nothing can tell that
   * `violations` checks a listed law at all: one it never checks still gets
   * `Walked` records, on the author's word.
   */
  readonly laws: ReadonlyArray<string>
  /** A drawn case's transition id in evidence, such as `write:Sell` for `Sell`; its tag by default. */
  readonly transition?: (tag: string) => string
  /** Walks of seeds `1..seeds` from each start, each `steps` long. */
  readonly seeds: number
  readonly steps: number
  /** Single Messages that once broke a law, each from a start of its own, run first. */
  readonly regressions?: ReadonlyArray<{
    readonly name: string
    readonly from: () => Model
    readonly case: (model: Model) => Message
  }>
}

export interface WalkResult {
  readonly failures: ReadonlyArray<WalkFailure>
  /**
   * A `Walked` record for each transition a walk drew against each law, all
   * from every start passing; empty when anything failed.
   */
  readonly evidence: ReadonlyArray<Evidence>
  readonly seeds: number
  readonly steps: number
}

type Tables<Model, Message extends { readonly _tag: string }> = {
  readonly [Tag in Message['_tag']]: Readonly<Record<string, (model: Model) => Message>>
}

/**
 * The same seed gives the same sequence. Walks recorded by seed number in
 * test names and issues depend on this exact generator.
 */
const generator = (seed: number) => {
  let state = seed
  return (max: number) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return Math.floor((state / 0x7fffffff) * max)
  }
}

/** What `Walk.cases` returns: every case to walk with, and the table they came from. */
export interface WalkCases<Model, Message, Table> {
  readonly list: ReadonlyArray<WalkCase<Model, Message>>
  /** The generators as written, so a test can name one: `table.Tag['name']`. */
  readonly table: Table
}

/**
 * The cases of a walk, from generators named per Message variant. A variant
 * without an entry, or an entry for no variant, does not compile, so a new
 * Message cannot be left out of the walk.
 */
const cases =
  <Model, Message extends { readonly _tag: string }>() =>
  <const Table extends Tables<Model, Message>>(
    table: Table & { readonly [Tag in Exclude<keyof Table, Message['_tag']>]: never },
  ): WalkCases<Model, Message, Table> => ({
    table,
    list: Object.entries<Readonly<Record<string, (model: Model) => Message>>>(table).flatMap(
      ([tag, generators]) =>
        Object.entries(generators).map(([name, generate]) => ({ tag, name, generate })),
    ),
  })

const issuer = Evidence.issuer('foldkit-remote/walk')

/** Refuses a violation naming a law the walk did not say it judges: its evidence would miss it. */
const judged =
  <Model, Message>(options: WalkOptions<Model, Message>) =>
  (before: Model, message: Message, after: Model): ReadonlyArray<Violation> => {
    const broken = options.violations(before, message, after)
    const stray = broken.find(({ law }) => !options.laws.includes(law))
    if (stray !== undefined)
      throw new Error(`Walk.run: a violation names "${stray.law}", which \`laws\` does not list`)
    return broken
  }

/** Applies every step in turn from `model`, returning the first law broken. */
const walkFrom = async <Model, Message>(
  options: WalkOptions<Model, Message>,
  judge: (before: Model, message: Message, after: Model) => ReadonlyArray<Violation>,
  model: Model,
  next: () => WalkCase<Model, Message>,
): Promise<{ readonly path: ReadonlyArray<string>; readonly broken: ReadonlyArray<Violation> }> => {
  const path: string[] = []
  let current = model
  for (let step = 0; step < options.steps; step++) {
    const { tag, name, generate } = next()
    const message = generate(current)
    path.push(`${tag}: ${name}`)
    const after = await options.step(current, message)
    const broken = judge(current, message, after)
    if (broken.length > 0) return { path, broken }
    current = after
  }
  return { path, broken: [] }
}

const run = async <Model, Message>(options: WalkOptions<Model, Message>): Promise<WalkResult> => {
  if (options.from.length === 0) throw new Error('Walk.run: `from` has no starts to walk from')
  if (options.cases.length === 0) throw new Error('Walk.run: `cases` has nothing to walk with')
  if (options.laws.length === 0) throw new Error('Walk.run: `laws` names nothing it judges')
  const judge = judged(options)
  const failures: WalkFailure[] = []
  const drawn = new Set<string>()
  for (const regression of options.regressions ?? []) {
    const model = regression.from()
    const message = regression.case(model)
    const broken = judge(model, message, await options.step(model, message))
    if (broken.length > 0) {
      failures.push({
        start: `regression: ${regression.name}`,
        seed: Option.none(),
        path: [],
        broken,
      })
    }
  }
  for (const { name, start } of options.from) {
    for (let seed = 1; seed <= options.seeds; seed++) {
      const random = generator(seed)
      const result = await walkFrom(options, judge, start(), () => {
        const drew = options.cases[random(options.cases.length)]!
        drawn.add(drew.tag)
        return drew
      })
      if (result.broken.length > 0) {
        failures.push({ start: name, seed: Option.some(seed), ...result })
        break
      }
    }
  }
  const transition = options.transition ?? (tag => tag)
  const starts = options.from.map(({ name }) => name)
  const evidence =
    failures.length > 0
      ? []
      : [...drawn].flatMap(tag =>
          options.laws.map(law =>
            issuer.issue(
              Evidence.Walked({
                transition: transition(tag),
                law,
                seeds: options.seeds,
                steps: options.steps,
                starts,
              }),
            ),
          ),
        )
  return { failures, evidence, seeds: options.seeds, steps: options.steps }
}

const numbers = [0, 1, -1, 2 ** 31, 0.5]
const strings = ['', 'a', `a${String.fromCodePoint(0x1f600)}b`]
const anything: ReadonlyArray<unknown> = [null, 0, '', {}, []]
const isAnything = (ast: SchemaAST.AST) => SchemaAST.isUnknown(ast) || SchemaAST.isAny(ast)
const redraws = 50

const describePath = (path: ReadonlyArray<string>) => (path.length === 0 ? '(root)' : path.join(''))

const unsupported = (ast: SchemaAST.AST, path: ReadonlyArray<string>): never => {
  throw new Error(`Walk.states: no generator for a ${ast._tag} at ${describePath(path)}`)
}

const build = (
  ast: SchemaAST.AST,
  path: ReadonlyArray<string>,
  random: (max: number) => number,
): unknown => {
  const pick = <T>(from: ReadonlyArray<T>): T => from[random(from.length)]!
  const here = (key: string) => [...path, key]
  return Match.value(ast).pipe(
    Match.when(SchemaAST.isNull, () => null),
    Match.when(SchemaAST.isUndefined, () => undefined),
    Match.when(SchemaAST.isBoolean, () => random(2) === 0),
    Match.when(SchemaAST.isNumber, () => pick(numbers)),
    Match.when(SchemaAST.isString, () => pick(strings)),
    Match.when(isAnything, () => pick(anything)),
    Match.when(SchemaAST.isLiteral, node => node.literal),
    Match.when(SchemaAST.isEnum, node => pick(node.enums)[1]),
    Match.when(SchemaAST.isUnion, node => build(pick(node.types), path, random)),
    Match.when(SchemaAST.isArrays, node => {
      const rest = node.rest[0]
      const fixed = node.elements.map((element, index) =>
        build(element, here(`[${index}]`), random),
      )
      return rest === undefined
        ? fixed
        : [
            ...fixed,
            ...Array.from({ length: random(3) }, (_, index) =>
              build(rest, here(`[${fixed.length + index}]`), random),
            ),
          ]
    }),
    Match.when(SchemaAST.isObjects, node => {
      const entries: Array<readonly [string, unknown]> = []
      for (const { name, type } of node.propertySignatures) {
        const key = String(name)
        if (type.context?.isOptional === true && random(2) === 0) continue
        entries.push([key, build(type, here(`.${key}`), random)])
      }
      for (const { parameter, type } of node.indexSignatures) {
        if (!SchemaAST.isString(parameter)) return unsupported(parameter, here('{key}'))
        for (let entry = 0; entry < random(3); entry++) {
          entries.push([`k${entry}`, build(type, here(`.k${entry}`), random)])
        }
      }
      return Object.fromEntries(entries)
    }),
    Match.orElse(() => unsupported(ast, path)),
  )
}

/**
 * Starts for a walk, derived from a Schema: values built over its encoded
 * side by kind (a literal or union picks a member, a number comes from a
 * small pool, a string from one holding a surrogate pair, an array has none,
 * one or two items, structs and records recurse), each decoded through the
 * Schema so its checks refuse what they should. A refused value is drawn
 * again, up to a bound. The same `seed` gives the same starts.
 *
 * `Unknown` and `Any` draw from a few values of any JSON kind. A kind with no generator (a Declaration such as `Option`, a recursive
 * Schema, a template literal) throws here, naming the kind and its path: a
 * start list that silently skipped it would test a smaller space than it
 * claims. Give such a Schema's states by hand.
 */
const states = <A, I>(
  schema: Schema.Codec<A, I>,
  options: { readonly count: number; readonly seed: number },
): ReadonlyArray<Start<A>> => {
  const encoded = Schema.toEncoded(schema).ast
  const random = generator(options.seed)
  const decode = Schema.decodeUnknownExit(schema)
  return Array.from({ length: options.count }, (_, index) => {
    for (let attempt = 0; attempt < redraws; attempt++) {
      const exit = decode(build(encoded, [], random))
      if (Exit.isSuccess(exit)) {
        const value = exit.value
        return { name: `states(seed ${options.seed}) #${index + 1}`, start: () => value }
      }
    }
    throw new Error(
      `Walk.states: ${redraws} values built over the Schema were all refused by its checks`,
    )
  })
}

export const Walk = { cases, run, states }
