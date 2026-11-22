/**
 * `Transition.commutes`: whether two transitions give one state, one set of
 * emitted records and one refusal in either order, decided from their
 * footprints and the ways their writes name, never by running them.
 *
 * 1. A footprint that may read anything (an opaque term with no declared
 *    reads) is `Unknown`.
 * 2. Paths meet by prefix, `*` matching any one segment.
 * 3. A write of one meeting a read of the other (in its guard, a written
 *    value or an emitted record) is `Unknown`. The reads that belong to a way
 *    of writing on the path it writes (the total `add` adds to; the key, test
 *    and `set` of a list write) are left to rule 4.
 * 4. Two writes whose targets meet commute only where `writeProperties`
 *    lists their ways as commuting, on its condition; any other pair is
 *    `Unknown`.
 * 5. Two `add`s commute only where the total and both amounts are integers
 *    and the checker shows every total either order passes through is in
 *    the safe range.
 * 6. Otherwise `True`.
 *
 * It never answers `False`: only a run finds a counterexample. An `Unknown`
 * carries an obligation of the kind `walk`, a test that runs the pair in
 * both orders.
 */
import { Option, SchemaAST, type Schema } from 'effect'
import { collectFields, SAFE, type FieldInfo } from './abstract/fields.js'
import * as Interval from './abstract/interval.js'
import * as Node from './node.js'
import { elementAst } from './ops/arr.js'
import { cannotRefuse, kindOf } from './ops/kind.js'
import { readsOfNode } from './ops/reads.js'
import * as Path from './path.js'
import { writeProperties, type CommuteCondition } from './properties.js'
import { sameAnswer } from './propertyChecks.js'
import {
  readingNodes,
  Way,
  writtenPaths,
  type Transition,
  type WriteEquation,
} from './transition.js'
import * as Verdict from './verdict.js'

type AnyTransition = Transition<never, never, unknown, never>
type AnyWrite = WriteEquation<never, never, unknown, never>
type Segments = ReadonlyArray<string>

const walk = (reason: string): Verdict.Verdict<never> =>
  Verdict.Unknown(reason, Option.some({ kind: 'walk', detail: reason }))

const readsOf = (nodes: ReadonlyArray<Node.Node>): ReadonlyArray<Segments> =>
  nodes.flatMap(node => Option.getOrElse(readsOfNode(node), () => []))

/** What a body reads outside its element: a read of the transition's own slices. */
const outside = (body: Node.Node): ReadonlyArray<Segments> =>
  readsOf([body]).filter(segments => !Node.readsEach(segments))

/** The fields of the element a body reads; `*` where it reads the element whole. */
const fieldsRead = (body: Node.Node): ReadonlyArray<string> =>
  readsOf([body]).flatMap(segments => (Node.readsEach(segments) ? [segments[1] ?? Path.EVERY] : []))

const setBodies = (set: ReadonlyArray<readonly [string, Node.Node]>) =>
  set.map(([, value]) => value)

/**
 * The reads of a write that are not its way's own: the value of a `set`, the
 * amount of an `add`, an element, a key, and what a test or `set` reads
 * outside the element. The way's own reads (the total, the list's elements)
 * are left to rule 4.
 */
const ownReadsLeft = (write: AnyWrite): ReadonlyArray<Segments> =>
  Way.$match(write.way, {
    set: () => readsOf([write.value.node]),
    add: ({ amount }) => readsOf([amount]),
    append: ({ element }) => readsOf(element),
    insert: ({ element }) => readsOf(element),
    remove: ({ value }) => readsOf([value]),
    removeWhere: ({ test }) => outside(test),
    patch: ({ value, set }) => [...readsOf([value]), ...setBodies(set).flatMap(outside)],
    patchWhere: ({ test, set }) => [test, ...setBodies(set)].flatMap(outside),
    include: ({ value }) => readsOf([value]),
    exclude: ({ value }) => readsOf([value]),
  })

/** The fields of an element a list write reads to find or change the elements it does. */
const elementFieldsRead = (write: AnyWrite): ReadonlyArray<string> =>
  Way.$match(write.way, {
    set: () => [],
    add: () => [],
    append: () => [],
    include: () => [],
    exclude: () => [],
    insert: ({ key }) => [key],
    remove: ({ key }) => [key],
    removeWhere: ({ test }) => fieldsRead(test),
    patch: ({ key, set }) => [key, ...setBodies(set).flatMap(fieldsRead)],
    patchWhere: ({ test, set }) => [test, ...setBodies(set)].flatMap(fieldsRead),
  })

const fieldsSet = (write: AnyWrite): ReadonlyArray<string> =>
  Way.$match(write.way, {
    patch: ({ set }) => set.map(([field]) => field),
    patchWhere: ({ set }) => set.map(([field]) => field),
    set: () => [],
    add: () => [],
    append: () => [],
    insert: () => [],
    remove: () => [],
    removeWhere: () => [],
    include: () => [],
    exclude: () => [],
  })

