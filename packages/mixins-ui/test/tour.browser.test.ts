/**
 * A tour in a real browser: started, it shows in the top layer beside its
 * target, focused, with a cutout ringing the target that presses reach and
 * the dim around it takes; the keys move it on and Escape ends it with
 * focus back where it started; a far target is scrolled into view with the
 * cutout following it; and a step whose target is missing stands in the
 * middle of the viewport.
 */
import { Schema } from 'effect'
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
import * as Recipes from '../src/recipes/tour.js'
import * as Tour from '../src/tour.js'
import { TourSlots, type Config } from '../src/tour.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(TourSlots)(Recipes.Tour({}))
// Still, so the cutout rests where it is going as soon as it is drawn.
const still = ':root { --fk-knob-travel: 0 }'

const config: Config = {
  steps: [
    { title: 'Navigation', description: 'Every page is here.', target: 'nav' },
    { title: 'Save', description: 'Keep your work.', target: 'save', placement: 'top' },
    { title: 'Lost', description: 'Its target is not on the page.', target: 'nowhere' },
  ],
}
const update = Tour.update(config)

const Model = Schema.Struct({ tour: Tour.Model, pressed: Schema.Number })
type Model = typeof Model.Type
const Got = defineMessageUnion({
  Started: {},
  GotTour: { message: Tour.Message },
  PressedNav: {},
})
type Got = typeof Got.Type

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
  window.scrollTo(0, 0)
})

const mount = (view: Partial<Tour.TourView<Got>> = {}, direction: 'ltr' | 'rtl' = 'ltr') => {
  document.documentElement.dir = direction
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css +
    still
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = `tour-${direction}`
  document.body.appendChild(container)
  const fold = (model: Model, step: Tour.Return): Update.Return<Model, Got> => ({
    model: modifyFields(model, { tour: () => step.model }),
    commands: Command.mapMessages(step.commands ?? [], message => Got.GotTour({ message })),
  })
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { tour: Tour.init({ id: 'tour' }), pressed: 0 } }),
      update: (model: Model, message: Got) =>
        Got.match(message, {
          Started: () => fold(model, Tour.start(model.tour, config, { opener: 'help' })),
          GotTour: ({ message: inner }) => fold(model, update(model.tour, inner)),
          PressedNav: () => ({
            model: modifyFields(model, { pressed: pressed => pressed + 1 }),
          }),
        }),
      view: (model: Model, h: HtmlBuilder<Got>) =>
        h.div(
          [h.Style({ padding: '40px' })],
          [
            h.button([h.Id('help'), h.OnClick(Got.Started())], ['Start tour']),
            h.button(
              [h.Id('nav'), h.OnClick(Got.PressedNav()), h.Style({ marginInlineStart: '200px' })],
              [`Navigation ${model.pressed}`],
            ),
            h.div([h.Style({ blockSize: '2000px' })], []),
            h.button([h.Id('save')], ['Save']),
            Tour.view(
              {
                model: model.tour,
                config,
                onMessage: message => Got.GotTour({ message }),
                direction,
                style,
                ...view,
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const panel = () => document.getElementById('tour-panel')
const spotlight = () => document.querySelector<HTMLElement>('[popover] > [aria-hidden="true"]')
const byId = (id: string) => document.getElementById(id)!

/** Starts the tour from its button, and waits for the first step to take focus. */
const started = async () => {
  await vi.waitFor(() => expect(document.getElementById('help')).not.toBeNull())
  await userEvent.click(byId('help'))
  await vi.waitFor(() => expect(document.activeElement).toBe(panel()))
}

test('shows in the top layer below its target, focused, the cutout ringing the target', async () => {
  const mounted = mount()
  try {
    await started()
    expect(panel()!.parentElement!.matches(':popover-open')).toBe(true)
    const target = byId('nav').getBoundingClientRect()
    expect(panel()!.getBoundingClientRect().top).toBeGreaterThan(target.bottom)
    await vi.waitFor(() => {
      const ring = spotlight()!.getBoundingClientRect()
      expect(ring.left).toBeCloseTo(target.left - 8, 0)
      expect(ring.top).toBeCloseTo(target.top - 8, 0)
      expect(ring.width).toBeCloseTo(target.width + 16, 0)
    })
  } finally {
    mounted.dispose()
  }
})

test('presses reach the target through the cutout, and the dim takes the rest', async () => {
  const mounted = mount()
  try {
    await started()
    const target = byId('nav').getBoundingClientRect()
    await vi.waitFor(() =>
      expect(
        document.elementFromPoint(target.left + target.width / 2, target.top + target.height / 2),
      ).toBe(byId('nav')),
    )
    const help = byId('help').getBoundingClientRect()
    expect(document.elementFromPoint(help.left + 4, help.top + 4)).not.toBe(byId('help'))
  } finally {
    mounted.dispose()
  }
})

test('a target not to be used is covered too', async () => {
  const mounted = mount({ interactive: false })
  try {
    await started()
    const target = byId('nav').getBoundingClientRect()
    await vi.waitFor(() => expect(spotlight()).not.toBeNull())
    expect(
      document.elementFromPoint(target.left + target.width / 2, target.top + target.height / 2),
    ).not.toBe(byId('nav'))
  } finally {
    mounted.dispose()
  }
})

test('goes on to a far target, scrolled into view with the cutout following', async () => {
  const mounted = mount()
  try {
    await started()
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(panel()!.textContent).toContain('2 of 3'))
    await vi.waitFor(() => {
      const target = byId('save').getBoundingClientRect()
      expect(target.top).toBeGreaterThan(0)
      expect(target.bottom).toBeLessThan(window.innerHeight)
      expect(spotlight()!.getBoundingClientRect().top).toBeCloseTo(target.top - 8, 0)
      // Placed above it, as the step asks.
      expect(panel()!.getBoundingClientRect().bottom).toBeLessThan(target.top)
    })
    await vi.waitFor(() => expect(document.activeElement).toBe(panel()))
  } finally {
    mounted.dispose()
  }
})

test('a step whose target is missing stands in the middle of the viewport, focused', async () => {
  const mounted = mount()
  try {
    await started()
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(panel()!.textContent).toContain('2 of 3'))
    await vi.waitFor(() => expect(document.activeElement).toBe(panel()))
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(panel()!.textContent).toContain('3 of 3'))
    await vi.waitFor(() => {
      const box = panel()!.getBoundingClientRect()
      expect(box.left + box.width / 2).toBeCloseTo(window.innerWidth / 2, -1)
      expect(box.top + box.height / 2).toBeCloseTo(window.innerHeight / 2, -1)
    })
    expect(spotlight()).toBeNull()
    // With no cutout to cast it, the dim is the blocker's own fill.
    const blocker = document.querySelector('[data-spotlit]')!
    expect(getComputedStyle(blocker).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    await vi.waitFor(() => expect(document.activeElement).toBe(panel()))
  } finally {
    mounted.dispose()
  }
})

test('Escape ends it, giving focus back to what started it', async () => {
  const mounted = mount()
  try {
    await started()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panel()).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(byId('help')))
  } finally {
    mounted.dispose()
  }
})

test('right to left, ArrowLeft goes on and ArrowRight back', async () => {
  const mounted = mount({}, 'rtl')
  try {
    await started()
    await userEvent.keyboard('{ArrowLeft}')
    await vi.waitFor(() => expect(panel()!.textContent).toContain('2 of 3'))
    await vi.waitFor(() => expect(document.activeElement).toBe(panel()))
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(panel()!.textContent).toContain('1 of 3'))
  } finally {
    mounted.dispose()
  }
})
