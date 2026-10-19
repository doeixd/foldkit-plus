/**
 * Popover on a real runtime: its panel draws in the top layer (above and
 * outside a clipping box), keeps clear of the viewport's edges, flips when
 * there is no room below, and its arrow points at the trigger.
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
// Not the index: a test loads only what it tests.
import * as Popover from '../src/popover.js'
import { PopoverSlots } from '../src/popover.js'
import { Popover as PopoverRecipe } from '../src/recipes/popover.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(PopoverSlots)(PopoverRecipe({}))
const Model = Schema.Struct({ popover: UiPopover.Model })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Got'; readonly message: UiPopover.Message }

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/**
 * A popover whose trigger sits in a small clipping box placed by `where`
 * (inline CSS for the box), opened by a real press on the trigger.
 */
const open = async (where: Record<string, string>, anchor: AnchorConfig = Popover.anchor()) => {
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
  container.id = 'popover-browser'
  document.body.append(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [
        h.Id('clip'),
        // Its own stacking context, under whatever the page raises later.
        h.Style({ position: 'absolute', overflow: 'hidden', zIndex: '1', ...where }),
      ],
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
                        h.div(popover.layer, [
                          h.div(popover.panel, [
                            h.div(popover.arrow, []),
                            h.p([], ['Anyone with the link can view this page.']),
                          ]),
                        ]),
                      ]
                    : []),
                ],
              ),
            ),
          },
          toParentMessage: (message: UiPopover.Message): Message => ({ _tag: 'Got', message }),
        }),
      ],
    )
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
      view,
    }),
  )
  const button = await vi.waitFor(() => {
    const found = document.getElementById('share-button')
    expect(found).not.toBeNull()
    return found!
  })
  await userEvent.click(button)
  const panel = await vi.waitFor(() => {
    const found = document.getElementById('share-panel')
    expect(found).not.toBeNull()
    expect(getComputedStyle(found!).visibility).toBe('visible')
    return found!
  })
  return {
    trigger: button.getBoundingClientRect(),
    panel,
    clip: document.getElementById('clip')!.getBoundingClientRect(),
    dispose: () => handle.dispose(),
  }
}

test('the panel paints outside the box that clips its trigger, above any z-index', async () => {
  const { panel, clip, trigger, dispose } = await open({
    // A box that clips even what is fixed in it, as a card with a transform
    // or `contain` does.
    contain: 'paint',
    top: '80px',
    left: '400px',
    width: '120px',
    height: '48px',
  })
  try {
    const box = panel.getBoundingClientRect()
    expect(box.top - trigger.bottom).toBeCloseTo(12, 0)
    expect(box.bottom - 4).toBeGreaterThan(clip.bottom)
    // A later layer of the page's own, raised as high as z-index goes.
    const cover = document.createElement('div')
    cover.style.cssText = 'position: fixed; inset: 0; z-index: 2147483647'
    document.body.append(cover)
    const hit = document.elementFromPoint(box.left + box.width / 2, box.bottom - 4)
    expect(panel.contains(hit)).toBe(true)
  } finally {
    dispose()
  }
})

test('a panel opened at the viewport’s right edge shifts to stay 8px inside it', async () => {
  const { panel, dispose } = await open({
    top: '80px',
    right: '0',
    width: '72px',
    height: '48px',
  })
  try {
    const box = panel.getBoundingClientRect()
    expect(document.documentElement.clientWidth - box.right).toBeCloseTo(8, 0)
  } finally {
    dispose()
  }
})

test('with no room below, the panel flips above its trigger', async () => {
  const { panel, trigger, dispose } = await open({
    bottom: '0',
    left: '400px',
    width: '120px',
    height: '48px',
  })
  try {
    expect(panel.dataset['placement']).toBe('top')
    expect(trigger.top - panel.getBoundingClientRect().bottom).toBeCloseTo(12, 0)
  } finally {
    dispose()
  }
})

test('the arrow points at the trigger’s middle from the panel’s facing edge, also when shifted', async () => {
  const { panel, trigger, dispose } = await open({
    top: '80px',
    right: '0',
    width: '72px',
    height: '48px',
  })
  try {
    const arrow = panel.firstElementChild!.getBoundingClientRect()
    const box = panel.getBoundingClientRect()
    expect(
      Math.abs(arrow.left + arrow.width / 2 - (trigger.left + trigger.width / 2)),
    ).toBeLessThan(1.5)
    // Centred on the top edge, half past it, the corner pointing up at the trigger.
    expect(Math.abs(arrow.top + arrow.height / 2 - box.top)).toBeLessThan(1.5)
  } finally {
    dispose()
  }
})

test('the arrow shows across more than half the gap to the trigger, in the panel’s fill, short of touching it', async () => {
  const { panel, trigger, dispose } = await open({
    top: '80px',
    left: '400px',
    width: '120px',
    height: '48px',
  })
  try {
    const arrow = panel.firstElementChild!
    // A turned box's bounds are where it is painted.
    const drawn = arrow.getBoundingClientRect()
    const box = panel.getBoundingClientRect()
    const gap = box.top - trigger.bottom
    expect(box.top - drawn.top).toBeGreaterThan(gap / 2)
    expect(drawn.top).toBeGreaterThan(trigger.bottom)
    expect(drawn.left + drawn.width / 2).toBeCloseTo(trigger.left + trigger.width / 2, 0)
    expect(getComputedStyle(arrow).backgroundColor).toBe(getComputedStyle(panel).backgroundColor)
  } finally {
    dispose()
  }
})
