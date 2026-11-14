/**
 * Audit of #558 item 4 for portaled theme inheritance, on the shipped Popover:
 * a custom property set on an ancestor of the trigger reaches the panel or it
 * does not, and the Popover without an anchor of its own is the control. A
 * test named "today" pins current behaviour that a finding in
 * `docs/design/558-audit-FINDINGS.md` calls a gap.
 */
import { Schema } from 'effect'
import { Popover as UiPopover } from '@foldkit/ui'
import type { AnchorConfig } from '@foldkit/ui/anchor'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import * as Popover from '../../src/popover.js'
import { PopoverSlots } from '../../src/popover.js'
import { Popover as PopoverRecipe } from '../../src/recipes/popover.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(PopoverSlots)(PopoverRecipe({}))
const Model = Schema.Struct({ popover: UiPopover.Model })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Got'; readonly message: UiPopover.Message }

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/** A popover whose trigger sits in a region that sets `--audit-region`, opened by a press. */
const open = async (anchor: AnchorConfig) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'popover-theme'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { popover: UiPopover.init({ id: 'share' }) } }),
      update: (model: Model, message: Message) => {
        const next = UiPopover.update(model.popover, message.message)
        return {
          model: { popover: next.model },
          commands: mapMessages(next.commands, (inner): Message => ({
            _tag: 'Got',
            message: inner,
          })),
        }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Id('region'), h.Style({ '--audit-region': 'set' })],
          [
            h.submodel({
              slotId: 'share',
              model: model.popover,
              view: UiPopover.view,
              viewInputs: {
                anchor,
                toView: Popover.toView([style.mixin], { h }, popover =>
                  h.div(
                    [],
                    [
                      h.button(popover.button, ['Share']),
                      ...(popover.isVisible
                        ? [
                            h.div(popover.backdrop, []),
                            h.div(popover.layer, [h.div(popover.panel, [h.p([], ['Link'])])]),
                          ]
                        : []),
                    ],
                  ),
                ),
              },
              toParentMessage: (message: UiPopover.Message): Message => ({ _tag: 'Got', message }),
            }),
          ],
        ),
    }),
  )
  const trigger = await vi.waitFor(() => {
    const found = document.getElementById('share-button')
    expect(found).not.toBeNull()
    return found!
  })
  await userEvent.click(trigger)
  const panel = await vi.waitFor(() => {
    const found = document.getElementById('share-panel')
    expect(found).not.toBeNull()
    expect(getComputedStyle(found!).visibility).toBe('visible')
    return found!
  })
  return { panel, dispose: () => handle.dispose() }
}

test('the default anchor keeps the panel under the trigger region, so a region property reaches it', async () => {
  const shown = await open(Popover.anchor())
  try {
    expect(shown.panel.closest('#region')).not.toBeNull()
    expect(getComputedStyle(shown.panel).getPropertyValue('--audit-region').trim()).toBe('set')
  } finally {
    shown.dispose()
  }
})

test('a portaled anchor moves the panel out of the region, so a region property no longer reaches it (today)', async () => {
  const shown = await open({ ...Popover.anchor(), portal: true })
  try {
    expect(shown.panel.closest('#region')).toBeNull()
    expect(getComputedStyle(shown.panel).getPropertyValue('--audit-region').trim()).toBe('')
  } finally {
    shown.dispose()
  }
})
