// @vitest-environment jsdom
/**
 * Tour as a transition and as markup: it starts at its first step, moves on
 * and back within its steps, ends completed by its last Next or skipped, a
 * step whose target is missing shows in the middle, and each step is a
 * non-modal dialog that names its place and takes the arrows.
 */
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import { TrackBox } from 'foldkit-primitives/dom'
import { describe, expect, it } from 'vitest'
import { A11y, Behaviors, SlotView } from 'foldkit-mixins'
// From the modules, not the index: the test reads nothing else.
import { TourSlots, type Config } from '../src/tour.js'
import { Tour, Patterns } from '../src/index.js'
import { diagnosticFrom, h, message } from './fixture.js'

const { Message, init } = Tour

const config: Config = {
  steps: [
    { title: 'Navigation', description: 'Every page is here.', target: 'nav' },
    { title: 'Welcome', description: 'A step in the middle.' },
    { title: 'Save', description: 'Keep your work.', target: 'save', placement: 'top' },
  ],
}
// The steps are the Model's: neither `update` nor `start` is told them.
const update = Tour.update()
const started = () => Tour.start(init({ id: 'tour', steps: config.steps }))
const at = (step: number) =>
  Array.from({ length: step }).reduce<Tour.Model>(
    model => update(model, Message.Next()).model,
    started().model,
  )
const names = (result: { readonly commands?: ReadonlyArray<{ readonly name: string }> }) =>
  (result.commands ?? []).map(command => command.name)

describe('Tour.update', () => {
  it('starts at the first step, scrolling its target into view', () => {
    const { model, commands } = started()
    expect(model.open).toBe(true)
    expect(model.step).toBe(0)
    expect(commands?.[0]?.args).toEqual({ id: 'tour', target: Option.some('nav') })
    // Started again, it begins over.
    expect(Tour.start(at(2)).model.step).toBe(0)
  })

  it('moves on and back, never before the first', () => {
    const next = update(started().model, Message.Next())
    expect(next.model.step).toBe(1)
    expect(next.commands?.[0]?.args).toEqual({ id: 'tour', target: Option.none() })
    expect(update(next.model, Message.Back()).model.step).toBe(0)
    const first = started().model
    expect(update(first, Message.Back()).model).toBe(first)
  })

  it('ends completed by Next on the last step, sending no Command', () => {
    const done = update(at(2), Message.Next())
    expect(done.model.open).toBe(false)
    expect(done.outMessage).toEqual(Tour.Ended.make({ completed: true }))
    expect(names(done)).toEqual([])
    expect(update(done.model, Message.Next()).model).toBe(done.model)
  })

  it('ends skipped', () => {
    const skipped = update(started().model, Message.Skipped())
    expect(skipped.outMessage).toEqual(Tour.Ended.make({ completed: false }))
    expect(names(skipped)).toEqual([])
    expect(update(skipped.model, Message.Skipped()).model).toBe(skipped.model)
  })

  it.each([
    ['ArrowRight', 2, true],
    ['ArrowLeft', 0, true],
    ['Escape', 1, false],
  ] as const)('on %s goes to step %i (open: %s)', (key, step, open) => {
    const result = update(at(1), Message.Pressed({ key }))
    expect(result.model.step).toBe(step)
    expect(result.model.open).toBe(open)
  })

  it('ignores another key', () => {
    const model = at(1)
    expect(update(model, Message.Pressed({ key: 'Enter' })).model).toBe(model)
  })

  it('shows a step whose target is missing in the middle, focused again there', () => {
    const lost = update(started().model, Message.Spotlit({ target: 'nav', found: false }))
    expect(lost.model.missing).toEqual(Option.some(0))
    expect(lost.commands?.[0]?.args).toEqual({ id: 'tour', target: Option.none() })
    // Moving on forgets it.
    expect(update(lost.model, Message.Next()).model.missing).toEqual(Option.none())
  })

  it('takes no answer but a missing current target', () => {
    const model = started().model
    expect(update(model, Message.Spotlit({ target: 'nav', found: true })).model).toBe(model)
    // An answer for another step's target came late.
    expect(update(model, Message.Spotlit({ target: 'save', found: false })).model).toBe(model)
    const lost = update(model, Message.Spotlit({ target: 'nav', found: false })).model
    expect(update(lost, Message.Spotlit({ target: 'nav', found: false })).model).toBe(lost)
  })
})

type Step = Parameters<typeof Scene.scene<Tour.Model, Tour.Message, Tour.Ended>>[1]

const scene = (
  model: Tour.Model,
  view: Partial<Tour.TourView<Tour.Message>>,
  ...steps: ReadonlyArray<Step>
) =>
  Scene.scene<Tour.Model, Tour.Message, Tour.Ended>(
    {
      update,
      // In a box: ended, the tour draws nothing, and a Scene needs a view.
      view: (current, h) =>
        h.div([], [Tour.view({ model: current, onMessage: message => message, ...view }, h)]),
    },
    Scene.given(model),
    ...steps,
  )

