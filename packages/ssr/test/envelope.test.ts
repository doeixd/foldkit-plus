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

/** The page a browser would hold: the envelope among whatever else it has. */
const page = (...scripts: ReadonlyArray<string>) =>
  new DOMParser().parseFromString(`<body><main>page</main>${scripts.join('')}</body>`, 'text/html')

const reason = (result: Result.Result<Model, { readonly reason: string }>) =>
  Result.isFailure(result) ? result.failure.reason : 'resumed'

describe('A resume plan', () => {
  it('carries the slice across, onto the baseline', () => {
    const resumed = SSR.resume(plan, page(SSR.envelope(plan, served)))

    expect(resumed).toEqual(Result.succeed({ draft: 'hello', count: 3, report: '' }))
  })

  it('sends nothing outside the slice', () => {
    expect(SSR.envelope(plan, served)).not.toContain('HUGE')
  })

  it('starts from a copy of the baseline, so a frozen one is never written', () => {
    const baseline = Object.freeze({ draft: '', count: 0, report: 'kept' })
    const frozen = SSR.plan(App, { id: 'editor', state: plan.state, baseline })

    const resumed = SSR.resume(frozen, page(SSR.envelope(frozen, served)))

    expect(resumed).toEqual(Result.succeed({ draft: 'hello', count: 3, report: 'kept' }))
    expect(baseline.draft).toBe('')
  })
})

describe('A page it cannot resume is refused, with the reason', () => {
  const script = (body: string) =>
    `<script type="application/json" ${RESUME_ATTRIBUTE}>${body}</script>`

  it.each([
    ['Missing', page()],
    ['Duplicate', page(SSR.envelope(plan, served), SSR.envelope(plan, served))],
    ['Unreadable', page(script('{not json'))],
    ['Protocol', page(script('{"v":2,"plan":"editor","state":{"draft":"x","count":1}}'))],
    ['Plan', page(script('{"v":1,"plan":"other","state":{"draft":"x","count":1}}'))],
    ['Invalid', page(script('{"v":1,"plan":"editor","state":{"draft":"x","count":"one"}}'))],
  ] as const)('%s', (expected, document) => {
    expect(reason(SSR.resume(plan, document))).toBe(expected)
  })
})

describe('The envelope', () => {
  const LINE = String.fromCharCode(0x2028)
  const PARAGRAPH = String.fromCharCode(0x2029)
  const hostile = `</script><script>alert(1)</script><!--${LINE}${PARAGRAPH}`

  it('cannot be broken out of by a string in the Model', () => {
    const text = SSR.envelope(plan, { ...served, draft: hostile })
    const body = text.slice(text.indexOf('>') + 1, text.lastIndexOf('</script>'))

    expect(body).not.toContain('<')
    expect(body).not.toContain(LINE)
    expect(body).not.toContain(PARAGRAPH)
    // One script in the page, holding the whole value.
    const document = page(text)
    expect(document.querySelectorAll('script')).toHaveLength(1)
    expect(SSR.resume(plan, document)).toEqual(
      Result.succeed({ draft: hostile, count: 3, report: '' }),
    )
  })
})
