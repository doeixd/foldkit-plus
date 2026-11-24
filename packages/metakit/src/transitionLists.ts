/**
 * The ways of writing a list held in the state. Each builds the value the
 * list becomes, so a step still reads "this path becomes this value"; the way
 * is recorded beside the write for the readers that decide from it.
 *
 * An element is a record of field name to expression, or an expression that
 * gives a whole element (`input.todo`). A key is the element's `id` field
 * unless `key` names another. A key no element has changes nothing, and the
 * step returns the list it was given, so a no-op keeps the state's identity.
 */
import { Option, SchemaAST } from 'effect'
import * as Node from './node.js'
import {
  appendOp,
  bodyOf,
  checkBody,
  elementAst,
  excludeOp,
  includeOp,
  rowsOver,
  type Each,
  type EachEnv,
} from './ops/arr.js'
import { andOp } from './ops/bool.js'
import { isExpr, toNode, wrap, type ExprInput } from './ops/core.js'
import { isNotOp, isOp } from './ops/eq.js'
import * as Path from './path.js'
import type { StatePath } from './path.js'
import {
  targetOf,
  Way,
  type NoSupplied,
  type TransitionEnv,
  type WaysByTag,
  type WriteEquation,
} from './transition.js'

type List<State, Input, Supplied, E> = StatePath<
  TransitionEnv<State, Input, Supplied>,
  ReadonlyArray<E>
>

/** What a body over the list's elements may read: the transition's slices and the element. */
type BodyEnv<State, Input, Supplied, E> = TransitionEnv<State, Input, Supplied> & EachEnv<E>

type Test<State, Input, Supplied, E> = (
  each: Each<E>,
) => ExprInput<BodyEnv<State, Input, Supplied, E>, boolean | null>

/** An element given to a list write: an expression for the whole element, or one per field. */
export type ElementInput<Env, E> =
  | ExprInput<Env, E>
  | (E extends Readonly<Record<string, unknown>>
      ? { readonly [K in keyof E]: ExprInput<Env, Path.Read<E[K]>> }
      : never)

/** The node of an element: the expression, or a record of field names to values. */
const elementNodes = (
  element: unknown,
):
  | { readonly whole: Node.Node }
  | { readonly fields: ReadonlyArray<readonly [string, Node.Node]> } =>
  isExpr(element) || element === null || typeof element !== 'object' || Array.isArray(element)
    ? { whole: toNode(element) }
    : {
        fields: Object.entries(element as Record<string, unknown>).map(
          ([name, value]) => [name, toNode(value)] as const,
        ),
      }

/** The fields a `patch` sets of an element, each from an expression over it: no other key compiles. */
export type Patch<Env, E> = { readonly [F in keyof E]?: ExprInput<Env, Path.Read<E[F]>> }

const write = <State, Input, E, Supplied, W extends Way['_tag']>(
  list: List<State, Input, Supplied, E>,
  name: string,
  value: Node.Node,
  way: WaysByTag[W],
): WriteEquation<State, Input, ReadonlyArray<E>, Supplied, W> => ({
  _tag: 'WriteEquation',
  target: targetOf(list, name),
  value: wrap(value),
  way,
})

/** The path of the key field under the element a body reads. */
const keyOf = (key: string): Node.Node =>
  Node.Path({ segments: [Node.EACH, key], ast: Option.none() })

/** The fields of a list's element its Schema holds as an Effect `Option`. */
const optionFields = (list: Node.Node): ReadonlySet<string> =>
  new Set(
    Option.match(elementAst(list), {
      onNone: () => [],
      onSome: ast =>
        SchemaAST.isObjects(ast)
          ? ast.propertySignatures.flatMap(property =>
              typeof property.name === 'string' && Option.isSome(Path.optionInner(property.type))
                ? [property.name]
                : [],
            )
          : [],
    }),
  )

