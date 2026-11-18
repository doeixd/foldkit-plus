// @vitest-environment jsdom
/**
 * Floating Panel as a transition and as markup: a move or a resize is worked
 * out from where the drag began, kept within the viewport and the limits,
 * each stage allows only what it should, and the open panel is a non-modal
 * dialog whose drag trigger and bottom-end corner take the arrows.
 */
import { Effect, Option } from 'effect'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, Behaviors, SlotView } from 'foldkit-mixins'
import { Move } from 'foldkit-primitives/dom'
import { Bounds } from 'foldkit-primitives/observers'
// From the modules, not the index: the test reads nothing else.
import { FloatingPanelSlots, moveRect } from '../src/floatingPanel.js'
import { FloatingPanel, Patterns } from '../src/index.js'
import { diagnosticFrom, h, message } from './fixture.js'

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

  it('opens with focus on the panel, and closes sending no Command', () => {
    const opened = FloatingPanel.open(init({ id: 'notes', rect }))
    expect(opened.model.open).toBe(true)
    expect(names(opened)).toEqual(['FloatingPanel.Focus'])
    expect(opened.commands?.[0]?.args).toEqual({ elementId: 'notes-panel' })
    const closed = update(opened.model, Message.Closed())
    expect(closed.model.open).toBe(false)
    expect(closed.model.rect).toEqual(rect)
    expect(names(closed)).toEqual([])
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
    expect(A11y.validate(Patterns.FloatingPanel, FloatingPanelSlots)).toEqual([])
  })

  it('exposes the drag trigger as a button named Move, its visible title still in it', () => {
    scene(
      shown(),
      {},
      Scene.expect(Scene.role('button', { name: 'Move Notes' })).toExist(),
      Scene.expect(Scene.selector('#notes-title')).toHaveText('Notes'),
    )
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
    scene(shown(), { closeOnEscape: false }, Scene.keydown(dialog, 'Escape'), Scene.expectIgnored())
  })

  const { Keys } = Behaviors
  const closes = (
    name: string,
    chord: Behaviors.Keys.Gesture,
  ): FloatingPanel.Route<FloatingPanel.Message> =>
    Keys.route(name, {
      on: [chord],
      handle: () => Option.some(FloatingPanel.Message.Closed()),
    })

  it("answers the application's routes on the panel beside Escape", () => {
    scene(
      shown(),
      { routes: [closes('Close on Q', Keys.chord('q'))] },
      Scene.keydown(dialog, 'q'),
      Scene.expect(dialog).toBeAbsent(),
      Scene.Mount.expectEnded(Bounds, ...Array.from({ length: 9 }, () => Move)),
    )
  })

  it.each([
    ['Escape', Keys.chord('Escape')],
    ['Escape with Shift', Keys.chord('Escape', { shift: true })],
  ])('names both routes when one overlaps %s', (_, chord) => {
    const diagnostic = diagnosticFrom(() =>
      FloatingPanel.view(
        {
          model: shown(),
          onMessage: message => message,
          title: 'Notes',
          content: h.p([], ['Body']),
          routes: [closes('Mine', chord)],
        },
        SlotView.inertBuilder<FloatingPanel.Message>(),
      ),
    )
    expect(diagnostic?.code).toBe('mixins:key-conflict')
    expect(diagnostic?.details?.['contributors']).toEqual(['Close on Escape', 'Mine'])
  })

  it('leaves an arrow with Ctrl held to the browser', () => {
    scene(
      shown(),
      {},
      Scene.keydown(trigger, 'ArrowRight', { ctrlKey: true }),
      Scene.expectIgnored(),
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

describe('limits held in the Model', () => {
  const limited = (limits: FloatingPanel.Limits) =>
    update(
      FloatingPanel.open(init({ id: 'notes', rect, ...limits })).model,
      Message.Measured(viewport),
    ).model

  it('stores only the options init was given', () => {
    expect(init({ id: 'notes', rect, grid: 20, min: undefined }).limits).toEqual({ grid: 20 })
  })

  it('update() folds against the stored limits, and update(limits) against its own', () => {
    const snapped = drag(limited({ grid: 50 }), 'move', [20, 0], [30, 0])
    expect(snapped.rect.x).toBe(150)
    const own = FloatingPanel.update({ grid: 100 })
    const moved = own(
      own(limited({ grid: 50 }), Message.GestureStarted({ handle: 'move' })).model,
      Message.GestureMoved({ deltaX: 60, deltaY: 0 }),
    ).model
    expect(moved.rect.x).toBe(200)
  })

  it('holds the stored size limits against a resize', () => {
    const resized = drag(limited({ max: { width: 350, height: 250 } }), 'se', [400, 400])
    expect(resized.rect).toMatchObject({ width: 350, height: 250 })
  })
})

describe('FloatingPanel.Placed', () => {
  it('puts the panel at a rect kept within the viewport and the limits', () => {
    const model = shown()
    const placed = update(
      model,
      Message.Placed({ rect: { x: 900, y: 700, width: 300, height: 200 } }),
    ).model
    expect(placed.rect).toEqual({ x: 700, y: 600, width: 300, height: 200 })
    const tiny = update(
      model,
      Message.Placed({ rect: { x: 0, y: 0, width: 10, height: 10 } }),
    ).model
    expect(tiny.rect).toMatchObject({ width: 160, height: 96 })
  })

  it('returns the same Model for the rect it already holds, and for a maximized panel', () => {
    const model = shown()
    expect(update(model, Message.Placed({ rect })).model).toBe(model)
    const maximized = shown('maximized')
    expect(update(maximized, Message.Placed({ rect: { ...rect, x: 5 } })).model).toBe(maximized)
  })
})

describe('FloatingPanel.rectBeside and Docked', () => {
  const anchor = { x: 100, y: 50, width: 80, height: 30 }
  const size = { width: 200, height: 100 }

  it.each([
    ['bottom', { x: 100, y: 88 }],
    ['top', { x: 100, y: -58 }],
    ['left', { x: -108, y: 50 }],
    ['right', { x: 188, y: 50 }],
  ] as const)('stands %s of its anchor, 8 pixels off', (side, at) => {
    expect(FloatingPanel.rectBeside(anchor, size, { side })).toEqual({ ...at, ...size })
  })

  it('takes a gap of its own', () => {
    expect(FloatingPanel.rectBeside(anchor, size, { gap: 0 }).y).toBe(80)
  })

  it.each([
    ['left', { x: 0, y: 0, width: 240, height: 800 }],
    ['right', { x: 760, y: 0, width: 240, height: 800 }],
    ['top', { x: 0, y: 0, width: 1000, height: 240 }],
    ['bottom', { x: 0, y: 560, width: 1000, height: 240 }],
  ] as const)('docks %s with the other side whole', (edge, at) => {
    expect(update(shown(), Message.Docked({ edge, thickness: 240 })).model.rect).toEqual(at)
  })
})

describe('FloatingPanel words and controls', () => {
  it('draws the controls named, and restore for the stage they reach', () => {
    scene(
      shown(),
      { controls: ['maximize', 'close'] },
      Scene.expect(Scene.role('button', { name: 'Minimize' })).toBeAbsent(),
      Scene.expect(Scene.role('button', { name: 'Maximize' })).toExist(),
      Scene.click(Scene.role('button', { name: 'Maximize' })),
      ended(9),
      Scene.expect(Scene.role('button', { name: 'Restore' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'Close' })).toExist(),
    )
    scene(
      shown(),
      { controls: [] },
      Scene.expect(Scene.role('button', { name: 'Close' })).toBeAbsent(),
    )
  })

  it('fills {title} into the move and resize names, and merges words key by key', () => {
    scene(
      shown(),
      { words: { move: 'Drag {title}', close: 'Dismiss' } },
      Scene.expect(Scene.label('Drag Notes')).toExist(),
      Scene.expect(Scene.label('Resize Notes')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Dismiss' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'Minimize' })).toExist(),
    )
  })
})

describe('FloatingPanel.configure', () => {
  it('lays base, preset and call, the call winning and words merging', () => {
    const Own = FloatingPanel.configure({
      base: { words: { close: 'Dismiss' }, controls: ['close'] },
      presets: { plain: { words: { move: 'Drag {title}' } } },
    })
    const drawn = (options: object) =>
      JSON.stringify(
        Own.view(
          {
            model: shown(),
            onMessage: () => message('Other'),
            title: 'Notes',
            content: h.p([], []),
            ...options,
          },
          h,
        ),
      )
    const plain = drawn({ preset: 'plain' })
    expect(plain).toContain('Dismiss')
    expect(plain).toContain('Drag Notes')
    expect(plain).not.toContain('Minimize')
    expect(drawn({ controls: ['minimize'] })).toContain('Minimize')
  })
})

describe('FloatingPanel.Docked', () => {
  it('docks to an edge of the viewport as measured now, within the size limits', () => {
    const docked = update(shown(), Message.Docked({ edge: 'right', thickness: 240 })).model
    expect(docked.rect).toEqual({ x: 760, y: 0, width: 240, height: 800 })
    const limited = update(
      FloatingPanel.open(init({ id: 'notes', rect, max: { width: 200, height: 500 } })).model,
      Message.Measured(viewport),
    ).model
    expect(
      update(limited, Message.Docked({ edge: 'left', thickness: 240 })).model.rect,
    ).toMatchObject({ width: 200, height: 500 })
  })

  it('returns the same Model for the edge it is on, and for a maximized panel', () => {
    const docked = update(shown(), Message.Docked({ edge: 'left', thickness: 240 })).model
    expect(update(docked, Message.Docked({ edge: 'left', thickness: 240 })).model).toBe(docked)
    const maximized = shown('maximized')
    expect(update(maximized, Message.Docked({ edge: 'left', thickness: 240 })).model).toBe(
      maximized,
    )
  })
})

describe('FloatingPanel.openBeside', () => {
  const closed = () => init({ id: 'notes', rect })

  it('opens the panel and reads the opener, focus last', () => {
    const result = FloatingPanel.openBeside(closed(), 'opener')
    expect(result.model.open).toBe(true)
    expect(names(result)).toEqual(['FloatingPanel.Beside', 'FloatingPanel.Focus'])
  })

  it('moves an open panel beside the opener without opening it again', () => {
    const open = shown()
    const result = FloatingPanel.openBeside(open, 'opener')
    expect(result.model).toBe(open)
    expect(names(result)).toEqual(['FloatingPanel.Beside'])
  })

  it("answers Placed with the opener's box and the panel's own size, or nothing without the opener", async () => {
    document.body.innerHTML = '<button id="opener"></button>'
    const opener = document.getElementById('opener')
    if (opener === null) throw new Error('no opener')
    opener.getBoundingClientRect = () => new DOMRect(40, 60, 80, 30)
    const [beside] =
      FloatingPanel.openBeside(closed(), 'opener', { side: 'right', gap: 4 }).commands ?? []
    const placed = await Effect.runPromise(beside!.effect)
    expect(placed).toEqual(Message.Placed({ rect: { x: 124, y: 60, width: 300, height: 200 } }))
    opener.remove()
    expect(await Effect.runPromise(beside!.effect)).toEqual(Message.CompletedFocus())
  })
})
