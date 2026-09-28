import { Option } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { Style } from 'foldkit-mixins'
import { Inert, type Node as InertNode } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { type Model, Weather, WeatherAsyncData } from '../src/main.js'
import { stylesheet } from '../src/style.js'
import { weatherData, weatherModel } from './main.fixture.js'

const withWeather = (weather: Model['weather']): Model =>
  modifyFields(weatherModel, { weather: () => weather })

const models: ReadonlyArray<readonly [string, Model]> = [
  ['idle', weatherModel],
  ['loading', withWeather(WeatherAsyncData.Loading())],
  ['failed', withWeather(WeatherAsyncData.Failure({ error: 'Location not found' }))],
  ['loaded', withWeather(WeatherAsyncData.Success({ data: weatherData }))],
]

/** The compiled CSS behind the classes on `nodes`. */
const cssOf = (nodes: ReadonlyArray<InertNode>): string =>
  Style.usedIn(nodes.flatMap(Inert.classes).join(' '))

describe('the weather view', () => {
  test.each(models)('draws every element through a Slot when %s', (_, model) => {
    expect(Inert.unslotted(Inert.draw(Weather, model))).toEqual([])
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    // A token read without a fallback renders nothing when the sheet lacks it.
    const read = new Set(
      models.flatMap(([, model]) =>
        [...cssOf(Inert.all(Inert.draw(Weather, model))).matchAll(/var\((--fk-[\w-]+)\)/g)].map(
          ([, name]) => name,
        ),
      ),
    )
    expect(read.size).toBeGreaterThan(0)
    expect([...read].filter(name => !stylesheet.includes(`${name}:`))).toEqual([])
  })

  test('draws the submit button as the solid Button recipe', () => {
    const buttons = Inert.byTag(Inert.draw(Weather, weatherModel), 'button')
    expect(buttons).toHaveLength(1)
    expect(cssOf(buttons)).toContain('background:var(--_fk-tone-fill)')
  })

  test.each([
    ['with its region', Option.some('California'), 'Beverly Hills, California'],
    ['alone when the geocoder names no region', Option.none(), 'Beverly Hills'],
  ])('names the place %s', (_, maybeRegion, expected) => {
    const tree = Inert.draw(
      Weather,
      withWeather(
        WeatherAsyncData.Success({
          data: modifyFields(weatherData, { maybeRegion: () => maybeRegion }),
        }),
      ),
    )
    expect(Inert.bySlot(tree, 'location').map(Inert.text)).toEqual([expected])
  })
})