/** The element `element` gives, and the nodes it is made of. */
const appended = (list: Node.Node, element: unknown, name: string) => {
  const given = elementNodes(element)
  if ('whole' in given) {
    return {
      node: Node.Call({ op: appendOp, args: [list, given.whole] }),
      parts: [given.whole],
      field: (key: string): Node.Node => {
        if (!Node.$is('Path')(given.whole)) {
          throw new Error(
            `[metakit] Transition.${name}: the key of an element is read from a record or a path`,
          )
        }
        return Node.Path({ segments: [...given.whole.segments, key], ast: Option.none() })
      },
    }
  }
  if (given.fields.length === 0)
    throw new Error(`[metakit] Transition.${name}: an element has fields`)
  const values = given.fields.map(([, value]) => value)
  // A field the element's Schema holds as an `Option` takes the value as some, null as none.
  const options = optionFields(list)
  return {
    node: Node.Call({
      op: appendOp,
      args: [
        list,
        Node.Lit({ value: given.fields.map(([field]) => [field, options.has(field)] as const) }),
        ...values,
      ],
    }),
    parts: values,
    field: (key: string): Node.Node => {
      const found = given.fields.find(([field]) => field === key)
      if (found === undefined) {
        throw new Error(`[metakit] Transition.${name}: the element has no key field "${key}"`)
      }
      return found[1]
    },
  }
}

/** The list with `element` at the end. Two appends do not commute: the order shows. */
export const append = <State, Input, E, Supplied = NoSupplied>(
  list: List<State, Input, Supplied, E>,
  element: ElementInput<TransitionEnv<State, Input, Supplied>, NoInfer<E>>,
): WriteEquation<State, Input, ReadonlyArray<E>, Supplied, 'append'> => {
  const made = appended(list.node, element, 'append')
  return write(list, 'append', made.node, Way.append({ element: made.parts }))
}

/** The list with `element` at the end, unless an element has its key; then the list as it was. */
export const insert = <
  State,
  Input,
  E,
  Supplied = NoSupplied,
  K extends keyof E & string = 'id' & keyof E,
>(
  list: List<State, Input, Supplied, E>,
  element: ElementInput<TransitionEnv<State, Input, Supplied>, NoInfer<E>>,
  options?: { readonly key?: K },
): WriteEquation<State, Input, ReadonlyArray<E>, Supplied, 'insert'> => {
  const key = options?.key ?? 'id'
  const made = appended(list.node, element, 'insert')
  const keyValue = made.field(key)
  const present = rowsOver('any', list.node, {
    where: Node.Call({ op: isOp, args: [keyOf(key), keyValue] }),
  })
  // Validate the inserted key even when the list is empty (`any` runs 0 iterations),
  // so an uncomparable key (e.g. holding a NUL) refuses on the first run as on the second.
  const cond = Node.Call({
    op: andOp,
    args: [Node.Call({ op: isOp, args: [keyValue, keyValue] }), present],
  })
  return write(
    list,
    'insert',
    Node.If({ cond, then: list.node, otherwise: made.node }),
    Way.insert({ element: made.parts, key }),
  )
}

/** The list without the elements whose key is `value`; every one with it, where two share it. */
export const remove = <
  State,
  Input,
  E,
  Supplied = NoSupplied,
  K extends keyof E & string = 'id' & keyof E,
>(
  list: List<State, Input, Supplied, E>,
  value: ExprInput<TransitionEnv<State, Input, Supplied>, NoInfer<E[K]>>,
  options?: { readonly key?: K },
): WriteEquation<State, Input, ReadonlyArray<E>, Supplied, 'remove'> => {
  const key = options?.key ?? 'id'
  const by = toNode(value)
  return write(
    list,
    'remove',
    rowsOver('keep', list.node, { where: Node.Call({ op: isNotOp, args: [keyOf(key), by] }) }),
    Way.remove({ key, value: by }),
  )
}

/** The list without the elements that pass `test`; an element whose test is null stays. */
export const removeWhere = <State, Input, E, Supplied = NoSupplied>(
  list: List<State, Input, Supplied, E>,
  test: Test<State, Input, Supplied, NoInfer<E>>,
): WriteEquation<State, Input, ReadonlyArray<E>, Supplied, 'removeWhere'> => {
  const passes = bodyOf(
    elementAst(list.node),
    test as (each: Each<unknown>) => unknown,
    'Transition.removeWhere',
  )
  return write(
    list,
    'removeWhere',
    rowsOver('keep', list.node, {
      where: Node.Call({ op: isNotOp, args: [passes, Node.Lit({ value: true })] }),
    }),
    Way.removeWhere({ test: passes }),
  )
}

