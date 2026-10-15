/**
 * The Sheet on a real page: the open panel spans the edge it comes from and
 * borders only the side facing the page, and its handle Slot is hidden until
 * `handle: 'bar'` draws it on that side.
 */
import { Schema } from 'effect'
import { Dialog as UiDialog } from '@foldkit/ui'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style, type StyleValues } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Dialog, DialogSlots } from '../src/index.js'
import { Sheet } from '../src/recipes/sheet.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const L = Layers.standard

const Model = Schema.Struct({ dialog: UiDialog.Model })
type Model = typeof Model.Type

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/** Opens a dialog styled by `pieces` and returns its panel, drawn and laid out. */
const openPanel = async (pieces: StyleValues<typeof DialogSlots>) => {
  const style = Style.forSlots(DialogSlots)(pieces)
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'sheet-browser'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<UiDialog.Message>) =>
    UiDialog.view(
      model.dialog,
      {
        toView: Dialog.toView([style.mixin], { h }, dialog =>
          h.dialog(
            dialog.dialog,
            dialog.isVisible
              ? [
                  h.div(dialog.backdrop),
                  h.div(dialog.panel, [h.div(dialog.handle), h.h2(dialog.title, ['Filters'])]),
                ]
              : [],
          ),
        ),
      },
      h,
    )
  const opened = UiDialog.open(UiDialog.init({ id: 'edge' }))
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { dialog: opened.model } }),
      update: (model: Model, message: UiDialog.Message) => ({
        model: { dialog: UiDialog.update(model.dialog, message).model },
      }),
      view,
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('h2')).toBeTruthy())
  const panel = document.querySelector('h2')!.parentElement!
  return { panel, grabber: panel.firstElementChild!, dispose: () => handle.dispose() }
}

test('a right sheet spans the right edge, bordered on its left', async () => {
  const { panel, grabber, dispose } = await openPanel(Sheet({ side: 'right' }))
  try {
    expect(getComputedStyle(grabber).display).toBe('none')
    expect(grabber.getAttribute('aria-hidden')).toBe('true')
    const box = panel.getBoundingClientRect()
    expect(Math.abs(box.right - document.documentElement.clientWidth)).toBeLessThan(1)
    expect(box.top).toBeLessThan(1)
    expect(Math.abs(box.bottom - window.innerHeight)).toBeLessThan(1)
    // `min(24rem, 75%)` at 1440px, its padding and border inside it.
    expect(box.width).toBeCloseTo(384, 0)
    const look = getComputedStyle(panel)
    expect(look.borderLeftWidth).toBe('1px')
    expect(look.borderTopWidth).toBe('0px')
    expect(look.borderTopLeftRadius).toBe('0px')
  } finally {
    dispose()
  }
})

test('a bottom sheet with a bar rounds its top corners, its handle above the title', async () => {
  const { panel, grabber, dispose } = await openPanel(Sheet({ side: 'bottom', handle: 'bar' }))
  try {
    const box = panel.getBoundingClientRect()
    expect(Math.abs(box.bottom - window.innerHeight)).toBeLessThan(1)
    expect(box.left).toBeLessThan(1)
    expect(Math.abs(box.right - document.documentElement.clientWidth)).toBeLessThan(1)
    const look = getComputedStyle(panel)
    expect(look.borderTopWidth).toBe('1px')
    expect(look.borderTopLeftRadius).not.toBe('0px')
    expect(look.borderBottomLeftRadius).toBe('0px')
    const bar = grabber.getBoundingClientRect()
    expect(bar.height).toBeCloseTo(6, 0)
    expect(bar.width).toBeCloseTo(100, 0)
    expect(Math.abs(bar.left + bar.width / 2 - (box.left + box.width / 2))).toBeLessThan(1)
    const title = panel.querySelector('h2')!.getBoundingClientRect()
    expect(bar.bottom).toBeLessThanOrEqual(title.top)
  } finally {
    dispose()
  }
})

test('a top sheet with a bar draws its handle below the title', async () => {
  const { panel, grabber, dispose } = await openPanel(Sheet({ side: 'top', handle: 'bar' }))
  try {
    const title = panel.querySelector('h2')!.getBoundingClientRect()
    expect(grabber.getBoundingClientRect().top).toBeGreaterThanOrEqual(title.bottom)
  } finally {
    dispose()
  }
})

test('a right sheet with a bar stands its handle on the left edge, centered', async () => {
  const { panel, grabber, dispose } = await openPanel(Sheet({ side: 'right', handle: 'bar' }))
  try {
    const box = panel.getBoundingClientRect()
    const bar = grabber.getBoundingClientRect()
    expect(bar.width).toBeCloseTo(6, 0)
    expect(bar.height).toBeCloseTo(100, 0)
    expect(bar.left - box.left).toBeLessThan(box.width / 4)
    expect(Math.abs(bar.top + bar.height / 2 - (box.top + box.height / 2))).toBeLessThan(1)
  } finally {
    dispose()
  }
})