const touches = (read: ReadonlyArray<string>, set: ReadonlyArray<string>): boolean =>
  read.some(field => field === Path.EVERY || set.includes(field))

/** The state reads of a transition that are not a way's own, from the state as writes are. */
const stateReads = (transition: AnyTransition): ReadonlyArray<Segments> =>
  [
    ...readsOf([transition.when.node]),
    ...readsOf(
      transition.emits.flatMap(entry => [
        ...Option.toArray(entry.when),
        ...entry.fields.map(([, node]) => node),
      ]),
    ),
    ...transition.writes.flatMap(ownReadsLeft),
  ].flatMap(segments => (segments[0] === 'state' ? [segments.slice(1)] : []))

/** The interval of an integer the transition reads, where its Schema bounds it; none otherwise. */
const integerOf = (
  transition: AnyTransition,
  node: Node.Node,
): Option.Option<Interval.Interval> => {
  if (Node.$is('Lit')(node)) {
    if (node.value === null) return Option.some(Interval.constant(0))
    return Number.isSafeInteger(node.value)
      ? Option.some(Interval.constant(node.value as number))
      : Option.none()
  }
  // A decrement is an `add` of the negated amount.
  if (Node.$is('Call')(node) && !Node.isForeign(node.op) && node.op.id === 'num.neg') {
    const [operand] = node.args
    return operand === undefined
      ? Option.none()
      : Option.map(integerOf(transition, operand), Interval.neg)
  }
  if (!Node.$is('Path')(node)) return Option.none()
  const slices: ReadonlyArray<readonly [string, Option.Option<Schema.Top>]> = [
    ['state', transition.stateSchema],
    ['input', transition.inputSchema],
    ['supplied', transition.suppliedSchema],
  ]
  const fields = new Map<string, FieldInfo>()
  for (const [slice, schema] of slices) {
    if (Option.isSome(schema)) collectFields(schema.value.ast, [slice], fields)
  }
  const info = Array.from(fields.values()).find(
    field => Path.format(field.segments) === Path.format(node.segments),
  )
  return info !== undefined && info.isInt ? Option.some(info.interval) : Option.none()
}

/** Rule 5: every total two `add`s pass through, in either order, stays in the safe range. */
const inRange = (a: AnyTransition, wa: AnyWrite, b: AnyTransition, wb: AnyWrite): boolean => {
  const amount = (write: AnyWrite) =>
    Way.$match(write.way, {
      add: ({ amount: by }) => Option.some(by),
      set: () => Option.none(),
      append: () => Option.none(),
      insert: () => Option.none(),
      remove: () => Option.none(),
      removeWhere: () => Option.none(),
      patch: () => Option.none(),
      patchWhere: () => Option.none(),
      include: () => Option.none(),
      exclude: () => Option.none(),
    })
  const total = integerOf(a, Node.Path({ segments: ['state', ...wa.target], ast: Option.none() }))
  const byA = Option.flatMap(amount(wa), node => integerOf(a, node))
  const byB = Option.flatMap(amount(wb), node => integerOf(b, node))
  if (Option.isNone(total) || Option.isNone(byA) || Option.isNone(byB)) return false
  const [t, x, y] = [total.value, byA.value, byB.value]
  return [Interval.add(t, x), Interval.add(t, y), Interval.add(Interval.add(t, x), y)].every(
    passed => Interval.within(passed, SAFE),
  )
}

const valueOf = (write: AnyWrite): Option.Option<Node.Node> =>
  Way.$match(write.way, {
    set: () => Option.some(write.value.node),
    include: ({ value }) => Option.some(value),
    exclude: ({ value }) => Option.some(value),
    add: () => Option.none(),
    append: () => Option.none(),
    insert: () => Option.none(),
    remove: () => Option.none(),
    removeWhere: () => Option.none(),
    patch: () => Option.none(),
    patchWhere: () => Option.none(),
  })

const literals = (wa: AnyWrite, wb: AnyWrite): Option.Option<readonly [unknown, unknown]> => {
  const [x, y] = [valueOf(wa), valueOf(wb)]
  return Option.isSome(x) &&
    Option.isSome(y) &&
    Node.$is('Lit')(x.value) &&
    Node.$is('Lit')(y.value)
    ? Option.some([x.value.value, y.value.value] as const)
    : Option.none()
}

/**
 * Two members a set compares as different: two texts or two numbers unequal
 * as the set compares them (`Node.textIdentity`). Two of different kinds (`1`
 * and `'1'`) do not decide: the set refuses whichever meets a member of the
 * other kind, so the order shows. Text holding a NUL and a number that is not
 * finite are refused before the set is read, whatever the order.
 */
const differ = (x: unknown, y: unknown): boolean =>
  typeof x === typeof y &&
  (typeof x === 'string' || typeof x === 'number') &&
  Node.textIdentity(x) !== Node.textIdentity(y)

