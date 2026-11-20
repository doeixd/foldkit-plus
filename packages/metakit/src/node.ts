/**
 * The six kinds of node every MetaKit expression is made of. The set is
 * closed: new behaviour arrives as an operator (`Op`), never as a new node.
 *
 * Readers that are not interpreters (a form, a database constraint, an agent's
 * tool schema) read these nodes directly: branch with `Node.$match`.
 */
import { Data, Option, type SchemaAST } from 'effect'

/**
 * Every operator any reader must understand. Each reader's table is typed
 * `{ readonly [K in OpId]: … }`, so adding an id fails to compile until every
 * reader implements it or refuses it by name.
 */
export type OpId =
  | 'and'
  | 'or'
  | 'not'
  | 'is'
  | 'isNot'
  | 'isNull'
  | 'oneOf'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'add'
  | 'sub'
  | 'mul'
  | 'neg'
  | 'min'
  | 'max'
  | 'abs'
  | 'len'
  | 'startsWith'
  | 'contains'
  | 'struct'

/**
 * An operator's descriptor: its id and its in-memory meaning. A `Call` holds
 * the descriptor itself, so a page that builds `Num.lte` keeps `lte`'s
 * evaluator and no other operator's.
 */
export interface Op<Id extends OpId = OpId> {
  readonly id: Id
  /** The operator on concrete argument values. Total: it never throws. */
  readonly evaluate: (args: ReadonlyArray<unknown>) => unknown
  /**
   * A size-reducing simplification over partly known arguments (`x && true`
   * to `x`), applied by partial evaluation. Never grows the term.
   */
  readonly fold?: (args: ReadonlyArray<Node>) => Option.Option<Node>
}

/** A constant. */
export interface Lit {
  readonly _tag: 'Lit'
  readonly value: unknown
}

/** A read of the environment at `segments`, typed by the Schema it was built from. */
export interface PathNode {
  readonly _tag: 'Path'
  readonly segments: ReadonlyArray<string>
  readonly ast: Option.Option<SchemaAST.AST>
}

/** An operator applied to arguments. */
export interface Call {
  readonly _tag: 'Call'
  readonly op: Op
  readonly args: ReadonlyArray<Node>
}

/** A two-way choice on a boolean. */
export interface If {
  readonly _tag: 'If'
  readonly cond: Node
  readonly then: Node
  readonly otherwise: Node
}

/**
 * A choice on a value among literal cases. With no `otherwise`, the cases
 * cover every value the Schema of `on` allows.
 */
export interface Match {
  readonly _tag: 'Match'
  readonly on: Node
  readonly cases: ReadonlyArray<readonly [value: string, then: Node]>
  readonly otherwise: Option.Option<Node>
}

/**
 * Arbitrary code no reader can see into. It declares what it reads (none:
 * everything), runs in evaluation, and leaves every static reader undecided.
 */
export interface Opaque {
  readonly _tag: 'Opaque'
  readonly name: string
  readonly reads: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
  readonly run: (env: unknown) => unknown
}

export type Node = Lit | PathNode | Call | If | Match | Opaque

export const { Lit, Path, Call, If, Match, Opaque, $match, $is } = Data.taggedEnum<Node>()

const opaqueIds = new WeakMap<(env: unknown) => unknown, number>()
let nextOpaqueId = 0

/**
 * A string equal for two nodes exactly when they are the same term: the key
 * by which partial evaluation removes duplicates and the checkers name terms.
 * Two opaque nodes are one term only when they share their function.
 */
export const key = (node: Node): string =>
  $match(node, {
    Lit: ({ value }) =>
      `${typeof value}:${typeof value === 'bigint' ? String(value) : JSON.stringify(value)}`,
    Path: ({ segments }) => `$${JSON.stringify(segments)}`,
    Call: ({ op, args }) => `${op.id}(${args.map(key).join(',')})`,
    If: ({ cond, then, otherwise }) => `if(${key(cond)},${key(then)},${key(otherwise)})`,
    Match: ({ on, cases, otherwise }) =>
      `match(${key(on)},${cases.map(([value, then]) => `${JSON.stringify(value)}:${key(then)}`).join(',')}${Option.match(
        otherwise,
        { onNone: () => '', onSome: rest => `,_:${key(rest)}` },
      )})`,
    Opaque: ({ name, run }) => {
      let id = opaqueIds.get(run)
      if (id === undefined) {
        nextOpaqueId += 1
        id = nextOpaqueId
        opaqueIds.set(run, id)
      }
      return `opaque#${id}:${name}`
    },
  })
