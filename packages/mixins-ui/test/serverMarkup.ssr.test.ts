// @vitest-environment jsdom
/**
 * Each widget drawn the way a server draws it and parsed back as a browser
 * would (`parsed`, whose renderer refuses a view whose parse differs), then
 * read for what a form or assistive technology reads from markup that has not
 * hydrated: roles, names, the initial state and the ids that point at each
 * other. Tables, listboxes, tabs, trees and dialogs have tests of their own in
 * `table.ssr.test.ts` and `conformance/conformance.ssr.test.ts`.
 */
import * as UpstreamCombobox from '@foldkit/ui/combobox'
import { Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Conformance } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'
import {
  Accordion,
  Breadcrumb,
  Card,
  Carousel,
  Combobox,
  ComboboxView,
  Nav,
  Pagination,
  Picker,
  Rating,
  Segmented,
  Slider,
  Steps,
  Toast,
  TreeView,
} from '../src/index.js'
import { parsed } from './ssr.js'

const attr = (page: Document, selector: string, name: string): string | null => {
  const found = page.querySelector(selector)
  expect(found, selector).not.toBeNull()
  return found!.getAttribute(name)
}

const text = (page: Document, selector: string): string => {
  const found = page.querySelector(selector)
  expect(found, selector).not.toBeNull()
  return found!.textContent ?? ''
}

/** What an `aria-controls`, `aria-labelledby` or `aria-describedby` points at must be in the page. */
const pointsAt = (page: Document, from: string, name: string): Element => {
  const ids = attr(page, from, name)
  expect(ids, `${from} ${name}`).not.toBeNull()
  const target = page.getElementById(ids!)
  expect(target, `#${ids}`).not.toBeNull()
  return target!
}

const holds = (result: Conformance.Result) => expect(Conformance.failures(result)).toEqual([])

const sorts = [
  { value: 'relevance', label: 'Most relevant' },
  { value: 'price', label: 'Lowest price' },
]

