/**
 * A carousel on a real page: each slide fills the track, and Next, through
 * the application's `update` and `ShowSlide`, scrolls the track until the
 * next slide starts where the track does, and the dot follows.
 */
import { Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Carousel, CarouselSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(CarouselSlots)(Recipes.Carousel({}))

const Model = Schema.Struct({ index: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Chose: { index: Schema.Number }, Showed: {} })
type Message = typeof Message.Type

const update = (
  model: Model,
  message: Message,
): { readonly model: Model; readonly commands?: ReadonlyArray<Command.Command<Message>> } =>
  Message.match(message, {
    Chose: ({ index }) => ({
      model: modifyFields(model, { index: () => index }),
      commands: Command.mapMessages([Carousel.ShowSlide({ id: 'trip', index })], () =>
        Message.Showed(),
      ),
    }),
    Showed: () => ({ model }),
  })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const element = (selector: string): HTMLElement => {
  const found = document.querySelector(selector)
  if (!(found instanceof HTMLElement)) throw new Error(`no ${selector}`)
  return found
}

test('Next scrolls the next slide to the start of the track', async () => {
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
  container.id = 'carousel-browser'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { index: 0 } }),
      update,
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Style({ width: '320px' })],
          [
            Carousel.view(
              {
                id: 'trip',
                label: 'Trip photos',
                slides: ['Dunes', 'Coast', 'Ridge'].map(name =>
                  h.p([h.Style({ height: '120px', margin: '0' })], [name]),
                ),
                index: model.index,
                onIndex: index => Message.Chose({ index }),
                style,
              },
              h,
            ),
          ],
        ),
    }),
  )
  try {
    await vi.waitFor(() => element('#trip-slide-2'))
    const track = element('#trip-track')
    const second = element('#trip-slide-1')
    expect(element('#trip-slide-0').getBoundingClientRect().width).toBeCloseTo(track.clientWidth, 0)
    expect(second.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      track.getBoundingClientRect().right,
    )
    element('[aria-label="Next slide"]').click()
    await vi.waitFor(() =>
      expect(
        Math.abs(second.getBoundingClientRect().left - track.getBoundingClientRect().left),
      ).toBeLessThan(1),
    )
    expect(element('[aria-current="true"]').getAttribute('aria-label')).toBe('2 of 3')
    expect(element('[role="status"]').textContent).toBe('2 of 3')
  } finally {
    handle.dispose()
  }
})