/** The entries `set` gives for an element: a field per key, each a body over the element. */
const setOf = (
  list: Node.Node,
  set: (each: Each<unknown>) => Readonly<Record<string, unknown>>,
  name: string,
): ReadonlyArray<readonly [string, Node.Node]> => {
  const entries = Object.entries(set(Path.accessor([Node.EACH], elementAst(list))))
    .filter(([, value]) => value !== undefined)
    .map(([field, value]) => [field, checkBody(toNode(value), name)] as const)
  if (entries.length === 0) throw new Error(`[metakit] ${name}: a patch sets at least one field`)
  return entries
}

/** Each element whose key is `value` changed by `set`; every one with it, where two share it. */
export const patch = <
  State,
  Input,
  E,
  Supplied = NoSupplied,
  K extends keyof E & string = 'id' & keyof E,
>(
  list: List<State, Input, Supplied, E>,
  value: ExprInput<TransitionEnv<State, Input, Supplied>, NoInfer<E[K]>>,
  set: (each: Each<NoInfer<E>>) => Patch<BodyEnv<State, Input, Supplied, NoInfer<E>>, NoInfer<E>>,
  options?: { readonly key?: K },
): WriteEquation<State, Input, ReadonlyArray<E>, Supplied, 'patch'> => {
  const key = options?.key ?? 'id'
  const by = toNode(value)
  const fields = setOf(
    list.node,
    set as (each: Each<unknown>) => Readonly<Record<string, unknown>>,
    'Transition.patch',
  )
  return write(
    list,
    'patch',
    rowsOver('patch', list.node, {
      where: Node.Call({ op: isOp, args: [keyOf(key), by] }),
      set: fields,
    }),
    Way.patch({ key, value: by, set: fields }),
  )
}

/** Each element that passes `test` changed by `set`. */
export const patchWhere = <State, Input, E, Supplied = NoSupplied>(
  list: List<State, Input, Supplied, E>,
  test: Test<State, Input, Supplied, NoInfer<E>>,
  set: (each: Each<NoInfer<E>>) => Patch<BodyEnv<State, Input, Supplied, NoInfer<E>>, NoInfer<E>>,
): WriteEquation<State, Input, ReadonlyArray<E>, Supplied, 'patchWhere'> => {
  const passes = bodyOf(
    elementAst(list.node),
    test as (each: Each<unknown>) => unknown,
    'Transition.patchWhere',
  )
  const fields = setOf(
    list.node,
    set as (each: Each<unknown>) => Readonly<Record<string, unknown>>,
    'Transition.patchWhere',
  )
  return write(
    list,
    'patchWhere',
    rowsOver('patch', list.node, { where: passes, set: fields }),
    Way.patchWhere({ test: passes, set: fields }),
  )
}

/** A set held as a list of scalars kept in ascending order, with `value` added unless it is there. */
export const include = <State, Input, E extends number | string, Supplied = NoSupplied>(
  list: List<State, Input, Supplied, E>,
  value: ExprInput<TransitionEnv<State, Input, Supplied>, NoInfer<E> | null>,
): WriteEquation<State, Input, ReadonlyArray<E>, Supplied, 'include'> => {
  const by = toNode(value)
  return write(
    list,
    'include',
    Node.Call({ op: includeOp, args: [list.node, by] }),
    Way.include({ value: by }),
  )
}

/** A set held as a sorted list of scalars, with `value` taken out. */
export const exclude = <State, Input, E extends number | string, Supplied = NoSupplied>(
  list: List<State, Input, Supplied, E>,
  value: ExprInput<TransitionEnv<State, Input, Supplied>, NoInfer<E> | null>,
): WriteEquation<State, Input, ReadonlyArray<E>, Supplied, 'exclude'> => {
  const by = toNode(value)
  return write(
    list,
    'exclude',
    Node.Call({ op: excludeOp, args: [list.node, by] }),
    Way.exclude({ value: by }),
  )
}