/** The Schema of field `key` of the elements of the list a write changes, where the list's Schema says it. */
const elementField = (write: AnyWrite, key: string): Option.Option<SchemaAST.AST> => {
  const { node } = write.value
  if (!Node.$is('Rows')(node)) return Option.none()
  return Option.flatMap(elementAst(Node.rowsSource(node.over)), element =>
    Option.fromUndefinedOr(
      SchemaAST.isObjects(element)
        ? element.propertySignatures.find(property => property.name === key)?.type
        : undefined,
    ),
  )
}

/**
 * Whether a list write is refused by no element: its key and the element's
 * key field, or its test, and what it sets, are values no operation refuses
 * (`cannotRefuse`: no text that may hold a NUL). One that may be refused by
 * an element is refused or not by whether a removal ran first.
 */
const steady = (write: AnyWrite): boolean => {
  const keyed = (key: string, value: Node.Node) =>
    cannotRefuse(value) &&
    cannotRefuse(Node.Path({ segments: [Node.EACH, key], ast: elementField(write, key) }))
  // A value set is written, not compared: a read gives what it holds, even text with a NUL.
  const sets = (set: ReadonlyArray<readonly [string, Node.Node]>) =>
    setBodies(set).every(
      body => Node.$is('Path')(body) || Node.$is('Lit')(body) || cannotRefuse(body),
    )
  return Way.$match(write.way, {
    remove: ({ key, value }) => keyed(key, value),
    removeWhere: ({ test }) => cannotRefuse(test),
    patch: ({ key, value, set }) => keyed(key, value) && sets(set),
    patchWhere: ({ test, set }) => cannotRefuse(test) && sets(set),
    set: () => false,
    add: () => false,
    append: () => false,
    insert: () => false,
    include: () => false,
    exclude: () => false,
  })
}

const isRemoval = (write: AnyWrite): boolean =>
  Way.$is('remove')(write.way) || Way.$is('removeWhere')(write.way)

/** Rule 4: whether two writes to one path commute, on the condition `writeProperties` gives. */
const holds = (
  condition: CommuteCondition,
  a: AnyTransition,
  wa: AnyWrite,
  b: AnyTransition,
  wb: AnyWrite,
): boolean => {
  switch (condition) {
    case 'always':
      return true
    case 'one-kind':
      return Option.exists(Option.all([valueOf(wa), valueOf(wb)]), ([x, y]) => {
        const [kx, ky] = [kindOf(x), kindOf(y)]
        return Option.isSome(kx) && Option.isSome(ky) && kx.value === ky.value
      })
    case 'same-literal':
      return Option.exists(literals(wa, wb), ([x, y]) => sameAnswer(x, y))
    case 'different-literals':
      return Option.exists(literals(wa, wb), ([x, y]) => differ(x, y))
    case 'in-range':
      return inRange(a, wa, b, wb)
    case 'disjoint-fields': {
      const [setA, setB] = [fieldsSet(wa), fieldsSet(wb)]
      return (
        !touches(setA, setB) &&
        !touches(elementFieldsRead(wa), setB) &&
        !touches(elementFieldsRead(wb), setA)
      )
    }
    case 'steady':
      return steady(wa) && steady(wb)
    case 'reads-no-set-field': {
      const [removal, changed] = isRemoval(wa) ? [wa, wb] : [wb, wa]
      return steady(changed) && !touches(elementFieldsRead(removal), fieldsSet(changed))
    }
  }
}

const meetsAny = (reads: ReadonlyArray<Segments>, writes: ReadonlyArray<Segments>) =>
  reads.find(read => writes.some(written => Path.meets(read, written)))

/** Whether `a` and `b` give one state, one set of emitted records and one refusal in either order. */
export const commutes = <State, InputA, EmitA, SuppliedA, InputB, EmitB, SuppliedB>(
  a: Transition<State, InputA, EmitA, SuppliedA>,
  b: Transition<State, InputB, EmitB, SuppliedB>,
): Verdict.Verdict<never> => {
  const [x, y] = [a as unknown as AnyTransition, b as unknown as AnyTransition]
  for (const transition of [x, y]) {
    if (readingNodes(transition).some(node => Option.isNone(readsOfNode(node)))) {
      return walk('an opaque term may read anything')
    }
  }
  for (const [reader, writer] of [
    [x, y],
    [y, x],
  ] as const) {
    const met = meetsAny(stateReads(reader), writer.writes.flatMap(writtenPaths))
    if (met !== undefined) return walk(`one writes "${Path.format(met)}", which the other reads`)
  }
  for (const wa of x.writes) {
    for (const wb of y.writes) {
      if (!Path.meets(wa.target, wb.target)) continue
      const [tagA, tagB] = [wa.way._tag, wb.way._tag]
      const condition = writeProperties[tagA].commutes[tagB]
      const same = wa.target.length === wb.target.length
      if (!same || condition === undefined || !holds(condition, x, wa, y, wb)) {
        return walk(`a ${tagA} and a ${tagB} of "${Path.format(wa.target)}" do not decide`)
      }
    }
  }
  return Verdict.True()
}
