import { Option, Result } from 'effect'
import { Verdict } from 'metakit'
import { keySegment } from 'foldkit-successor/block'
import { initial, invariant, invertedDelta, target, toggle, type Model } from './todos.js'

const keys = ['7', '8'] as const
type Key = (typeof keys)[number]
const statuses = ['missing', 'incomplete', 'completed'] as const
type Status = (typeof statuses)[number]

const bounded = (state: Model, key: string): boolean =>
  keys.some(candidate => candidate === key) &&
  Object.keys(state.rows).every(segment => keys.some(expected => segment === keySegment(expected)))

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
  readonly encoding: 'successor-todo/1'
  readonly domain: 'keys 7 and 8, each absent, incomplete, or complete'
  readonly arithmetic: 'safe integers; no null fields'
  readonly atomicity: 'child and parent publish one commit'
  readonly checked: number
  readonly verdict: Verdict.Verdict<Witness>
}

/** Exhausts the stated finite quotient. Labels, owner and incarnation are never read by the count. */
export const verifyToggle = (delta?: typeof invertedDelta): Report => {
  const metadata = {
    claim: 'remaining is the number of incomplete rows after the Toggle commit',
    transition: 'Todos.rows.TodoRow.Toggle',
    encoding: 'successor-todo/1',
    domain: 'keys 7 and 8, each absent, incomplete, or complete',
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

export const prepareToggle = (delta?: typeof invertedDelta, assess = verifyToggle): CheckedPlan => {
  const report = assess(delta)
  return {
    report,
    toggle: (before, key) =>
      toggle(
        before,
        target(before, key),
        Verdict.isTrue(report.verdict) && bounded(before, key) ? 'incremental' : 'recompute',
        delta,
      ),
  }
}
