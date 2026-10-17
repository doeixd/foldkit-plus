// @vitest-environment jsdom
/**
 * Floating Panel as a transition and as markup: a move or a resize is worked
 * out from where the drag began, kept within the viewport and the limits,
 * each stage allows only what it should, and the open panel is a non-modal
 * dialog whose drag trigger and bottom-end corner take the arrows.
 */
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, Attr, Capability, Event } from 'foldkit-mixins'
import { Move } from 'foldkit-primitives/dom'
import { Bounds } from 'foldkit-primitives/observers'
// From the modules, not the index: the test reads nothing else.
import * as FloatingPanel from '../src/floatingPanel.js'
import { FloatingPanelSlots, moveRect } from '../src/floatingPanel.js'
import { h, message } from './fixture.js'

const { Message, init } = FloatingPanel
const update = FloatingPanel.update()
const viewport = { width: 1000, height: 800 }
const rect = { x: 100, y: 100, width: 300, height: 200 }

/** An open panel in a measured viewport. */
const shown = (stage: FloatingPanel.Stage = 'default') => {
  const measured = update(
    FloatingPanel.open(init({ id: 'notes', rect })).model,
    Message.Measured(viewport),
  ).model
  return stage === 'default' ? measured : update(measured, Message.StageChosen({ stage })).model
}

const drag = (
  model: FloatingPanel.Model,
  handle: FloatingPanel.Handle,
  ...moves: ReadonlyArray<readonly [number, number]>
) =>
  moves.reduce(
    (at, [deltaX, deltaY]) => update(at, Message.GestureMoved({ deltaX, deltaY })).model,
    update(model, Message.GestureStarted({ handle })).model,
  )

const names = (result: { readonly commands?: ReadonlyArray<{ readonly name: string }> }) =>
  (result.commands ?? []).map(command => command.name)

describe('FloatingPanel.moveRect', () => {
  it.each([
    ['in the open', 50, 20, { x: 150, y: 120 }],
    ['to the left edge and no further', -500, 0, { x: 0, y: 100 }],
    ['to the bottom right and no further', 5000, 5000, { x: 700, y: 600 }],
  ] as const)('moves %s', (_, dx, dy, at) => {
    expect(moveRect(rect, 'move', dx, dy, viewport)).toEqual({ ...rect, ...at })
  })

  it('moves anywhere before the viewport is measured, or with overflow', () => {
    expect(moveRect(rect, 'move', -500, 0, { width: 0, height: 0 }).x).toBe(-400)
    expect(moveRect(rect, 'move', -500, 0, viewport, { overflow: true }).x).toBe(-400)
  })

  it.each([
    ['e', 40, 0, { x: 100, width: 340 }],
    ['s', 0, 30, { y: 100, height: 230 }],
    // The far edge stays put as the near one moves.
    ['w', 40, 0, { x: 140, width: 260 }],
    ['n', 0, -30, { y: 70, height: 230 }],
    ['se', 10, 20, { width: 310, height: 220 }],
    ['nw', -10, -20, { x: 90, y: 80, width: 310, height: 220 }],
  ] as const)('resizes from %s', (edge, dx, dy, expected) => {
    expect(moveRect(rect, edge, dx, dy, viewport)).toEqual({ ...rect, ...expected })
  })

  it('keeps a resize within the least and most size, and the viewport', () => {
    expect(moveRect(rect, 'e', -1000, 0, viewport).width).toBe(FloatingPanel.MIN_SIZE.width)
    // From the start edge, the end edge holds as the size stops shrinking.
    expect(moveRect(rect, 'w', 1000, 0, viewport)).toEqual({
      ...rect,
      x: 400 - FloatingPanel.MIN_SIZE.width,
      width: FloatingPanel.MIN_SIZE.width,
    })
    expect(moveRect(rect, 'e', 50, 0, viewport, { max: { width: 320, height: 999 } }).width).toBe(
      320,
    )
    expect(moveRect(rect, 'e', 5000, 0, viewport).width).toBe(900)
    expect(moveRect(rect, 'w', -5000, 0, viewport)).toEqual({ ...rect, x: 0, width: 400 })
  })

  it('snaps to the grid', () => {
    expect(moveRect(rect, 'move', 13, 26, viewport, { grid: 10 })).toEqual({
      ...rect,
      x: 110,
      y: 130,
    })
    expect(moveRect(rect, 'e', 14, 0, viewport, { grid: 10 }).width).toBe(310)
  })
})

