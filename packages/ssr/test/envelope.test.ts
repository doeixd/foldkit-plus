// @vitest-environment jsdom
/**
 * Phase 1: the resume plan and its envelope. The browser's slice of the Model
 * crosses, nothing else does, and a payload that cannot be read back exactly is
 * refused with its reason.
 */
import { Result, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { RESUME_ATTRIBUTE, SSR } from 'foldkit-ssr'

const Model = Schema.Struct({
  draft: Schema.String,
  count: Schema.Number,
  // Server-only: rendered from, never sent.
  report: Schema.String,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ Ping: {} })
const App = Surface.application({
  Model,
  Message,
  initial: { draft: '', count: 0, report: '' },
  update: (model: Model) => ({ model }),
})

const plan = SSR.plan(App, {
  id: 'editor',
  state: Projection.pick(App.model.draft, App.model.count),
})

const served: Model = { draft: 'hello', count: 3, report: 'HUGE server-only report' }

/**
 * The page a browser would hold: the envelope on a stamped root. Set through
 * the DOM, so no encoding stands between the value and what `resume` reads;
 * the encoder is proved through the real pipeline in `envelopeInsertion`.
 */
const page = (...roots: ReadonlyArray<Record<string, string>>) => {
  const document = new DOMParser().parseFromString('<body><main>page</main></body>', 'text/html')
  for (const attributes of roots) {
    const root = document.createElement('div')
    for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value)
    document.body.append(root)
  }
  return document
}

const stamped = (envelope: string) => ({ 'data-foldkit-app': 'app', [RESUME_ATTRIBUTE]: envelope })

const reason = (result: Result.Result<Model, { readonly reason: string }>) =>
  Result.isFailure(result) ? result.failure.reason : 'resumed'

describe('A resume plan', () => {
  it('carries the slice across, onto the baseline', () => {
    const resumed = SSR.resume(plan, page(stamped(SSR.envelope(plan, served))))

    expect(resumed).toEqual(Result.succeed({ draft: 'hello', count: 3, report: '' }))
  })

  it('sends nothing outside the slice', () => {
    expect(SSR.envelope(plan, served)).not.toContain('HUGE')
  })

  it('starts from a copy of the baseline, so a frozen one is never written', () => {
    const baseline = Object.freeze({ draft: '', count: 0, report: '' })
    const frozen = SSR.plan(App, { id: 'editor', state: plan.state, baseline })

    const resumed = SSR.resume(frozen, page(stamped(SSR.envelope(frozen, served))))

    expect(resumed).toEqual(Result.succeed({ draft: 'hello', count: 3, report: '' }))
    expect(baseline.draft).toBe('')
  })
})

describe('A page it cannot resume is refused, with the reason', () => {
  it.each([
    ['Missing', page(), 'the page holds no stamped application root'],
    ['Missing', page({ 'data-foldkit-app': 'app' }), 'the page holds no resume envelope'],
    [
      'Duplicate',
      page({ 'data-foldkit-app': 'a' }, { 'data-foldkit-app': 'b' }),
      'the page holds 2 stamped application roots',
    ],
    ['Unreadable', page(stamped('{not json')), 'the resume envelope is not JSON'],
    [
      'Protocol',
      page(stamped('{"v":2,"plan":"editor","state":{"draft":"x","count":1}}')),
      'protocol 2, not 1',
    ],
    [
      'Plan',
      page(stamped('{"v":1,"plan":"other","state":{"draft":"x","count":1}}')),
      'for plan "other", not "editor"',
    ],
    [
      'Invalid',
      page(stamped('{"v":1,"plan":"editor","state":{"draft":"x","count":"one"}}')),
      'does not decode',
    ],
  ] as const)('%s', (expected, document, message) => {
    const resumed = SSR.resume(plan, document)
    expect(reason(resumed)).toBe(expected)
    if (Result.isFailure(resumed)) expect(resumed.failure.message).toContain(message)
  })
})

describe('The envelope', () => {
  const LINE = String.fromCharCode(0x2028)
  const PARAGRAPH = String.fromCharCode(0x2029)
  const hostile = `</script><script>alert(1)</script><!--${LINE}${PARAGRAPH}"quoted"&quot;&#65;`

  it('cannot be broken out of by a string in the Model', () => {
    const json = SSR.envelope(plan, { ...served, draft: hostile })

    expect(json).not.toContain('<')
    expect(json).not.toContain(LINE)
    expect(json).not.toContain(PARAGRAPH)
    const resumed = SSR.resume(plan, page(stamped(json)))
    expect(resumed).toEqual(Result.succeed({ draft: hostile, count: 3, report: '' }))
  })
})
