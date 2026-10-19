/**
 * Tooltip on a real runtime: the pill draws in the top layer, outside the
 * box that clips its trigger, keeps 8px inside the viewport, and its arrow
 * points at the trigger's middle even when the pill is shifted along.
 */
import { Schema } from 'effect'
import * as UiTooltip from '@foldkit/ui/tooltip'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
// Not the index: a test loads only what it tests.
import { Tooltip as TooltipRecipe } from '../src/recipes/tooltip.js'
import * as Tooltip from '../src/tooltip.js'
import { TooltipSlots } from '../src/tooltip.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(TooltipSlots)(TooltipRecipe({}))
const Model = Schema.Struct({ tooltip: UiTooltip.Model })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Got'; readonly message: UiTooltip.Message }

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/** A tooltip whose trigger sits in a small clipping box placed by `where`, shown by keyboard focus. */
const show = async (where: Record<string, string>, anchor = Tooltip.anchor()) => {
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
  container.id = 'tooltip-browser'
  document.body.append(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [h.Id('clip'), h.Style({ position: 'absolute', overflow: 'hidden', ...where })],
      [
        h.submodel({
          slotId: 'autosave',
          model: model.tooltip,
          view: UiTooltip.view,
          viewInputs: {
            anchor,
            toView: Tooltip.toView([style.mixin], { h, id: model.tooltip.id }, tooltip =>
              h.div(
                [],
                [
                  h.button(tooltip.trigger, ['Save']),
                  ...(tooltip.isVisible
                    ? [
                        h.div(tooltip.layer, [
                          h.div(tooltip.panel, [
                            h.span(tooltip.arrow, []),
                            'Saved a second after you stop typing',
                          ]),
                        ]),
                      ]
                    : []),
                ],
              ),
            ),
          },
          toParentMessage: (message: UiTooltip.Message): Message => ({ _tag: 'Got', message }),
        }),
      ],
    )
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { tooltip: UiTooltip.init({ id: 'autosave' }) } }),
      update: (model: Model, message: Message) => {
        const next = UiTooltip.update(model.tooltip, message.message)
        return {
          model: { tooltip: next.model },
          commands: mapMessages(next.commands, (inner): Message => ({
            _tag: 'Got',
            message: inner,
          })),
        }
      },
      view,
    }),
  )
  const trigger = await vi.waitFor(() => {
    const found = document.getElementById(UiTooltip.triggerId('autosave'))
    expect(found).not.toBeNull()
    return found!
  })
  trigger.focus()
  const panel = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('[role="tooltip"]')
    expect(found).not.toBeNull()
    expect(getComputedStyle(found!).visibility).toBe('visible')
    return found!
  })
  // The arrow follows the anchor's writes; let the last one land.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  return {
    trigger: trigger.getBoundingClientRect(),
    panel,
    clip: document.getElementById('clip')!.getBoundingClientRect(),
    dispose: () => handle.dispose(),
  }
}

test('the pill shows above its trigger, outside the box that clips it', async () => {
  const { trigger, panel, clip, dispose } = await show({
    top: '120px',
    left: '400px',
    width: '80px',
    height: '40px',
  })
  try {
    const box = panel.getBoundingClientRect()
    expect(panel.dataset['placement']).toBe('top')
    expect(trigger.top - box.bottom).toBeCloseTo(8, 0)
    expect(box.top).toBeLessThan(clip.top)
    // A tooltip takes no presses, so no hit test: its layer is in the top layer.
    expect(panel.parentElement!.matches(':popover-open')).toBe(true)
  } finally {
    dispose()
  }
})

test('near the viewport’s left edge the pill stays 8px in, and its arrow still points at the trigger', async () => {
  const { trigger, panel, dispose } = await show({
    top: '120px',
    // Near enough the edge that the pill shifts, far enough that its arrow
    // need not stop at the pill's rounded corner.
    left: '16px',
    width: '64px',
    height: '40px',
  })
  try {
    const box = panel.getBoundingClientRect()
    expect(box.left).toBeCloseTo(8, 0)
    const arrow = panel.firstElementChild!.getBoundingClientRect()
    expect(
      Math.abs(arrow.left + arrow.width / 2 - (trigger.left + trigger.width / 2)),
    ).toBeLessThan(1.5)
    // Half past the pill's bottom edge, toward the trigger.
    expect(arrow.bottom).toBeGreaterThan(box.bottom)
    expect(arrow.top).toBeLessThan(box.bottom)
    // Nothing clips the half outside: upstream's anchor makes a panel it knows no arrow of scroll.
    expect(getComputedStyle(panel).overflowY).toBe('visible')
  } finally {
    dispose()
  }
})

test('beside its trigger, a one-line pill rounder than it is tall points its arrow from its middle', async () => {
  // Corners of 10px on a pill about 20px tall: no room between them for the arrow.
  document.documentElement.style.setProperty('--fk-knob-radius-factor', '1.7')
  const { trigger, panel, dispose } = await show(
    { top: '120px', left: '400px', width: '80px', height: '40px' },
    Tooltip.anchor({ placement: 'right' }),
  )
  try {
    expect(panel.dataset['placement']).toBe('right')
    const box = panel.getBoundingClientRect()
    const arrow = panel.firstElementChild!.getBoundingClientRect()
    const middle = (rect: DOMRect) => rect.top + rect.height / 2
    expect(Math.abs(middle(arrow) - middle(box))).toBeLessThan(0.5)
    expect(Math.abs(middle(arrow) - middle(trigger))).toBeLessThan(0.5)
  } finally {
    document.documentElement.style.removeProperty('--fk-knob-radius-factor')
    dispose()
  }
})
