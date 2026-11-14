// @vitest-environment jsdom
/**
 * Every form control that submits a value, rendered on a server and read back
 * from the markup: a form submitted before the page hydrates must carry the
 * `name` and the value.
 */
import { Effect, Option } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { expect, test } from 'vitest'
import { CheckboxGroup, Rating, Slider } from '../src/index.js'

const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

const served = async (draw: (h: HtmlBuilder<never>) => Html): Promise<Document> => {
  const page = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: {} }),
        view: (_: {}, h: HtmlBuilder<never>) => ({ title: 'Form', body: draw(h) }),
      },
      { buildId: 'b' },
    ),
  )
  return new DOMParser().parseFromString(injectIntoTemplate(template, page), 'text/html')
}

const submitted = (page: Document, name: string) =>
  Array.from(page.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)).map(input => ({
    type: input.type,
    value: input.getAttribute('value'),
    checked: input.hasAttribute('checked'),
  }))

test('a slider names its value, a range both of its', async () => {
  const single = await served(h =>
    Slider.view(
      { id: 's', label: 'Volume', value: 30, onChange: () => undefined as never, name: 'volume' },
      h,
    ),
  )
  expect(submitted(single, 'volume')).toEqual([{ type: 'range', value: '30', checked: false }])
  const range = await served(h =>
    Slider.view(
      {
        id: 'r',
        label: 'Price',
        value: { low: 10, high: 70 },
        onChange: () => undefined as never,
        name: 'price',
      },
      h,
    ),
  )
  expect(submitted(range, 'price').map(input => input.value)).toEqual(['10', '70'])
})

test('a rating names its radios apart from its id, and checks the one given', async () => {
  const page = await served(h =>
    Rating.view(
      {
        id: 'quality',
        name: 'stars',
        label: 'Quality',
        value: Option.some(3),
        onChange: () => undefined as never,
      },
      h,
    ),
  )
  const radios = submitted(page, 'stars')
  expect(radios.map(input => input.value)).toEqual(['1', '2', '3', '4', '5'])
  expect(radios.filter(input => input.checked).map(input => input.value)).toEqual(['3'])
  expect(submitted(page, 'quality')).toEqual([])
})

test('a checkbox group submits each checked value and none other', async () => {
  const page = await served(h =>
    CheckboxGroup.view(
      {
        id: 'alerts',
        legend: 'Send me',
        name: 'alerts',
        options: [
          { value: 'mentions', label: 'Mentions' },
          { value: 'digest', label: 'Digest' },
          { value: 'offers', label: 'Offers' },
        ],
        checked: ['offers', 'mentions'],
        onToggle: () => undefined as never,
      },
      h,
    ),
  )
  expect(submitted(page, 'alerts').map(input => [input.type, input.value])).toEqual([
    ['hidden', 'mentions'],
    ['hidden', 'offers'],
  ])
})
