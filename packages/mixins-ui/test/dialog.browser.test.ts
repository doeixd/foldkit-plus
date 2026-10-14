/**
 * The dialog recipe on a real page: the open panel sits in the middle of the
 * viewport, which `@foldkit/ui` covers with the dialog element.
 */
import { Schema } from 'effect'
import { Dialog as UiDialog } from '@foldkit/ui'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Dialog, DialogSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const L = Layers.standard
const style = Style.forSlots(DialogSlots)(Recipes.Dialog({}))

const Model = Schema.Struct({ dialog: UiDialog.Model })
type Model = typeof Model.Type

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

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
                h.div(dialog.panel, [h.h2(dialog.title, ['Delete this project?'])]),
              ]
            : [],
        ),
      ),
    },
    h,
  )

test('the open panel sits in the middle of the viewport', async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'dialog-browser'
  document.body.appendChild(container)
  const opened = UiDialog.open(UiDialog.init({ id: 'centered' }))
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
  try {
    await vi.waitFor(() => expect(document.querySelector('h2')).toBeTruthy())
    const panel = document.querySelector('h2')!.parentElement!.getBoundingClientRect()
    const middle = (panel.top + panel.bottom) / 2
    expect(Math.abs(middle - window.innerHeight / 2)).toBeLessThan(2)
  } finally {
    handle.dispose()
  }
})
