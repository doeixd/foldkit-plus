/**
 * VirtualList over `@foldkit/ui`'s: once the box is measured only the rows
 * in view and the overscan are drawn, each in its `row` slot inside `root`,
 * with the row heights the options chose.
 */
import * as UiVirtualList from '@foldkit/ui/virtualList'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns, VirtualList, VirtualListSlots } from '../src/index.js'

const style = Style.forSlots(VirtualListSlots)({
  root: Style.class('list-box'),
  row: Style.class('list-row'),
})
const items = Array.from({ length: 1000 }, (_, index) => `Item ${index}`)

/** The rows drawn in a 100px box of 20px rows, after `options`. */
const rows = (options: { readonly overscan?: number } & UiVirtualList.RowHeightInputs<string>) => {
  let drawn: ReadonlyArray<string> = []
  let inRoot = false
  Scene.scene<UiVirtualList.Model, UiVirtualList.Message>(
    {
      update: (model, message) => UiVirtualList.update(model, message),
      view: (model, h) =>
        VirtualList.view<string, UiVirtualList.Message>(
          {
            model,
            items,
            itemToKey: item => item,
            itemToView: item => h.span([], [item]),
            onMessage: message => message,
            style,
            ...options,
          },
          h,
        ),
    },
    Scene.given(UiVirtualList.init({ id: 'items', rowHeightPx: 20 })),
    Scene.Mount.resolve(
      // Upstream does not export its Mount; a matcher by name stands for it.
      { name: 'ObserveVirtualList' },
      UiVirtualList.Message.ResizedContainer({ containerWidth: 300, containerHeight: 100 }),
    ),
    Scene.tap(({ html }) => {
      inRoot = Inert.classes(html).includes('list-box')
      drawn = Inert.all(html)
        .filter(node => Inert.classes(node).includes('list-row'))
        .map(row => Inert.text(row))
    }),
  )
  return { drawn, inRoot }
}

describe('VirtualList.view', () => {
  it('meets the virtual list pattern', () => {
    expect(A11y.validate(Patterns.VirtualList, VirtualListSlots)).toEqual([])
  })

  it('draws the rows in view, each in its row slot, inside the root slot', () => {
    const { drawn, inRoot } = rows({ overscan: 0 })
    expect(inRoot).toBe(true)
    expect(drawn).toEqual(['Item 0', 'Item 1', 'Item 2', 'Item 3', 'Item 4'])
  })

  it('draws the overscan beyond the view', () => {
    expect(rows({ overscan: 2 }).drawn).toHaveLength(7)
  })

  it("sizes the rows by the item's own height when it gives one", () => {
    expect(rows({ overscan: 0, itemToRowHeightPx: () => 50 }).drawn).toEqual(['Item 0', 'Item 1'])
  })

  it('sizes unmeasured rows by their estimate when the heights are dynamic', () => {
    const estimated = rows({
      overscan: 0,
      dynamicRowHeights: true,
      itemToEstimatedRowHeightPx: () => 50,
    })
    expect(estimated.drawn).toEqual(['Item 0', 'Item 1'])
  })
})
