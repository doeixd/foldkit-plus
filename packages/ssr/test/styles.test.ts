// @vitest-environment jsdom
/**
 * `styles` for the first paint where no template head can take it: the markup
 * rides as the rendered root's last children, `SSR.hydrate` moves it into the
 * head before adopting the nodes around it, so a page that never renders again
 * keeps its rules (#365), and a void root is refused rather than served
 * unstyled.
 */
import { Effect } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { describe, expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import {
  Message,
  calls,
  config,
  load,
  plan,
  settle,
  template,
  type Model,
} from './handoverFixture.js'

const css = 'p.count{color:red}.note>.fresh{color:blue}'
const styles = () => `<style data-first-paint>${css}</style>`

const rendered = (options: { readonly styles?: () => string } = {}) =>
  Effect.runPromise(SSR.render(config, plan, { buildId: 'b', ...options }))

describe('styles in the rendered root', () => {
  it('styles the first paint, then keeps the styles in the head as it hydrates', async () => {
    const served = SSR.page(template, await rendered({ styles }))
    load(served)
    const root = document.querySelector('[data-foldkit-app]')
    const style = root?.querySelector(':scope > style[data-first-paint]')
    expect(style?.textContent).toBe(css)
    const button = document.getElementById('count')

    SSR.hydrate(config, plan, { buildId: 'b' })
    await settle()

    expect(calls.init).toBe(1)
    expect(document.getElementById('count')).toBe(button)
    // Moved, not copied: the one sheet, in the head, and nothing of it left in the root.
    expect(document.querySelectorAll('style[data-first-paint]')).toHaveLength(1)
    expect(style?.parentNode).toBe(document.head)
    expect(root?.childNodes).toHaveLength(1)
    button?.click()
    await vi.waitFor(() => expect(button?.textContent).toBe('42'))
    expect(style?.isConnected).toBe(true)
  })

  it('keeps the styles of a page that is contained, and leaves no marker', async () => {
    load(SSR.page(template, await rendered({ styles })))
    const root = document.querySelector('[data-foldkit-app]')
    const style = document.querySelector('style[data-first-paint]')

    SSR.hydrate(config, plan, { buildId: 'another build' })
    await settle()

    expect(style?.parentNode).toBe(document.head)
    expect(document.body.inert).toBe(true)
    expect(Array.from(root?.childNodes ?? [], node => node.nodeType)).toEqual([Node.TEXT_NODE])
  })

  it('leaves the page alone for styles that add nothing', async () => {
    const result = await rendered({ styles: () => '' })
    expect(result.rendered.html).not.toContain('<style')
    load(SSR.page(template, result))
    SSR.hydrate(config, plan, { buildId: 'b' })
    await settle()
    expect(document.getElementById('count')?.textContent).toBe('41')
  })

  it('refuses styles for a void root, naming the tag', async () => {
    const voided = {
      ...config,
      view: (model: Model, h: HtmlBuilder<Message>) => ({
        title: 't',
        body: h.input([h.Id('only'), h.Value(String(model.count))]),
      }),
    }
    const refused = await Effect.runPromise(
      Effect.flip(SSR.render(voided, plan, { buildId: 'b', styles })),
    )
    expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'VoidRootWithStyles' })
    expect(refused.message).toContain('returned <input>')
  })
})