describe('navigation', () => {
  test('a nested, checkable tree names its rows, levels, checks and open state', async () => {
    const page = await parsed(
      TreeView.init({ id: 'files', open: ['src'], checked: ['index'] }),
      (model, h: HtmlBuilder<TreeView.Message>) =>
        TreeView.view(
          {
            label: 'Files',
            model,
            checkable: true,
            nodes: [
              {
                id: 'src',
                label: 'src',
                children: [
                  { id: 'index', label: 'index.ts' },
                  { id: 'deep', label: 'deep', children: [{ id: 'x', label: 'x.ts' }] },
                ],
              },
              { id: 'readme', label: 'README.md' },
            ],
            onMessage: message => message,
          },
          h,
        ),
    )
    holds(
      Conformance.server('tree', page, [
        { role: 'tree', name: 'Files' },
        {
          role: 'treeitem',
          name: 'src',
          attributes: { 'aria-level': '1', 'aria-expanded': 'true', 'aria-checked': 'mixed' },
        },
        {
          role: 'treeitem',
          name: 'index.ts',
          attributes: { 'aria-level': '2', 'aria-checked': 'true', 'aria-expanded': false },
        },
        {
          role: 'treeitem',
          name: 'deep',
          attributes: { 'aria-level': '2', 'aria-expanded': 'false', 'aria-checked': 'false' },
        },
        { role: 'treeitem', name: 'README.md', attributes: { 'aria-checked': 'false' } },
      ]),
    )
    // The shut folder's rows are out of reach as well as out of sight.
    const shut = page.getElementById('files-item-x')?.closest('[role="group"]')
    expect(shut?.hasAttribute('inert')).toBe(true)
    // One row holds the tab stop.
    expect(page.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1)
  })

  test('a nav names its landmark, marks the current page and wires a trigger to its panel', async () => {
    const page = await parsed(
      { ...Nav.init('site'), open: Option.some('products') },
      (model, h: HtmlBuilder<Nav.Message>) =>
        Nav.view(
          {
            model,
            label: 'Main',
            onMessage: message => message,
            entries: [
              { label: 'Home', href: '/', current: true },
              {
                id: 'products',
                label: 'Products',
                groups: [
                  { title: 'Tools', links: [{ label: 'Hammer', href: '/h', description: 'Hits' }] },
                ],
              },
            ],
          },
          h,
        ),
    )
    expect(attr(page, 'nav', 'aria-label')).toBe('Main')
    expect(attr(page, 'a[href="/"]', 'aria-current')).toBe('page')
    const trigger = 'button[aria-controls]'
    expect(attr(page, trigger, 'aria-expanded')).toBe('true')
    expect(attr(page, trigger, 'type')).toBe('button')
    expect(pointsAt(page, trigger, 'aria-controls').querySelector('a[href="/h"]')).not.toBeNull()
    expect(attr(page, 'a[href="/h"]', 'aria-current')).toBeNull()
  })

  test('a closed nav draws no panel, and its trigger says so', async () => {
    const page = await parsed(Nav.init('site'), (model, h: HtmlBuilder<Nav.Message>) =>
      Nav.view(
        {
          model,
          label: 'Main',
          onMessage: message => message,
          entries: [
            {
              id: 'products',
              label: 'Products',
              groups: [{ links: [{ label: 'Hammer', href: '/h' }] }],
            },
          ],
        },
        h,
      ),
    )
    expect(attr(page, 'button', 'aria-expanded')).toBe('false')
    // An id with no element is a dangling reference.
    expect(attr(page, 'button', 'aria-controls')).toBeNull()
    expect(page.querySelector('a[href="/h"]')).toBeNull()
  })

  test('pagination names the page it is on and its moves, and says which rows it shows', async () => {
    const page = await parsed({}, (_model, h: HtmlBuilder<number>) =>
      Pagination.view(
        {
          page: 3,
          pageCount: 9,
          onPage: next => next,
          ends: true,
          range: { total: 97, perPage: 10 },
        },
        h,
      ),
    )
    expect(attr(page, 'nav', 'aria-label')).toBe('Pagination')
    const current = page.querySelectorAll('[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]?.textContent).toContain('3')
    for (const name of ['First page', 'Previous page', 'Next page', 'Last page']) {
      expect(page.querySelector(`button[aria-label="${name}"]`), name).not.toBeNull()
    }
    expect(text(page, 'nav')).toContain('21–30 of 97')
  })

  test('a collapsed breadcrumb keeps the ends, a named ellipsis and the current step unlinked', async () => {
    const page = await parsed({}, (_model, h: HtmlBuilder<string>) =>
      Breadcrumb.view(
        {
          steps: [
            { label: 'Home', href: '/' },
            { label: 'A', href: '/a' },
            { label: 'B', href: '/b' },
            { label: 'C', href: '/c' },
            { label: 'D', current: true },
          ],
          collapse: { max: 3, onExpand: 'expand' },
        },
        h,
      ),
    )
    expect(attr(page, 'nav', 'aria-label')).toBe('Breadcrumb')
    expect(Array.from(page.querySelectorAll('ol > li')).map(item => item.textContent)).toEqual([
      'Home',
      '…',
      'C',
      'D',
    ])
    expect(attr(page, 'li button', 'aria-label')).toBe('Show 2 more')
    expect(attr(page, 'li:last-child *', 'aria-current')).toBe('page')
    expect(page.querySelector('li:last-child a')).toBeNull()
  })

  test('steps mark the one being taken and say what the others are', async () => {
    const page = await parsed({}, (_model, h: HtmlBuilder<number>) =>
      Steps.view(
        {
          label: 'Checkout',
          current: 1,
          onSelect: index => index,
          steps: [{ title: 'Cart' }, { title: 'Pay' }, { title: 'Done' }],
        },
        h,
      ),
    )
    expect(attr(page, 'ol', 'aria-label')).toBe('Checkout')
    const items = Array.from(page.querySelectorAll('ol > li'))
    expect(items.map(item => item.getAttribute('aria-current'))).toEqual([null, 'step', null])
    expect(items.map(item => item.getAttribute('data-state'))).toEqual([
      'complete',
      'current',
      'upcoming',
    ])
    // Only a completed step can be pressed back to.
    expect(items.map(item => item.querySelector('button') !== null)).toEqual([true, false, false])
    expect(items[0]?.textContent).toContain('Cart')
    expect(items[0]?.textContent).toContain('Completed')
    expect(items[2]?.textContent).toContain('Done')
    expect(items[2]?.textContent).toContain('Upcoming')
  })
})

describe('disclosure and content', () => {
  test('an accordion wires each trigger to its region at the heading level asked', async () => {
    const page = await parsed({}, (_model, h: HtmlBuilder<string>) =>
      Accordion.view(
        {
          id: 'faq',
          headingLevel: 4,
          items: [
            { id: 'a', title: 'First', content: 'aa' },
            { id: 'b', title: 'Second', content: 'bb' },
          ],
          open: ['b'],
          onToggle: id => id,
        },
        h,
      ),
    )
    expect(page.querySelectorAll('h4 > button')).toHaveLength(2)
    expect(page.querySelectorAll('h3')).toHaveLength(0)
    holds(
      Conformance.server('accordion', page, [
        {
          role: 'region',
          name: 'First',
          attributes: { 'aria-labelledby': 'faq-a-trigger', inert: true },
        },
        { role: 'region', name: 'Second', attributes: { inert: false } },
      ]),
    )
    expect(attr(page, '#faq-a-trigger', 'aria-expanded')).toBe('false')
    expect(attr(page, '#faq-b-trigger', 'aria-expanded')).toBe('true')
    expect(pointsAt(page, '#faq-b-trigger', 'aria-controls').id).toBe('faq-b-panel')
  })

  test('a pressed card is one named button with its selection, under a heading of the level asked', async () => {
    const page = await parsed({}, (_model, h: HtmlBuilder<string>) =>
      Card.view(
        {
          title: 'Plan',
          headingLevel: 4,
          description: 'Monthly',
          press: { onClick: 'chose' },
          selected: true,
        },
        h,
      ),
    )
    expect(text(page, 'h4')).toBe('Plan')
    expect(page.querySelectorAll('h3')).toHaveLength(0)
    expect(attr(page, 'button', 'aria-label')).toBe('Plan')
    expect(attr(page, 'button', 'aria-pressed')).toBe('true')
    expect(attr(page, 'button', 'type')).toBe('button')
  })

  test('a carousel is a named group of slides, one current and the rest out of reach', async () => {
    const page = await parsed(
      Carousel.init({ id: 'gallery', index: 1 }),
      (model, h: HtmlBuilder<Carousel.Message>) =>
        Carousel.view(
          {
            label: 'Photos',
            model,
            onMessage: message => message,
            slides: [h.p([], ['one']), h.p([], ['two']), h.p([], ['three'])],
          },
          h,
        ),
    )
    holds(
      Conformance.server('carousel', page, [
        { role: 'group', name: 'Photos', attributes: { 'aria-roledescription': 'carousel' } },
        {
          role: 'group',
          name: '2 of 3',
          attributes: { 'aria-roledescription': 'slide', 'data-current': 'true', inert: false },
        },
        { role: 'group', name: '1 of 3', attributes: { inert: true, 'data-current': 'false' } },
        { role: 'group', name: '3 of 3', attributes: { inert: true } },
      ]),
    )
    for (const control of Array.from(page.querySelectorAll('[aria-controls]'))) {
      const target = page.getElementById(control.getAttribute('aria-controls')!)
      expect(target, control.outerHTML).not.toBeNull()
    }
    expect(attr(page, 'button[aria-label="2 of 3"]', 'aria-current')).toBe('true')
    expect(text(page, '[role="status"]')).toBe('2 of 3')
  })

  test('a toast stack is a named region whose error is also in an alert region', async () => {
    const stack = Toast.show(Toast.init('toasts'), {
      type: 'error',
      title: 'Failed',
      description: 'No network',
    }).model
    const page = await parsed(stack, (model, h: HtmlBuilder<Toast.Message>) =>
      Toast.view({ model, onMessage: message => message }, h),
    )
    holds(Conformance.server('toast', page, [{ role: 'region', name: 'Notifications' }]))
    expect(attr(page, 'li', 'data-type')).toBe('error')
    expect(attr(page, 'li button', 'aria-label')).toBe('Dismiss')
    expect(text(page, '[role="alert"]')).toBe('Failed. No network')
    expect(text(page, '[role="status"]')).toBe('')
  })
})

describe('choosing', () => {
  test('a picker draws a named trigger for the dropdown and one for the sheet, both saying the choice', async () => {
    const page = await parsed(
      Picker.init({ id: 'sort' }),
      (model, h: HtmlBuilder<Picker.Message>) =>
        Picker.view(
          {
            model,
            label: 'Sort',
            placeholder: 'Choose',
            value: Option.some('price'),
            onMessage: message => message,
            options: sorts,
          },
          h,
        ),
    )
    const triggers = Array.from(page.querySelectorAll('button[aria-haspopup]'))
    expect(triggers.map(trigger => trigger.getAttribute('aria-haspopup'))).toEqual([
      'listbox',
      'dialog',
    ])
    expect(triggers.map(trigger => trigger.getAttribute('aria-label'))).toEqual([
      'Sort: Lowest price',
      'Sort: Lowest price',
    ])
    expect(triggers.map(trigger => trigger.getAttribute('aria-expanded'))).toEqual([
      'false',
      'false',
    ])
    expect(attr(page, 'dialog', 'aria-labelledby')).toBe('sort-sheet-dialog-title')
  })

  test('a combobox is an input with the combobox role, closed, announcing a list', async () => {
    const Fruits = ComboboxView.create<string>()
    const page = await parsed(
      UpstreamCombobox.init({ id: 'fruit' }),
      (model, h: HtmlBuilder<UpstreamCombobox.Message>) =>
        Fruits.view(
          model,
          {
            anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
            items: ['Apple', 'Banana'],
            restingInputValue: '',
            itemToConfig: (fruit: string) => ({ content: h.span([], [fruit]) }),
            itemToValue: (fruit: string) => fruit,
            itemToDisplayText: (fruit: string) => fruit,
            buttonContent: h.span([], ['v']),
            maybeSelectedValue: Option.none(),
            toView: Combobox.toView([], { h }),
          },
          h,
        ),
    )
    const input = 'input[role="combobox"]'
    expect(attr(page, input, 'aria-expanded')).toBe('false')
    expect(attr(page, input, 'aria-autocomplete')).toBe('list')
    expect(attr(page, input, 'aria-haspopup')).toBe('listbox')
    expect(attr(page, input, 'autocomplete')).toBe('off')
    expect(page.querySelector('[role="listbox"]')).toBeNull()
  })

  test('a single segmented control is a radio group with one tab stop and its value for a form', async () => {
    const page = await parsed({}, (_model, h: HtmlBuilder<string>) =>
      Segmented.view(
        {
          id: 'v',
          label: 'View',
          name: 'view',
          pressed: ['b'],
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
          onPress: value => value,
        },
        h,
      ),
    )
    holds(
      Conformance.server('segmented', page, [
        { role: 'radiogroup', name: 'View' },
        { role: 'radio', name: 'A', attributes: { 'aria-checked': 'false', tabindex: '-1' } },
        { role: 'radio', name: 'B', attributes: { 'aria-checked': 'true', tabindex: '0' } },
      ]),
    )
    expect(attr(page, 'input[name="view"]', 'value')).toBe('b')
  })

  test('a multiple segmented control is a group of pressed buttons, each submitting when on', async () => {
    const page = await parsed({}, (_model, h: HtmlBuilder<string>) =>
      Segmented.view(
        {
          multiple: true,
          label: 'Format',
          name: 'format',
          pressed: ['a', 'b'],
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
            { value: 'c', label: 'C' },
          ],
          onPress: value => value,
        },
        h,
      ),
    )
    expect(attr(page, '[role="group"]', 'aria-label')).toBe('Format')
    const pressed = Array.from(page.querySelectorAll('button')).map(button =>
      button.getAttribute('aria-pressed'),
    )
    expect(pressed).toEqual(['true', 'true', 'false'])
    const submitted = Array.from(page.querySelectorAll('input[name="format"]')).map(input =>
      input.getAttribute('value'),
    )
    expect(submitted).toEqual(['a', 'b'])
  })

  test('a slider is labelled, described and named for a form, with its value', async () => {
    const page = await parsed({}, (_model, h: HtmlBuilder<string>) =>
      Slider.view(
        {
          id: 's',
          label: 'Volume',
          value: 30,
          onChange: () => 'changed',
          name: 'volume',
          description: 'Loudness',
        },
        h,
      ),
    )
    const input = 'input[type="range"]'
    expect(attr(page, input, 'name')).toBe('volume')
    expect(attr(page, input, 'value')).toBe('30')
    expect(pointsAt(page, input, 'aria-labelledby').textContent).toBe('Volume')
    expect(pointsAt(page, input, 'aria-describedby').textContent).toBe('Loudness')
  })

  test('a rating is a labelled radio group with one checked star, submitting under its name', async () => {
    const page = await parsed({}, (_model, h: HtmlBuilder<string>) =>
      Rating.view(
        {
          id: 'q',
          name: 'stars',
          label: 'Quality',
          value: Option.some(3),
          onChange: () => 'changed',
        },
        h,
      ),
    )
    expect(pointsAt(page, '[role="radiogroup"]', 'aria-labelledby').textContent).toBe('Quality')
    const radios = Array.from(page.querySelectorAll<HTMLInputElement>('input[name="stars"]'))
    expect(radios.map(radio => radio.getAttribute('aria-label'))).toEqual([
      '1 star',
      '2 stars',
      '3 stars',
      '4 stars',
      '5 stars',
    ])
    const checked = radios.filter(radio => radio.hasAttribute('checked')).map(radio => radio.value)
    expect(checked).toEqual(['3'])
  })
})
