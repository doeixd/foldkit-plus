/// <reference types="@vitest/browser-playwright" />
/**
 * The native Select in a real browser: the browser's arrow is gone and the
 * recipe's chevron sits at the inline end, the right left to right and the
 * left right to left, and stays under the filled variant's fill; a
 * placeholder chosen reads muted, a value in the default ink.
 */
import { Schema } from 'effect'
import { view as selectView } from '@foldkit/ui/select'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Recipes, Select, SelectSlots } from '../src/index.js'
import type { TestMessage } from './fixture.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const Model = Schema.Struct({})
let handle: { dispose: () => void } | undefined

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const draw = async (variant: 'outline' | 'filled', dir: 'ltr' | 'rtl', chosen: '' | 'eu') => {
  const named = Style.forSlots(SelectSlots)(Recipes.Select({ variant }))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + named.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'select-browser'
  const holder = document.createElement('div')
  holder.dir = dir
  holder.style.inlineSize = '16rem'
  holder.append(container)
  document.body.append(holder)
  handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type, _: TestMessage) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<TestMessage>) =>
        selectView<TestMessage>(
          {
            id: 'region',
            value: chosen,
            toView: Select.toView([named.mixin], { h }, resolved =>
              h.div(
                [],
                [
                  h.label(resolved.label, ['Region']),
                  h.select(resolved.select, [
                    h.option([h.Value(''), h.Disabled(true)], ['Choose a region']),
                    h.option([h.Value('eu')], ['Europe']),
                  ]),
                ],
              ),
            ),
          },
          h,
        ),
    }),
  )
  await vi.waitFor(() => expect(document.getElementById('region')).not.toBeNull())
  const select = document.querySelector('select')!
  select.value = chosen
  return select
}

test.each([
  ['outline', 'ltr', 'right'],
  ['filled', 'ltr', 'right'],
  ['outline', 'rtl', 'left'],
] as const)(
  'a %s select %s has no native arrow and a chevron at the %s',
  async (variant, dir, edge) => {
    const select = await draw(variant, dir, 'eu')
    const style = getComputedStyle(select)
    expect(style.appearance).toBe('none')
    expect(style.backgroundImage.match(/linear-gradient/g)).toHaveLength(2)
    // Measured from the edge named: from the right as `100%` less the offset, from the left as the offset.
    const fromEdge = style.backgroundPositionX.split(', ').map(x => {
      const right = /^calc\(100% - ([\d.]+)px\)$/.exec(x)
      const left = /^([\d.]+)px$/.exec(x)
      return edge === 'right' ? Number(right?.[1]) : Number(left?.[1])
    })
    expect(fromEdge[0]).toBeGreaterThan(fromEdge[1]!)
    // Inside the room the padding keeps at that end for it.
    const room = parseFloat(edge === 'right' ? style.paddingRight : style.paddingLeft)
    expect(fromEdge[1]).toBeGreaterThan(0)
    expect(fromEdge[0]).toBeLessThan(room)
  },
)

test('a chosen placeholder reads muted, a chosen value in the default ink', async () => {
  const select = await draw('outline', 'ltr', '')
  const placeholder = getComputedStyle(select).color
  select.value = 'eu'
  const value = getComputedStyle(select).color
  expect(placeholder).not.toBe(value)
  const root = getComputedStyle(document.documentElement)
  const probe = document.createElement('span')
  probe.style.color = root.getPropertyValue('--fk-text-muted')
  document.body.append(probe)
  expect(placeholder).toBe(getComputedStyle(probe).color)
})