describe('FloatingPanel.update', () => {
  it('follows a drag from where it began, and gives a clamped move back as the pointer returns', () => {
    const moved = drag(shown(), 'move', [-500, 0], [-50, 0])
    expect(moved.rect.x).toBe(50)
    const ended = update(moved, Message.GestureEnded()).model
    expect(ended.gesture).toEqual(Option.none())
    expect(update(ended, Message.GestureMoved({ deltaX: 10, deltaY: 0 })).model).toBe(ended)
    expect(update(ended, Message.GestureEnded()).model).toBe(ended)
  })

  it('a move that changes nothing is the same Model', () => {
    const grabbed = update(shown(), Message.GestureStarted({ handle: 'move' })).model
    expect(update(grabbed, Message.GestureMoved({ deltaX: 0, deltaY: 0 })).model).toBe(grabbed)
  })

  it('resizes by the arrows from where it is, as by a drag', () => {
    const nudged = update(shown(), Message.Nudged({ handle: 'se', deltaX: 10, deltaY: 0 })).model
    expect(nudged.rect.width).toBe(310)
    const moved = update(nudged, Message.Nudged({ handle: 'move', deltaX: 0, deltaY: -10 })).model
    expect(moved.rect.y).toBe(90)
  })

  it('minimized, moves but does not resize; maximized, does neither', () => {
    const minimized = shown('minimized')
    expect(update(minimized, Message.GestureStarted({ handle: 'se' })).model).toBe(minimized)
    expect(drag(minimized, 'move', [10, 0]).rect.x).toBe(110)
    const maximized = shown('maximized')
    expect(update(maximized, Message.GestureStarted({ handle: 'move' })).model).toBe(maximized)
    expect(update(maximized, Message.Nudged({ handle: 'move', deltaX: 10, deltaY: 0 })).model).toBe(
      maximized,
    )
  })

  it('restores to where it was, and choosing the stage it is in changes nothing', () => {
    const restored = update(shown('maximized'), Message.StageChosen({ stage: 'default' })).model
    expect(restored.rect).toEqual(rect)
    const model = shown()
    expect(update(model, Message.StageChosen({ stage: 'default' })).model).toBe(model)
  })

  it('a smaller viewport brings it back inside; the same size changes nothing', () => {
    const moved = drag(shown(), 'move', [600, 500])
    const smaller = update(moved, Message.Measured({ width: 800, height: 500 })).model
    expect(smaller.rect).toEqual({ ...rect, x: 500, y: 300 })
    expect(update(smaller, Message.Measured({ width: 800, height: 500 })).model).toBe(smaller)
  })

  it('tells the application to raise it on a press or focus inside', () => {
    expect(update(shown(), Message.Activated()).outMessage).toEqual(
      FloatingPanel.Raised.make({ id: 'notes' }),
    )
  })

  it('opens with focus on the panel, and closes with focus back to its opener', () => {
    const opened = FloatingPanel.open(init({ id: 'notes', rect }), { opener: 'notes-button' })
    expect(opened.model.open).toBe(true)
    expect(names(opened)).toEqual(['FloatingPanel.Focus'])
    expect(opened.commands?.[0]?.args).toEqual({ elementId: 'notes-panel' })
    const closed = update(opened.model, Message.Closed())
    expect(closed.model.open).toBe(false)
    expect(closed.model.rect).toEqual(rect)
    expect(closed.commands?.[0]?.args).toEqual({ elementId: 'notes-button' })
    expect(names(update(shown(), Message.Closed()))).toEqual([])
    expect(update(closed.model, Message.Closed()).model).toBe(closed.model)
    expect(FloatingPanel.open(opened.model).model).toBe(opened.model)
  })

  it('raises one panel above the others', () => {
    const order = ['a', 'b', 'c']
    expect(FloatingPanel.raise(order, 'a')).toEqual(['b', 'c', 'a'])
    expect(FloatingPanel.raise(order, 'c')).toBe(order)
  })
})

/** The contract the package's `A11y` catalog is to hold the panel to. */
const pattern = A11y.pattern({
  panel: { capability: Capability.Container, attributes: [Attr.Role] },
  dragTrigger: {
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.AriaLabel],
  },
  close: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  },
})

type Step = Parameters<
  typeof Scene.scene<FloatingPanel.Model, FloatingPanel.Message, FloatingPanel.Raised>
>[1]

const scene = (
  model: FloatingPanel.Model,
  view: Partial<FloatingPanel.FloatingPanelView<FloatingPanel.Message>>,
  ...steps: ReadonlyArray<Step>
) =>
  Scene.scene<FloatingPanel.Model, FloatingPanel.Message, FloatingPanel.Raised>(
    {
      update,
      // In a box: closed, the panel draws nothing, and a Scene needs a view.
      view: (current, h) =>
        h.div(
          [],
          [
            FloatingPanel.view(
              {
                model: current,
                onMessage: message => message,
                title: 'Notes',
                content: h.p([], ['Body']),
                ...view,
              },
              h,
            ),
          ],
        ),
    },
    Scene.given(model),
    drawn(),
    ...steps,
  )

/** The viewport's measure, and a Move for the drag trigger and each of the eight edges. */
const drawn = () =>
  Scene.Mount.resolveAll(
    [Bounds, Message.Measured(viewport)],
    ...Array.from({ length: 9 }, () => [Move, Message.GestureEnded()] as const),
  )
/** The Moves drawn again once the panel can be moved and resized again. */
const moves = () =>
  Scene.Mount.resolveAll(
    ...Array.from({ length: 9 }, () => [Move, Message.GestureEnded()] as const),
  )

/** Acknowledges `moves` Moves gone from the drawing. */
const ended = (moves: number) =>
  Scene.Mount.expectEnded(...Array.from({ length: moves }, () => Move))

