import { Option, Result } from 'effect'
import { Bool, Expr, Node, Num, Path, Verdict } from 'metakit'
import { keySegment } from 'foldkit-successor/block'
import {
  countedToggle,
  incomplete,
  initial,
  invariant,
  rows,
  target,
  toggle,
  type Model,
} from './todos.js'

const keys = ['7', '8'] as const
type Key = (typeof keys)[number]
const statuses = ['missing', 'incomplete', 'completed'] as const
type Status = (typeof statuses)[number]

const sameTerm = (left: Node.Node, right: Node.Node): boolean => Node.key(left) === Node.key(right)
const isTrue = (node: Node.Node) => sameTerm(node, Expr.lit(true).node)

// The binding replaces exactly one occurrence and runs the parent once for each output.
// These terms certify that the only effect is that row's contribution changing by ±1.
export const countTerms = (delta: typeof countedToggle) => {
  const done = Path.forSchema(rows.child.model).done
  const toggleRow = rows.child.machine.transitions.Toggle
  const child = toggleRow.writes[0]
  const output = toggleRow.emits[0]
  const parent = delta.writes[0]
  if (
    !isTrue(toggleRow.when.node) ||
    toggleRow.writes.length !== 1 ||
    child?.target.length !== 1 ||
    child.target[0] !== 'done' ||
    !sameTerm(child.value.node, Bool.not(Path.make<unknown, boolean>(['state', 'done'])).node) ||
    toggleRow.emits.length !== 1 ||
    output?.tag !== 'ChangedCompletion' ||
    Option.isSome(output.when) ||
    output.fields.length !== 1 ||
    output.fields[0]?.[0] !== 'done' ||
    !sameTerm(output.fields[0][1], child.value.node) ||
    !isTrue(delta.when.node) ||
    delta.writes.length !== 1 ||
    parent?.target.length !== 1 ||
    parent.target[0] !== 'remaining' ||
    !sameTerm(incomplete.contribution.node, Expr.when(Bool.not(done), { then: 1, else: 0 }).node)
  )
    return Option.none()

  const remaining = Path.make<unknown, number>(['state', 'remaining'])
  const newDone = Path.make<unknown, boolean>(['input'])
  const amount = Expr.when(newDone, { then: -1, else: 1 })
  if (
    !sameTerm(parent.value.node, Num.add(remaining, Num.mul(amount, 1)).node) &&
    !sameTerm(parent.value.node, Num.add(remaining, Num.mul(amount, -1)).node)
  )
    return Option.none()
  return Option.some({ nextDone: child.value.node, nextRemaining: parent.value.node })
}

const stateFor = (left: Status, right: Status): Model => {
  const base = initial('work')
  const rows = { ...base.rows }
  let remaining = 0
  for (const [key, status] of [
    ['7', left],
    ['8', right],
  ] as const) {
    const segment = keySegment(key)
    if (status === 'missing') {
      delete rows[segment]
    } else {
      const occurrence = rows[segment]!
      rows[segment] = {
        ...occurrence,
        model: { ...occurrence.model, done: status === 'completed' },
      }
      if (status === 'incomplete') remaining++
    }
  }
  return { ...base, rows, remaining }
}

interface Witness {
  readonly before: Model
  readonly key: Key
  readonly after: Model
}

export interface Report {
  readonly claim: 'remaining is the number of incomplete rows after the Toggle commit'
  readonly transition: 'Todos.rows.TodoRow.Toggle'
  readonly encoding: 'successor-todo/2'
  readonly domain: 'any key in a valid list of at most Number.MAX_SAFE_INTEGER rows'
  readonly arithmetic: 'safe integers; no null fields'
  readonly atomicity: 'child and parent publish one commit'
  readonly checked: number
  readonly verdict: Verdict.Verdict<Witness>
}

/** Check both contributions; the untouched rows add the same bounded total before and after. */
export const verifyToggle = (delta: typeof countedToggle = countedToggle): Report => {
  const metadata = {
    claim: 'remaining is the number of incomplete rows after the Toggle commit',
    transition: 'Todos.rows.TodoRow.Toggle',
    encoding: 'successor-todo/2',
    domain: 'any key in a valid list of at most Number.MAX_SAFE_INTEGER rows',
    arithmetic: 'safe integers; no null fields',
    atomicity: 'child and parent publish one commit',
  } as const
  let checked = 0
  if (!invariant(initial('work'))) {
    return {
      ...metadata,
      checked,
      verdict: Verdict.Unknown('Initialization violates the count invariant'),
    }
  }
  if (Option.isNone(countTerms(delta))) {
    return {
      ...metadata,
      checked,
      verdict: Verdict.Unknown('The composed writes exceed the keyed count proof fragment'),
    }
  }
  for (const left of statuses) {
    for (const right of statuses) {
      const before = stateFor(left, right)
      if (!invariant(before)) throw new Error('Verification fixture supplied an invalid pre-state')
      for (const key of keys) {
        if (!Object.hasOwn(before.rows, keySegment(key))) continue
        checked++
        const step = toggle(before, target(before, key), 'incremental', delta)
        if (Result.isFailure(step)) {
          return {
            ...metadata,
            checked,
            verdict: Verdict.Unknown('An admitted Toggle was refused'),
          }
        }
        const after = step.success.state
        if (!invariant(after)) {
          return {
            ...metadata,
            checked,
            verdict: Verdict.False(Option.some({ before, key, after })),
          }
        }
      }
    }
  }
  return { ...metadata, checked, verdict: Verdict.True(Option.some(Verdict.Proved('concrete'))) }
}

export const requireToggle = (report: Report): void => {
  const failed = `Pinned obligation ${report.transition} failed for ${report.domain}`
  Verdict.match(report.verdict, {
    True: () => {},
    False: ({ witness }) => {
      const key = Option.getOrThrow(witness).key
      throw new Error(`${failed}. The count disagrees after toggling key ${key}.`)
    },
    Unknown: ({ reason }) => {
      throw new Error(`${failed}. ${reason}`)
    },
  })
}

export interface CheckedPlan {
  readonly report: Report
  readonly toggle: (before: Model, key: string) => ReturnType<typeof toggle>
}

export const prepareToggle = (delta: typeof countedToggle = countedToggle): CheckedPlan => {
  const report = verifyToggle(delta)
  return {
    report,
    toggle: (before, key) =>
      toggle(
        before,
        target(before, key),
        Verdict.isTrue(report.verdict) ? 'incremental' : 'recompute',
        delta,
      ),
  }
}