const drawn = (found = true) =>
  Scene.Mount.resolveAll(
    [TrackBox, Message.Spotlit({ target: 'nav', found })],
    [Tour.PlaceStep, Message.Placed()],
  )
const shown = () => Scene.Command.resolve(Tour.ShowStep, Message.CompletedShowStep())
const dialog = Scene.role('dialog')
const layer = Scene.selector('[popover]')

describe('Tour.view', () => {
  it('meets its pattern', () => {
    expect(A11y.validate(Patterns.Tour, TourSlots)).toEqual([])
  })

  it('draws a step as a dialog named and described by it, with its place', () => {
    scene(
      started().model,
      {},
      drawn(),
      Scene.expect(Scene.role('dialog', { name: 'Navigation' })).toExist(),
      Scene.expect(dialog).toHaveAttr('aria-modal', 'false'),
      Scene.expect(dialog).toHaveAttr('aria-describedby', 'tour-description'),
      Scene.expect(dialog).toContainText('1 of 3'),
      Scene.expect(layer).toHaveAttr('data-target', 'nav'),
      Scene.expect(Scene.role('button', { name: 'Back' })).toBeAbsent(),
      Scene.expect(Scene.role('button', { name: 'Next' })).toExist(),
    )
  })

  it('shows a step without a target in the middle, and Done on the last', () => {
    scene(
      started().model,
      {},
      drawn(),
      Scene.click(Scene.role('button', { name: 'Next' })),
      shown(),
      Scene.Mount.expectEnded(Tour.PlaceStep),
      Scene.expect(layer).toHaveAttr('data-target', ''),
      Scene.expect(dialog).toHaveAttr('data-placement-kind', 'centred'),
      Scene.expect(Scene.selector('[aria-hidden="true"]')).toBeAbsent(),
      Scene.expect(Scene.role('button', { name: 'Back' })).toExist(),
      Scene.click(Scene.role('button', { name: 'Next' })),
      shown(),
      Scene.Mount.resolve(Tour.PlaceStep, Message.Placed()),
      Scene.expect(Scene.role('button', { name: 'Done' })).toExist(),
      Scene.expect(dialog).toContainText('3 of 3'),
    )
  })

  it('shows a step whose target is missing in the middle', () => {
    scene(
      started().model,
      {},
      drawn(false),
      shown(),
      Scene.Mount.expectEnded(Tour.PlaceStep),
      Scene.expect(dialog).toHaveAttr('data-placement-kind', 'centred'),
      Scene.expect(layer).toHaveAttr('data-target', ''),
    )
  })

  it('right to left, ArrowLeft goes on', () => {
    scene(
      started().model,
      { direction: 'rtl' },
      drawn(),
      Scene.keydown(dialog, 'ArrowLeft'),
      shown(),
      Scene.Mount.expectEnded(Tour.PlaceStep),
      Scene.expect(dialog).toContainText('2 of 3'),
    )
  })

  it('skips on Escape unless told not to', () => {
    scene(
      started().model,
      {},
      drawn(),
      Scene.keydown(dialog, 'Escape'),
      Scene.expectOutMessage(Tour.Ended.make({ completed: false })),
      Scene.Mount.expectEnded(TrackBox, Tour.PlaceStep),
      Scene.expect(dialog).toBeAbsent(),
    )
    scene(
      started().model,
      { closeOnEscape: false },
      drawn(),
      Scene.keydown(dialog, 'Escape'),
      Scene.expectIgnored(),
    )
  })

  const { Keys } = Behaviors
  const toLast = (name: string, chord: Behaviors.Keys.Gesture): Tour.Route<Tour.Message> =>
    Keys.route(name, {
      on: [chord],
      handle: () => Option.some(Message.Pressed({ key: 'ArrowRight' })),
    })

  it("answers the application's routes on a step beside its own keys", () => {
    scene(
      started().model,
      { routes: [toLast('Next on N', Keys.chord('n'))] },
      drawn(),
      Scene.keydown(dialog, 'n'),
      shown(),
      Scene.Mount.expectEnded(Tour.PlaceStep),
      Scene.expect(dialog).toContainText('2 of 3'),
    )
  })

  it.each([
    ['an arrow', Keys.chord('ArrowRight'), 'Tour ArrowRight'],
    ['Escape', Keys.chord('Escape'), 'Tour Escape'],
  ])('names both routes when one overlaps %s', (_, chord, built) => {
    const diagnostic = diagnosticFrom(() =>
      Tour.view(
        {
          model: started().model,
          config,
          onMessage: message => message,
          routes: [toLast('Mine', chord)],
        },
        SlotView.inertBuilder<Tour.Message>(),
      ),
    )
    expect(diagnostic?.code).toBe('mixins:key-conflict')
    expect(diagnostic?.details?.['contributors']).toEqual([built, 'Mine'])
  })

  it('takes Escape and the arrows with Shift held, and none with Ctrl', () => {
    scene(
      started().model,
      {},
      drawn(),
      Scene.keydown(dialog, 'ArrowRight', { ctrlKey: true }),
      Scene.expectIgnored(),
      Scene.keydown(dialog, 'ArrowRight', { shiftKey: true }),
      shown(),
      Scene.Mount.expectEnded(Tour.PlaceStep),
      Scene.expect(dialog).toContainText('2 of 3'),
    )
  })

  it('leaves Escape out of the routes when told not to, so another may take it', () => {
    expect(
      diagnosticFrom(() =>
        Tour.view(
          {
            model: started().model,
            config,
            onMessage: message => message,
            closeOnEscape: false,
            routes: [toLast('Mine', Keys.chord('Escape'))],
          },
          SlotView.inertBuilder<Tour.Message>(),
        ),
      ),
    ).toBeUndefined()
  })

  it('opens a hole over the target for presses, unless it is not to be used', () => {
    const blocker = Scene.selector('[data-spotlit]')
    scene(started().model, {}, drawn(), Scene.expect(blocker).toHaveStyle('clipPath'))
    scene(
      started().model,
      { interactive: false },
      drawn(),
      Scene.expect(blocker).not.toHaveStyle('clipPath'),
    )
  })

  it('skips on a press on the dim only when told to', () => {
    const blocker = Scene.selector('[data-spotlit]')
    scene(
      started().model,
      { dismissOnOutside: true },
      drawn(),
      Scene.click(blocker),
      Scene.expectOutMessage(Tour.Ended.make({ completed: false })),
      Scene.Mount.expectEnded(TrackBox, Tour.PlaceStep),
    )
    expect(() => scene(started().model, {}, drawn(), Scene.click(blocker))).toThrow(/click handler/)
  })

  it('draws nothing while not running', () => {
    expect(
      Tour.view({ model: init({ id: 'tour' }), config, onMessage: () => message('Other') }, h),
    ).toBeNull()
  })

  it('fills the words, the place counted from 1', () => {
    scene(
      started().model,
      { words: { progress: 'Step {step} of {count}', skip: 'Not now' } },
      drawn(),
      Scene.expect(dialog).toContainText('Step 1 of 3'),
      Scene.expect(Scene.role('button', { name: 'Not now' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'Next' })).toExist(),
    )
  })

  it("draws a step's content in place of its words, still describing it", () => {
    scene(
      started().model,
      { content: (step, index) => h.strong([], [`${index}: ${step.title}`]) },
      drawn(),
      Scene.expect(Scene.selector('#tour-description strong')).toContainText('0: Navigation'),
      Scene.expect(dialog).not.toContainText('Every page is here.'),
    )
  })

  it('moves on at a press on the target with advanceOnClick, only while the target can be used', () => {
    scene(
      started().model,
      { advanceOnClick: Tour.advanceOnClick },
      Scene.Mount.expectExact(TrackBox, Tour.PlaceStep, Tour.advanceOnClick),
      Scene.Mount.resolveAll(
        [TrackBox, Message.Spotlit({ target: 'nav', found: true })],
        [Tour.PlaceStep, Message.Placed()],
        [Tour.advanceOnClick, Message.Next()],
      ),
      shown(),
      // The next step stands in the middle, with no target to listen on.
      Scene.Mount.expectEnded(Tour.PlaceStep, Tour.advanceOnClick),
      Scene.expect(dialog).toContainText('2 of 3'),
    )
    scene(
      started().model,
      { advanceOnClick: Tour.advanceOnClick, interactive: false },
      Scene.Mount.expectExact(TrackBox, Tour.PlaceStep),
      drawn(),
    )
  })
})

describe('Tour steps held in the Model', () => {
  it('update(config) and the view read the steps they are given over the Model’s', () => {
    const own = Tour.update({ steps: [config.steps[0]!] })
    const done = own(started().model, Message.Next())
    expect(done.outMessage).toEqual(Tour.Ended.make({ completed: true }))
    expect(update(started().model, Message.Next()).model.step).toBe(1)
  })

  it('starts with no steps and draws nothing', () => {
    const empty = Tour.start(init({ id: 'tour' }))
    expect(empty.commands?.[0]?.args).toEqual({ id: 'tour', target: Option.none() })
    expect(Tour.view({ model: empty.model, onMessage: () => message('Other') }, h)).toBeNull()
  })
})

describe('Tour.configure', () => {
  it('lays base, preset and call, words merging', () => {
    const Own = Tour.configure({
      base: { words: { skip: 'Leave' } },
      presets: { quiet: { words: { next: 'On' } } },
    })
    const drawn = JSON.stringify(
      Own.view({ preset: 'quiet', model: started().model, onMessage: () => message('Other') }, h),
    )
    expect(drawn).toContain('Leave')
    expect(drawn).toContain('"On"')
  })
})
