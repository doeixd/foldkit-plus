import { Option } from 'effect'
import type { AsyncData } from 'foldkit/asyncData'

/**
 * Thrown by `readAsyncData` for a `Failure`, so the nearest error boundary (an
 * island's `errorBoundary`) receives the Model's error as `error`.
 */
export class AsyncDataFailure<E = unknown> extends Error {
  readonly error: E

  constructor(error: E) {
    super('AsyncData is a Failure')
    this.name = 'AsyncDataFailure'
    this.error = error
  }
}

/** The data `readAsyncData` returns once a value has some. */
export interface AsyncDataReady<A, E> {
  readonly data: A
  /** A reload is in flight; `data` is the previous good value. */
  readonly isRefreshing: boolean
  /** The last reload failed; `data` is the previous good value. */
  readonly maybeStaleError: Option.Option<E>
}

// React retries a suspended tree when new props or state reach it, which is how
// the Model's next AsyncData arrives, so this promise never has to settle.
const waiting = new Promise<never>(() => {})

/**
 * Reads Model-owned `AsyncData` in a React component, suspending while it has
 * no data and throwing `AsyncDataFailure` on `Failure`. It starts no work: a
 * Foldkit Command loads, and the next value must reach the component as props
 * or React state for the suspended tree to retry.
 */
export const readAsyncData = <A, E>(value: AsyncData<A, E>): AsyncDataReady<A, E> => {
  switch (value._tag) {
    case 'Idle':
    case 'Loading':
      throw waiting
    case 'Failure':
      throw new AsyncDataFailure(value.error)
    case 'Success':
      return { data: value.data, isRefreshing: false, maybeStaleError: Option.none() }
    case 'Refreshing':
      return { data: value.data, isRefreshing: true, maybeStaleError: Option.none() }
    case 'Stale':
      return { data: value.data, isRefreshing: false, maybeStaleError: Option.some(value.error) }
  }
}
