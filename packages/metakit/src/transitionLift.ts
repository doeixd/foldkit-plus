/**
 * `Transition.lift`: a child's transition run inside a larger state, at a
 * path. Every read and write of the child's state moves under that path, the
 * way each write names moves with it, and the lifted transition is refused
 * where the state holds no child there.
 */
import { Option } from 'effect'
import * as Node from './node.js'
import { andOp, notOp } from './ops/bool.js'
import { wrap } from './ops/core.js'
import { isNullOp } from './ops/null.js'
import * as Path from './path.js'
import type { Path as PathType } from './path.js'
import {
  Way,
  type EmitSpec,
  type NoSupplied,
  type Transition,
  type TransitionEnv,
  type WriteEquation,
} from './transition.js'

const rewriteStatePrefix = (node: Node.Node, outerSegments: ReadonlyArray<string>): Node.Node => {
  if (outerSegments.length === 0) return node
  return Node.$match(node, {
    Lit: lit => lit,
    Path: ({ segments, ast }) =>
      segments[0] === 'state'
        ? Node.Path({ segments: ['state', ...outerSegments, ...segments.slice(1)], ast })
        : Node.Path({ segments, ast }),
    Call: ({ op, args }) =>
      Node.Call({ op, args: args.map(arg => rewriteStatePrefix(arg, outerSegments)) }),
    If: ({ cond, then, otherwise }) =>
      Node.If({
        cond: rewriteStatePrefix(cond, outerSegments),
        then: rewriteStatePrefix(then, outerSegments),
        otherwise: rewriteStatePrefix(otherwise, outerSegments),
      }),
    Match: ({ on, cases, otherwise }) =>
      Node.Match({
        on: rewriteStatePrefix(on, outerSegments),
        cases: cases.map(([v, b]) => [v, rewriteStatePrefix(b, outerSegments)] as const),
        otherwise: Option.map(otherwise, b => rewriteStatePrefix(b, outerSegments)),
      }),
    Opaque: ({ name, reads, run: fn }) =>
      Node.Opaque({
        name,
        reads: Option.map(reads, list =>
          list.map(segs =>
            segs[0] === 'state' ? ['state', ...outerSegments, ...segs.slice(1)] : segs,
          ),
        ),
        run: env => {
          const outer = env as TransitionEnv<unknown, unknown, unknown>
          const innerState = Path.get(Path.make<unknown, unknown>(outerSegments), outer.state)
          // No child to run over: null, as a read of it is.
          return Option.match(innerState, {
            onNone: () => null,
            onSome: state =>
              state === null || state === undefined ? null : fn({ ...outer, state }),
          })
        },
      }),
    Rows: rows =>
      Node.mapRows(
        rows,
        source => rewriteStatePrefix(source, outerSegments),
        body => rewriteStatePrefix(body, outerSegments),
      ),
  })
}

/** `way` with each of its nodes passed through `move`. */
const moveWay = (way: Way, move: (node: Node.Node) => Node.Node): Way => {
  const fields = (set: ReadonlyArray<readonly [string, Node.Node]>) =>
    set.map(([field, value]) => [field, move(value)] as const)
  return Way.$match(way, {
    set: () => way,
    add: ({ amount }) => Way.add({ amount: move(amount) }),
    combine: ({ op, value }) => Way.combine({ op, value: move(value) }),
    append: ({ element }) => Way.append({ element: element.map(move) }),
    insert: ({ element, key }) => Way.insert({ element: element.map(move), key }),
    remove: ({ key, value }) => Way.remove({ key, value: move(value) }),
    removeWhere: ({ test }) => Way.removeWhere({ test: move(test) }),
    patch: ({ key, value, set }) => Way.patch({ key, value: move(value), set: fields(set) }),
    patchWhere: ({ test, set }) => Way.patchWhere({ test: move(test), set: fields(set) }),
    include: ({ value }) => Way.include({ value: move(value) }),
    exclude: ({ value }) => Way.exclude({ value: move(value) }),
  })
}

/**
 * Lift a child `Transition<Inner, Input, Emit>` along `Path<Outer, Inner>` so
 * it operates inside a larger `Outer` model, propagating exact read/write
 * footprints automatically. The lifted transition is refused where the model
 * holds no child at `path`: its guard asks that there is one, so a write
 * never invents the struct it writes into.
 */
export const lift = <Outer, Inner, Input, Emit, Supplied = NoSupplied>(
  path: PathType<Outer, Inner>,
  transition: Transition<Inner, Input, Emit, Supplied>,
): Transition<Outer, Input, Emit, Supplied> => {
  const move = (node: Node.Node): Node.Node => rewriteStatePrefix(node, path.segments)
  return {
    _tag: 'Transition',
    stateSchema: Option.none(),
    inputSchema: transition.inputSchema,
    suppliedSchema: transition.suppliedSchema,
    when: wrap(
      path.segments.length === 0
        ? transition.when.node
        : Node.Call({
            op: andOp,
            args: [
              Node.Call({
                op: notOp,
                args: [
                  Node.Call({
                    op: isNullOp,
                    args: [Node.Path({ segments: ['state', ...path.segments], ast: path.ast })],
                  }),
                ],
              }),
              move(transition.when.node),
            ],
          }),
    ),
    writes: Object.freeze(
      transition.writes.map((eq): WriteEquation<Outer, Input, unknown, Supplied> => ({
        _tag: 'WriteEquation',
        target: Object.freeze([...path.segments, ...eq.target]),
        value: wrap<TransitionEnv<Outer, Input, Supplied>, unknown>(move(eq.value.node)),
        way: moveWay(eq.way, move),
      })),
    ),
    emits: transition.emits.map((entry): EmitSpec => ({
      tag: entry.tag,
      fields: entry.fields.map(([name, node]) => [name, move(node)] as const),
      when: Option.map(entry.when, move),
    })),
  }
}
