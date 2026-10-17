// @vitest-environment jsdom
/**
 * Tour as a transition and as markup: it starts at its first step, moves on
 * and back within its steps, ends completed by its last Next or skipped, a
 * step whose target is missing shows in the middle, and each step is a
 * non-modal dialog that names its place and takes the arrows.
 */
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y } from 'foldkit-mixins'
// From the modules, not the index: the test reads nothing else.
import { TourSlots, type Config } from '../src/tour.js'
import { Tour, Patterns } from '../src/index.js'
import { h, message } from './fixture.js'

const { Message, init } = Tour

const config: Config = {
  steps: [
    { title: 'Navigation', description: 'Every page is here.', target: 'nav' },
    { title: 'Welcome', description: 'A step in the middle.' },
    { title: 'Save', description: 'Keep your work.', target: 'save', placement: 'top' },
  ],
}
const update = Tour.update(config)
const started = (opener?: string) =>
  Tour.start(init({ id: 'tour' }), config, opener === undefined ? {} : { opener })
const at = (step: number) =>
  Array.from({ length: step }).reduce<Tour.Model>(
    model => update(model, Message.Next()).model,
    started('help').model,
  )
const names = (result: { readonly commands?: ReadonlyArray<{ readonly name: string }> }) =>
  (result.commands ?? []).map(command => command.name)

describe('Tour.update', () => {
  it('starts at the first step, scrolling its target into view', () => {
    const { model, commands } = started('help')
    expect(model.open).toBe(true)
    expect(model.step).toBe(0)
    expect(model.opener).toEqual(Option.some('help'))
    expect(commands?.[0]?.args).toEqual({ id: 'tour', target: Option.some('nav') })
    // Started again, it begins over.
    expect(Tour.start(at(2), config).model.step).toBe(0)
  })

  it('moves on and back, never before the first', () => {
    const next = update(started().model, Message.Next())
    expect(next.model.step).toBe(1)
    expect(next.commands?.[0]?.args).toEqual({ id: 'tour', target: Option.none() })
    expect(update(next.model, Message.Back()).model.step).toBe(0)
    const first = started().model
    expect(update(first, Message.Back()).model).toBe(first)
  })

  it('ends completed by Next on the last step, with focus back to what started it', () => {
    const done = update(at(2), Message.Next())
    expect(done.model.open).toBe(false)
    expect(done.outMessage).toEqual(Tour.Ended.make({ completed: true }))
    expect(names(done)).toEqual(['Tour.FocusOpener'])
    expect(done.commands?.[0]?.args).toEqual({ elementId: 'help' })
    expect(update(done.model, Message.Next()).model).toBe(done.model)
  })

  it('ends skipped, and with no opener gives focus to nothing', () => {
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
        h.div(
          [],
          [Tour.view({ model: current, config, onMessage: message => message, ...view }, h)],
        ),
    },
    Scene.given(model),
    ...steps,
  )

const drawn = (found = true) =>
  Scene.Mount.resolveAll(
    [Tour.Spotlight, Message.Spotlit({ target: 'nav', found })],
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
      Scene.Mount.expectEnded(Tour.Spotlight, Tour.PlaceStep),
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
      Scene.Mount.expectEnded(Tour.Spotlight, Tour.PlaceStep),
    )
    expect(() => scene(started().model, {}, drawn(), Scene.click(blocker))).toThrow(/click handler/)
  })

  it('draws nothing while not running', () => {
    expect(
      Tour.view({ model: init({ id: 'tour' }), config, onMessage: () => message('Other') }, h),
    ).toBeNull()
  })
})
