/**
 * The Dialog's panel on a real page: its width is what its size allows, its
 * padding inside it; a panel taller than the viewport stays inside it and
 * scrolls its body while the footer stays in view; and a dialog opened from
 * another steps the first back, and Escape closes only the one on top.
 */
import { Schema } from 'effect'
import { Dialog as UiDialog } from '@foldkit/ui'
import { mapMessages } from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style, type StyleValues } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
// Not the index: a test loads only what it tests.
import * as Dialog from '../src/dialog.js'
import { DialogSlots } from '../src/dialog.js'
import { Dialog as DialogRecipe } from '../src/recipes/dialog.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const L = Layers.standard

const Model = Schema.Struct({ outer: UiDialog.Model, inner: UiDialog.Model })
type Model = typeof Model.Type
type Which = 'outer' | 'inner'
type Message =
  | { readonly _tag: 'Got'; readonly which: Which; readonly message: UiDialog.Message }
  | { readonly _tag: 'Open'; readonly which: Which }

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const paragraphs = (h: HtmlBuilder<Message>, count: number): ReadonlyArray<Html> =>
  Array.from({ length: count }, (_, index) => h.p([], [`Line ${index + 1} of the terms.`]))

/**
 * An outer dialog, open, styled by `pieces`, with `lines` paragraphs in its
 * body and a footer; and an inner dialog its footer opens, drawn in the
 * outer `<dialog>` beside its panel.
 */
const mount = async (
  pieces: StyleValues<typeof DialogSlots>,
  lines: number,
  reset: boolean = true,
) => {
  const style = Style.forSlots(DialogSlots)(pieces)
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      L.declare,
      ...(reset ? [L.in('reset', Defaults.reset)] : []),
      L.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'dialog-panel'
  document.body.append(container)
  const lift =
    (which: Which) =>
    (message: UiDialog.Message): Message => ({ _tag: 'Got', which, message })
  const inner = (model: Model, h: HtmlBuilder<Message>) =>
    h.submodel({
      slotId: model.inner.id,
      model: model.inner,
      view: UiDialog.view,
      viewInputs: {
        toView: Dialog.toView([style.mixin], { h }, dialog =>
          h.dialog(
            dialog.dialog,
            dialog.isVisible
              ? [
                  h.div(dialog.backdrop),
                  h.div(dialog.panel, [
                    h.h2(dialog.title, ['Accept the terms?']),
                    h.button(dialog.closeButton, ['Back']),
                  ]),
                ]
              : [],
          ),
        ),
      },
      toParentMessage: lift('inner'),
    })
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.submodel({
      slotId: model.outer.id,
      model: model.outer,
      view: UiDialog.view,
      viewInputs: {
        toView: Dialog.toView(
          [style.mixin, ...Dialog.overlayBars],
          { h, covered: model.inner.isOpen },
          dialog =>
            h.dialog(
              dialog.dialog,
              dialog.isVisible
                ? [
                    h.div(dialog.backdrop),
                    h.div(dialog.panel, [
                      h.h2(dialog.title, ['Terms']),
                      h.div(dialog.body, [
                        h.div(dialog.scroll, paragraphs(h, lines)),
                        h.div(dialog.scrollBar, [h.div(dialog.scrollThumb)]),
                      ]),
                      h.div(dialog.footer, [
                        h.button([h.OnClick({ _tag: 'Open', which: 'inner' })], ['Accept']),
                      ]),
                    ]),
                    inner(model, h),
                  ]
                : [],
            ),
        ),
      },
      toParentMessage: lift('outer'),
    })
  const update = (model: Model, message: Message) => {
    const next =
      message._tag === 'Got'
        ? UiDialog.update(model[message.which], message.message)
        : UiDialog.open(model[message.which])
    return {
      model: { ...model, [message.which]: next.model },
      commands: mapMessages(next.commands, lift(message.which)),
    }
  }
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          outer: UiDialog.open(UiDialog.init({ id: 'terms' })).model,
          inner: UiDialog.init({ id: 'accept' }),
        },
      }),
      update,
      view,
    }),
  )
  const panel = await vi.waitFor(() => {
    const found = document.getElementById('terms-panel')
    expect(found).not.toBeNull()
    return found!
  })
  return { panel, dispose: () => handle.dispose() }
}

test('a medium panel is 32rem wide, its padding inside that, on a page without the reset', async () => {
  // The reset's `border-box` would hide a panel that counts its padding outside.
  const { panel, dispose } = await mount(DialogRecipe({}), 2, false)
  try {
    expect(panel.getBoundingClientRect().width).toBeCloseTo(512, 0)
  } finally {
    dispose()
  }
})

test('a full panel fills the viewport but a 1rem margin', async () => {
  const { panel, dispose } = await mount(DialogRecipe({ size: 'full' }), 2)
  try {
    const box = panel.getBoundingClientRect()
    expect(box.width).toBeCloseTo(document.documentElement.clientWidth - 32, 0)
    expect(box.height).toBeCloseTo(window.innerHeight - 32, 0)
  } finally {
    dispose()
  }
})

test('a long panel stays in the viewport, its body scrolls and its footer stays in view', async () => {
  const { panel, dispose } = await mount(DialogRecipe({}), 120)
  try {
    const box = panel.getBoundingClientRect()
    expect(box.top).toBeGreaterThanOrEqual(15)
    expect(window.innerHeight - box.bottom).toBeGreaterThanOrEqual(15)
    const scroll = panel.querySelector('h2 + div > div')!
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight)
    const footer = panel.lastElementChild!
    const before = footer.getBoundingClientRect()
    expect(before.bottom).toBeLessThanOrEqual(box.bottom)
    scroll.scrollTop = scroll.scrollHeight
    expect(footer.getBoundingClientRect().top).toBe(before.top)
    expect(panel.scrollTop).toBe(0)
  } finally {
    dispose()
  }
})

test('a dialog opened from another steps it back; Escape closes only the one on top', async () => {
  const { panel, dispose } = await mount(DialogRecipe({}), 2)
  try {
    await userEvent.click(panel.querySelector('footer, div:last-child > button')!)
    const inner = await vi.waitFor(() => {
      const found = document.getElementById('accept-panel')
      expect(found).not.toBeNull()
      expect(found!.contains(document.activeElement)).toBe(true)
      return found!
    })
    await vi.waitFor(() => expect(getComputedStyle(panel).scale).toBe('0.94'))
    // The one on top keeps its full size.
    expect(getComputedStyle(inner).scale).not.toBe('0.94')
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.getElementById('accept-panel')).toBeNull())
    expect(document.querySelector<HTMLDialogElement>('#terms-dialog, dialog')!.open).toBe(true)
    expect(document.getElementById('terms-panel')).not.toBeNull()
    await vi.waitFor(() => expect(getComputedStyle(panel).scale).not.toBe('0.94'))
  } finally {
    dispose()
  }
})
