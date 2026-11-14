/**
 * The FileDrop recipe in a real browser: Tab to the hidden file input rings
 * the zone; a disabled zone looks disabled.
 */
import { Schema } from 'effect'
import * as UpstreamFileDrop from '@foldkit/ui/fileDrop'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FileDrop, FileDropSlots, Recipes } from '../src/index.js'

type Message = UpstreamFileDrop.Message

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(FileDropSlots)(Recipes.FileDrop({}))
const L = Layers.standard

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (isDisabled: boolean) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('reset', Defaults.reset), L.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'file-drop'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: UpstreamFileDrop.Model,
      container,
      init: () => ({ model: UpstreamFileDrop.init({ id: 'upload' }) }),
      update: (model: UpstreamFileDrop.Model, message: Message) => ({
        model: UpstreamFileDrop.update(model, message).model,
      }),
      view: (model: UpstreamFileDrop.Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Style({ height: '3000px' })],
          [
            h.button([h.Id('before'), h.Type('button')], ['Before']),
            UpstreamFileDrop.view(
              model,
              {
                isDisabled,
                toView: render => {
                  const { root, input } = FileDrop.resolve(render, [style.mixin], {
                    input: undefined,
                    h,
                  })
                  return h.label([...root, h.Id('zone')], [h.input([...input]), 'Drop files here'])
                },
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const zone = () => document.getElementById('zone')!

test('Tab to the file input rings the zone', async () => {
  const handle = mount(false)
  try {
    await vi.waitFor(() => expect(zone()).not.toBeNull())
    const rest = getComputedStyle(zone()).outlineStyle
    document.getElementById('before')!.focus()
    await userEvent.keyboard('{Tab}')
    await vi.waitFor(() => expect(document.activeElement?.tagName).toBe('INPUT'))
    expect(getComputedStyle(zone()).outlineStyle).toBe('solid')
    expect(rest).not.toBe('solid')
  } finally {
    handle.dispose()
  }
})

test('a disabled zone looks disabled and keeps the pointer off', async () => {
  const live = mount(false)
  let enabled = ''
  try {
    await vi.waitFor(() => expect(zone()).not.toBeNull())
    enabled = getComputedStyle(zone()).opacity
    expect(getComputedStyle(zone()).cursor).toBe('pointer')
  } finally {
    live.dispose()
  }
  const handle = mount(true)
  try {
    await vi.waitFor(() => expect(zone()).not.toBeNull())
    expect(parseFloat(getComputedStyle(zone()).opacity)).toBeLessThan(parseFloat(enabled))
    expect(getComputedStyle(zone()).cursor).toBe('not-allowed')
  } finally {
    handle.dispose()
  }
})