const dialog = Scene.role('dialog')
const trigger = Scene.label('Move Notes')

describe('FloatingPanel.view', () => {
  it('meets its pattern', () => {
    expect(A11y.validate(pattern, FloatingPanelSlots)).toEqual([])
  })

  it('draws an open panel as a non-modal dialog named by its title, where its rect says', () => {
    scene(
      shown(),
      {},
      Scene.expect(dialog).toHaveAttr('aria-modal', 'false'),
      Scene.expect(dialog).toHaveAttr('aria-labelledby', 'notes-title'),
      Scene.expect(Scene.role('dialog', { name: 'Notes' })).toExist(),
      Scene.expect(dialog).toHaveAttr('data-stage', 'default'),
    )
    const drawn = FloatingPanel.view(
      {
        model: shown(),
        onMessage: () => message('Other'),
        title: 'Notes',
        content: h.p([], ['Body']),
      },
      h,
    )
    expect(JSON.stringify(drawn)).toContain('"left":"100px"')
    expect(JSON.stringify(drawn)).toContain('"height":"200px"')
  })

  it('draws nothing while closed', () => {
    expect(
      FloatingPanel.view(
        {
          model: init({ id: 'notes', rect }),
          onMessage: () => message('Other'),
          title: 'Notes',
          content: h.p([], []),
        },
        h,
      ),
    ).toBeNull()
  })

  it.each([
    ['ArrowRight', {}, { x: 110, y: 100 }],
    ['ArrowUp', {}, { x: 100, y: 90 }],
    ['ArrowLeft', { shiftKey: true }, { x: 50, y: 100 }],
  ] as const)('moves on %s from the drag trigger', (key, modifiers, at) => {
    scene(
      shown(),
      {},
      Scene.keydown(trigger, key, modifiers),
      Scene.expectHandled(),
      Scene.expect(dialog).toHaveStyle('left', `${at.x}px`),
      Scene.expect(dialog).toHaveStyle('top', `${at.y}px`),
    )
  })

  it.each([
    ['ltr', 'se', 'ArrowRight', 310],
    ['rtl', 'sw', 'ArrowLeft', 310],
  ] as const)('%s, the %s corner resizes on %s', (direction, edge, key, width) => {
    scene(
      shown(),
      { direction },
      Scene.expect(Scene.label('Resize Notes')).toHaveAttr('data-edge', edge),
      Scene.keydown(Scene.label('Resize Notes'), key),
      Scene.expect(dialog).toHaveStyle('width', `${width}px`),
    )
  })

  it('shows minimize and maximize, or restore once either is chosen', () => {
    scene(
      shown(),
      {},
      Scene.click(Scene.role('button', { name: 'Maximize' })),
      ended(9),
      Scene.expect(dialog).toHaveAttr('data-stage', 'maximized'),
      Scene.expect(Scene.role('button', { name: 'Maximize' })).toBeAbsent(),
      Scene.expect(trigger).toBeAbsent(),
      Scene.click(Scene.role('button', { name: 'Restore' })),
      moves(),
      Scene.click(Scene.role('button', { name: 'Minimize' })),
      ended(8),
      Scene.expect(dialog).toHaveAttr('data-stage', 'minimized'),
      Scene.expect(Scene.label('Resize Notes')).toBeAbsent(),
      Scene.expect(Scene.selector('[hidden]')).toExist(),
    )
  })

  it('closes on Escape and from its close button', () => {
    // One acknowledgement for all: in two, the second showed the first's Mounts unacknowledged.
    const gone = () => [
      Scene.expect(dialog).toBeAbsent(),
      Scene.Mount.expectEnded(Bounds, ...Array.from({ length: 9 }, () => Move)),
    ]
    scene(shown(), {}, Scene.keydown(dialog, 'Escape'), ...gone())
    scene(shown(), {}, Scene.click(Scene.role('button', { name: 'Close' })), ...gone())
    expect(() => scene(shown(), { closeOnEscape: false }, Scene.keydown(dialog, 'Escape'))).toThrow(
      /no keydown handler/,
    )
  })

  it('marks the topmost of a stack, and stacks each above the one before', () => {
    scene(
      shown(),
      { order: ['notes', 'chat'] },
      Scene.expect(dialog).toHaveAttr('data-behind', ''),
      Scene.expect(dialog).not.toHaveAttr('data-topmost'),
    )
    scene(
      shown(),
      { order: ['chat', 'notes'] },
      Scene.expect(dialog).toHaveAttr('data-topmost', ''),
    )
  })

  it('raises itself on a press inside', () => {
    scene(
      shown(),
      {},
      Scene.pointerDown(Scene.selector('p')),
      Scene.expectOutMessage(FloatingPanel.Raised.make({ id: 'notes' })),
    )
  })

  it('refuses to be drawn without a title', () => {
    expect(() =>
      FloatingPanel.view(
        { model: shown(), onMessage: () => message('Other'), title: '', content: h.p([], []) },
        h,
      ),
    ).toThrow(/title/)
  })
})
