/**
 * `Transition.lift`: a child's transition run inside a larger state, at a
 * path. Every read and write of the child's state moves under that path, the
 * way each write names moves with it, and the lifted transition is refused
 * where the state holds no child there.
 */
import { Option, SchemaAST } from 'effect'
import * as Node from './node.js'
import { andOp, notOp } from './ops/bool.js'
import { wrap } from './ops/core.js'
import { isNullOp } from './ops/null.js'
import * as Path from './path.js'
import type { Path as PathType } from './path.js'
import {
  transitionProto,
  Way,
  type EmitSpec,
  type NoSupplied,
  type Transition,
  type TransitionEnv,
  type TransitionPostEnv,
  type WriteEquation,
} from './transition.js'

const isOptionAst = (ast: SchemaAST.AST, seen = new Set<SchemaAST.AST>()): boolean => {
  if (seen.has(ast)) return false
  seen.add(ast)
  if (Option.isSome(Path.optionInner(ast))) return true
  if (SchemaAST.isSuspend(ast)) return isOptionAst(ast.thunk(), seen)
  if (SchemaAST.isUnion(ast)) return ast.types.some(member => isOptionAst(member, seen))
  return false
}

/** Refuse lifting along a path whose Schema AST is or passes through an `Option`. */
export const assertLiftablePath = (
  path: Pick<PathType<never, unknown>, 'segments' | 'ast'>,
): void => {
  if (Option.exists(path.ast, isOptionAst)) {
    throw new Error(
      `[metakit] Transition.lift: "${Path.format(path.segments)}" is an Option field, whose inner fields cannot be written; lift along a nullable field (Schema.NullOr) instead.`,
    )
  }
}

const STATE_ROOTS: ReadonlySet<string> = new Set(['state'])
const POST_ROOTS: ReadonlySet<string> = new Set(['state', 'next'])

const rewriteStatePrefix = (
  node: Node.Node,
  outerSegments: ReadonlyArray<string>,
  projected: WeakMap<object, unknown>,
  roots: ReadonlySet<string> = STATE_ROOTS,
  bound: ReadonlySet<string> = new Set(),
): Node.Node => {
  if (outerSegments.length === 0) return node
  return Node.$match(node, {
    Lit: lit => lit,
    Path: ({ segments, ast }) => {
      const head = segments[0]
      return head !== undefined && roots.has(head) && !bound.has(head)
        ? Node.Path({ segments: [head, ...outerSegments, ...segments.slice(1)], ast })
        : Node.Path({ segments, ast })
    },
    Call: ({ op, args }) =>
      Node.Call({
        op,
        args: args.map(arg => rewriteStatePrefix(arg, outerSegments, projected, roots, bound)),
      }),
    If: ({ cond, then, otherwise }) =>
      Node.If({
        cond: rewriteStatePrefix(cond, outerSegments, projected, roots, bound),
        then: rewriteStatePrefix(then, outerSegments, projected, roots, bound),
        otherwise: rewriteStatePrefix(otherwise, outerSegments, projected, roots, bound),
      }),
    Match: ({ on, cases, otherwise }) =>
      Node.Match({
        on: rewriteStatePrefix(on, outerSegments, projected, roots, bound),
        cases: cases.map(
          ([v, b]) => [v, rewriteStatePrefix(b, outerSegments, projected, roots, bound)] as const,
        ),
        otherwise: Option.map(otherwise, b =>
          rewriteStatePrefix(b, outerSegments, projected, roots, bound),
        ),
      }),
    Opaque: ({ name, reads, run: fn }) => {
      const projectState = roots.has('state') && !bound.has('state')
      const projectNext = roots.has('next') && !bound.has('next')
      if (!projectState && !projectNext) return Node.Opaque({ name, reads, run: fn })
      return Node.Opaque({
        name,
        reads: Option.map(reads, list =>
          list.map(segs =>
            segs[0] !== undefined && roots.has(segs[0]) && !bound.has(segs[0])
              ? [segs[0], ...outerSegments, ...segs.slice(1)]
              : segs,
          ),
        ),
        // One projected environment per outer step, so a child's body runs once
        // however many of its written values read it. Scoped to this lift, so
        // separate mounts stay independent.
        run: env => {
          const outer = env as TransitionEnv<unknown, unknown, unknown> & {
            readonly next?: unknown
          }
          const innerState = projectState
            ? Path.get(Path.make<unknown, unknown>(outerSegments), outer.state)
            : Option.some(outer.state)
          // No child to run over: null, as a read of it is.
          return Option.match(innerState, {
            onNone: () => null,
            onSome: state => {
              if (projectState && (state === null || state === undefined)) return null
              const known = projected.get(outer)
              if (known !== undefined) return fn(known)
              let projectedEnv: Record<string, unknown> = projectState
                ? { ...outer, state }
                : { ...outer }
              if (projectNext) {
                const innerNext = Path.get(Path.make<unknown, unknown>(outerSegments), outer.next)
                if (
                  Option.isNone(innerNext) ||
                  innerNext.value === null ||
                  innerNext.value === undefined
                ) {
                  return null
                }
                projectedEnv = { ...projectedEnv, next: innerNext.value }
              }
              projected.set(outer, projectedEnv)
              return fn(projectedEnv)
            },
          })
        },
      })
    },
    Rows: rows => {
      const innerBound = new Set(bound)
      innerBound.add(Node.rowsEach(rows))
      return Node.mapRows(
        rows,
        source => rewriteStatePrefix(source, outerSegments, projected, roots, bound),
        body => rewriteStatePrefix(body, outerSegments, projected, roots, innerBound),
      )
    },
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
    move: ({ key, value, toIndex }) =>
      Way.move({ key, value: move(value), toIndex: move(toIndex) }),
  })
}

/**
 * Lift a child `Transition<Inner, Input, Emit>` along `Path<Outer, Inner>` so
 * it operates inside a larger `Outer` model, propagating exact read/write
 * footprints automatically. The lifted transition is refused where the model
 * holds no child at `path`: its guard asks that there is one, so a write
 * never invents the struct it writes into. Throws at definition time when
 * `path` targets an `Option` field (lift along a nullable field instead).
 */
export const lift = <Outer, Inner, Input, Emit, Supplied = NoSupplied>(
  path: PathType<Outer, Inner>,
  transition: Transition<Inner, Input, Emit, Supplied>,
): Transition<Outer, Input, Emit, Supplied> => {
  assertLiftablePath(path)
  const projected = new WeakMap<object, unknown>()
  const move = (node: Node.Node): Node.Node =>
    rewriteStatePrefix(node, path.segments, projected, STATE_ROOTS)
  const movePost = (node: Node.Node): Node.Node =>
    rewriteStatePrefix(node, path.segments, projected, POST_ROOTS)
  return Object.assign(Object.create(transitionProto) as Transition<Outer, Input, Emit, Supplied>, {
    _tag: 'Transition' as const,
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
    ensures: Option.map(transition.ensures, post =>
      wrap<TransitionPostEnv<Outer, Input, Supplied>, boolean | null>(movePost(post.node)),
    ),
  })
}
