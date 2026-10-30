// @vitest-environment jsdom
/**
 * What code outside the application's context reports (a Mount): handed to
 * the document as a `DiagnosticEvent`, claimed by `Diagnostics.layer` while it
 * is built, and otherwise reported to the reporter in context.
 */
import { Effect, Exit, Layer, Scope } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'
import { Diagnostics, type Diagnostic } from '../src/index.js'

const failed: Diagnostic = {
  _tag: 'Probe',
  source: 'foldkit-test',
  level: 'error',
  message: 'a Mount broke',
}

afterEach(() => {
  document.body.replaceChildren()
})

/** `effect` with `fallback` as the reporter in context, which an unclaimed event reaches. */
const dispatched = (element: Element, fallback: ReturnType<typeof Diagnostics.collect>) =>
  Effect.runSync(
    Effect.provideService(
      Diagnostics.dispatch(element, failed),
      Diagnostics.Reporter,
      fallback.report,
    ),
  )

/** Builds `Diagnostics.layer(application.report)` and returns the scope that holds it. */
const claiming = (application: ReturnType<typeof Diagnostics.collect>) => {
  const scope = Effect.runSync(Scope.make())
  Effect.runSync(Layer.buildWithScope(Diagnostics.layer(application.report), scope))
  return scope
}

/** Lets the claimed report, forked from the listener, run. */
const settled = () => new Promise(resolve => setTimeout(resolve, 0))

const attached = () => document.body.appendChild(document.createElement('div'))

describe('Diagnostics.dispatch', () => {
  it('reports to the reporter in context when nothing claims it', () => {
    const fallback = Diagnostics.collect()
    dispatched(attached(), fallback)
    expect(fallback.reported).toEqual([failed])
  })

  it('is claimed by Diagnostics.layer for its reporter, and reported once', async () => {
    const [application, fallback] = [Diagnostics.collect(), Diagnostics.collect()]
    const scope = claiming(application)
    dispatched(attached(), fallback)
    await settled()
    expect([application.reported, fallback.reported]).toEqual([[failed], []])
    Effect.runSync(Scope.close(scope, Exit.void))
  })

  it('reaches the document from an element that has left it', async () => {
    const [application, fallback] = [Diagnostics.collect(), Diagnostics.collect()]
    const scope = claiming(application)
    dispatched(document.createElement('div'), fallback)
    await settled()
    expect([application.reported, fallback.reported]).toEqual([[failed], []])
    Effect.runSync(Scope.close(scope, Exit.void))
  })

  it('is no longer claimed once the layer is released', async () => {
    const [application, fallback] = [Diagnostics.collect(), Diagnostics.collect()]
    Effect.runSync(Scope.close(claiming(application), Exit.void))
    dispatched(attached(), fallback)
    await settled()
    expect([application.reported, fallback.reported]).toEqual([[], [failed]])
  })

  it('claims nothing a second layer already claimed', async () => {
    const [first, second] = [Diagnostics.collect(), Diagnostics.collect()]
    const scopes = [claiming(first), claiming(second)]
    dispatched(attached(), Diagnostics.collect())
    await settled()
    expect([first.reported, second.reported]).toEqual([[failed], []])
    for (const scope of scopes) Effect.runSync(Scope.close(scope, Exit.void))
  })
})

describe('Diagnostics.layer', () => {
  it('is the reporter in context too', () => {
    const application = Diagnostics.collect()
    Effect.runSync(
      Diagnostics.report(failed).pipe(Effect.provide(Diagnostics.layer(application.report))),
    )
    expect(application.reported).toEqual([failed])
  })

  // Any script on the page can dispatch an event by that name; its detail
  // must not reach the application's sink.
  it('does not claim an event of the same name that it did not build', async () => {
    const application = Diagnostics.collect()
    const scope = claiming(application)
    const forged = new CustomEvent('foldkit-diagnostic', { detail: failed, cancelable: true })
    expect(document.dispatchEvent(forged)).toBe(true)
    await settled()
    expect(application.reported).toEqual([])
    Effect.runSync(Scope.close(scope, Exit.void))
  })
})
