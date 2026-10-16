/**
 * Pagination in a real browser: on a narrow window the default `compact`
 * keeps the current stop and its total ("5 / 10") and hides the other
 * numbers, a wide one shows every stop and no total, and the page-size
 * select chooses how many rows a page shows.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { Pagination, PaginationSlots, Recipes } from '../src/index.js'

const style = Style.forSlots(PaginationSlots)(Recipes.Pagination({}))
const Model = Schema.Struct({ page: Schema.Number, perPage: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Went: { page: Schema.Number },
  Sized: { perPage: Schema.Number },
})
type Message = typeof Message.Type

afterEach(async () => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  await page.viewport(1440, 900)
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(Theme.tokens)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'pagination-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { page: 5, perPage: 10 } }),
      update: (model: Model, message: Message) => ({
        model: Message.match(message, {
          Went: ({ page }) => modifyFields(model, { page: () => page }),
          Sized: ({ perPage }) => modifyFields(model, { perPage: () => perPage, page: () => 1 }),
        }),
      }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        Pagination.view(
          {
            page: model.page,
            pageCount: Math.ceil(97 / model.perPage),
            onPage: page => Message.Went({ page }),
            range: {
              total: 97,
              perPage: model.perPage,
              choose: { sizes: [10, 20, 50], onPerPage: perPage => Message.Sized({ perPage }) },
            },
            style,
          },
          h,
        ),
    }),
  )
}

/** The words of every stop that is drawn, as they show. */
const shownStops = () =>
  Array.from(document.querySelectorAll<HTMLElement>('button'))
    .filter(button => button.getBoundingClientRect().width > 0)
    .map(button => button.innerText.replace(/\s+/g, ' ').trim())

test('a narrow window shows the current stop with its total, and no other number', async () => {
  await page.viewport(390, 800)
  const handle = mount()
  try {
    await vi.waitFor(() => expect(shownStops()).toEqual(['Previous', '5 / 10', 'Next']))
  } finally {
    handle.dispose()
  }
})

test('a wide window shows every stop of the window, and no total', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() =>
      expect(shownStops()).toEqual(['Previous', '1', '4', '5', '6', '10', 'Next']),
    )
  } finally {
    handle.dispose()
  }
})

test('the page-size select shows the rows a page holds, and chooses another', async () => {
  const handle = mount()
  try {
    const select = await vi.waitFor(() => {
      const found = document.querySelector('select')
      expect(found).not.toBeNull()
      return found!
    })
    expect(select.value).toBe('10')
    expect(select.closest('label')?.textContent).toContain('Rows per page')
    await userEvent.selectOptions(select, '20')
    await vi.waitFor(() => expect(document.body.textContent).toContain('1–20 of 97'))
    expect(shownStops()).toEqual(['Previous', '1', '2', '3', '4', '5', 'Next'])
  } finally {
    handle.dispose()
  }
})
