/**
 * The combobox drawing places an adapter's own parts: what goes before and
 * after the input in its field, and after its panel, before its form inputs.
 */
import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import type { Html } from 'foldkit/html'
import { drawCombobox } from '../src/popupView.js'
import { h } from './fixture.js'

const mark = (name: string) => h.span([h.Id(name)], [])

describe('drawCombobox', () => {
  it('places the parts it is given in the field and after the panel', () => {
    const drawn = drawCombobox(
      {
        wrapper: [],
        inputWrapper: [],
        input: [],
        toggleButton: { key: 'toggle', attributes: [h.Id('toggle')], content: mark('arrow') },
        hiddenInputs: [mark('form')],
        backdrop: undefined,
        items: { key: 'items', attributes: [h.Id('panel')] },
        scroll: undefined,
        groups: [],
        beforeInput: [mark('chips')],
        afterInput: [mark('clear')],
        afterPanel: [mark('empty')],
      },
      h,
    )
    const ids = (node: Html | undefined) =>
      Inert.children(node).map(child => Inert.value(child, 'id') ?? child.sel)
    const [field] = Inert.children(drawn)
    expect(ids(field)).toEqual(['chips', 'input', 'clear', 'toggle'])
    expect(ids(drawn).slice(1)).toEqual(['panel', 'empty', 'form'])
  })
})
