/**
 * Floating panels in a real browser: the drag trigger moves a panel and the
 * viewport stops it, an edge or corner resizes it, the arrows move and
 * resize it from focus, its controls press through the header's drag,
 * maximized it fills the viewport, and a press on the panel behind brings it
 * above the other. Right to left, the corner the keys resize from is the
 * bottom left.
 */
import { Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
// From the modules, not the index: the test reads nothing else.
import * as FloatingPanel from '../src/floatingPanel.js'
import { FloatingPanelSlots } from '../src/floatingPanel.js'
import * as Recipes from '../src/recipes/floatingPanel.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(FloatingPanelSlots)(Recipes.FloatingPanel({}))
// Still, so each geometry read is where the panel came to rest.
const still = ':root { --fk-knob-travel: 0 }'

const Model = Schema.Struct({
  notes: FloatingPanel.Model,
  chat: FloatingPanel.Model,
  order: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Got = defineMessageUnion({
  Notes: { message: FloatingPanel.Message },
  Chat: { message: FloatingPanel.Message },
  OpenNotes: {},
})
type Got = typeof Got.Type

const update = FloatingPanel.update()

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
})

const mount = (direction: 'ltr' | 'rtl' = 'ltr') => {
  document.documentElement.dir = direction
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css +
    still
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = `floating-${direction}`
  document.body.appendChild(container)
  const fold = (
    model: Model,
    field: 'notes' | 'chat',
    step: FloatingPanel.Return,
  ): Update.Return<Model, Got> => {
    const order = Option.match(Option.fromNullishOr(step.outMessage), {
      onNone: () => model.order,
      onSome: ({ id }) => FloatingPanel.raise(model.order, id),
    })
    const lift = (message: FloatingPanel.Message) =>
      field === 'notes' ? Got.Notes({ message }) : Got.Chat({ message })
    return {
      model:
        field === 'notes'
          ? modifyFields(model, { notes: () => step.model, order: () => order })
          : modifyFields(model, { chat: () => step.model, order: () => order }),
      commands: Command.mapMessages(step.commands ?? [], lift),
    }
  }
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          notes: FloatingPanel.init({
            id: 'notes',
            rect: { x: 100, y: 100, width: 300, height: 200 },
            open: true,
          }),
          chat: FloatingPanel.init({
            id: 'chat',
            rect: { x: 300, y: 200, width: 300, height: 200 },
            open: true,
          }),
          order: ['notes', 'chat'],
        },
      }),
      update: (model: Model, message: Got) =>
        Got.match(message, {
          Notes: ({ message: inner }) => fold(model, 'notes', update(model.notes, inner)),
          Chat: ({ message: inner }) => fold(model, 'chat', update(model.chat, inner)),
          OpenNotes: () =>
            fold(model, 'notes', FloatingPanel.open(model.notes, { opener: 'opener' })),
        }),
      view: (model: Model, h: HtmlBuilder<Got>) =>
        h.div(
          [],
          [
            h.button([h.Id('opener'), h.OnClick(Got.OpenNotes())], ['Open notes']),
            FloatingPanel.view(
              {
                model: model.notes,
                onMessage: message => Got.Notes({ message }),
                title: 'Notes',
                content: h.p([h.Id('notes-body')], ['Notes body']),
                order: model.order,
                direction,
                style,
              },
              h,
            ),
            FloatingPanel.view(
              {
                model: model.chat,
                onMessage: message => Got.Chat({ message }),
                title: 'Chat',
                content: h.p([], ['Chat body']),
                order: model.order,
                direction,
                style,
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const panel = (id: string) => document.getElementById(`${id}-panel`)
const boxOf = (id: string) => panel(id)!.getBoundingClientRect()
const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

/** Waits for both panels, and for the viewport's measure to arrive. */
const ready = async () => {
  await vi.waitFor(() => expect(panel('chat')).not.toBeNull())
  await frame()
  await frame()
}

/** Drags `element` by `dx`, `dy` with one pointer, as `Move` reads it. */
const drag = (element: Element, dx: number, dy: number) => {
  const { left, top } = element.getBoundingClientRect()
  const at = (type: string, x: number, y: number) =>
    element.dispatchEvent(
      new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }),
    )
  at('pointerdown', left + 2, top + 2)
  at('pointermove', left + 2 + dx, top + 2 + dy)
  at('pointerup', left + 2 + dx, top + 2 + dy)
}

const trigger = (id: string) => panel(id)!.querySelector('[aria-label^="Move"]')!
const handle = (id: string, edge: string) => panel(id)!.querySelector(`[data-edge="${edge}"]`)!

test('the drag trigger moves the panel, and the viewport stops it', async () => {
  const mounted = mount()
  try {
    await ready()
    drag(trigger('notes'), 50, 30)
    await vi.waitFor(() => expect(boxOf('notes').left).toBeCloseTo(150, 0))
    expect(boxOf('notes').top).toBeCloseTo(130, 0)
    drag(trigger('notes'), -1000, -1000)
    await vi.waitFor(() => expect(boxOf('notes').left).toBeCloseTo(0, 0))
    expect(boxOf('notes').top).toBeCloseTo(0, 0)
  } finally {
    mounted.dispose()
  }
})

test('an edge or corner resizes it, the far edge holding still', async () => {
  const mounted = mount()
  try {
    await ready()
    drag(handle('notes', 'se'), 40, 20)
    await vi.waitFor(() => expect(boxOf('notes').width).toBeCloseTo(340, 0))
    expect(boxOf('notes').height).toBeCloseTo(220, 0)
    const right = boxOf('notes').right
    drag(handle('notes', 'w'), 60, 0)
    await vi.waitFor(() => expect(boxOf('notes').width).toBeCloseTo(280, 0))
    expect(boxOf('notes').right).toBeCloseTo(right, 0)
  } finally {
    mounted.dispose()
  }
})

test('the arrows move it from the drag trigger and resize it from the corner', async () => {
  const mounted = mount()
  try {
    await ready()
    const move = trigger('notes') as HTMLElement
    move.focus()
    await userEvent.keyboard('{ArrowRight}{Shift>}{ArrowDown}{/Shift}')
    await vi.waitFor(() => expect(boxOf('notes').left).toBeCloseTo(110, 0))
    expect(boxOf('notes').top).toBeCloseTo(150, 0)
    ;(handle('notes', 'se') as HTMLElement).focus()
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(boxOf('notes').height).toBeCloseTo(210, 0))
  } finally {
    mounted.dispose()
  }
})

test('right to left, the corner the keys resize from is the bottom left', async () => {
  const mounted = mount('rtl')
  try {
    await ready()
    const corner = panel('notes')!.querySelector<HTMLElement>('[data-edge][tabindex]')!
    const at = corner.getBoundingClientRect()
    const box = boxOf('notes')
    expect(at.left).toBeLessThan(box.left + 10)
    expect(at.bottom).toBeGreaterThan(box.bottom - 10)
    corner.focus()
    await userEvent.keyboard('{ArrowLeft}')
    await vi.waitFor(() => expect(boxOf('notes').width).toBeCloseTo(310, 0))
    expect(boxOf('notes').right).toBeCloseTo(box.right, 0)
  } finally {
    mounted.dispose()
  }
})

test('a press on the panel behind brings it above the other', async () => {
  const mounted = mount()
  try {
    await ready()
    // Where the two overlap, the later one is on top.
    expect(document.elementFromPoint(350, 250)?.closest('[role="dialog"]')).toBe(panel('chat'))
    await userEvent.click(document.getElementById('notes-body')!)
    await vi.waitFor(() =>
      expect(document.elementFromPoint(350, 250)?.closest('[role="dialog"]')).toBe(panel('notes')),
    )
    expect(panel('notes')!.hasAttribute('data-topmost')).toBe(true)
    expect(panel('chat')!.hasAttribute('data-behind')).toBe(true)
  } finally {
    mounted.dispose()
  }
})

test('maximized it fills the viewport, and restore puts it back', async () => {
  const mounted = mount()
  try {
    await ready()
    await userEvent.click(panel('notes')!.querySelector('[aria-label="Maximize"]')!)
    await vi.waitFor(() => expect(boxOf('notes').width).toBeCloseTo(window.innerWidth, 0))
    expect(boxOf('notes').height).toBeCloseTo(window.innerHeight, 0)
    await userEvent.click(panel('notes')!.querySelector('[aria-label="Restore"]')!)
    await vi.waitFor(() => expect(boxOf('notes').width).toBeCloseTo(300, 0))
    expect(boxOf('notes').left).toBeCloseTo(100, 0)
  } finally {
    mounted.dispose()
  }
})

test('minimized only the header shows', async () => {
  const mounted = mount()
  try {
    await ready()
    await userEvent.click(panel('notes')!.querySelector('[aria-label="Minimize"]')!)
    await vi.waitFor(() => expect(boxOf('notes').height).toBeLessThan(80))
    expect(document.getElementById('notes-body')!.checkVisibility()).toBe(false)
  } finally {
    mounted.dispose()
  }
})

test('the close button presses through the drag, and focus goes back to the opener', async () => {
  const mounted = mount()
  try {
    await ready()
    await userEvent.click(panel('notes')!.querySelector('[aria-label="Close"]')!)
    await vi.waitFor(() => expect(panel('notes')).toBeNull())
    await userEvent.click(document.getElementById('opener')!)
    await vi.waitFor(() => expect(document.activeElement).toBe(panel('notes')))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panel('notes')).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(document.getElementById('opener')))
  } finally {
    mounted.dispose()
  }
})
