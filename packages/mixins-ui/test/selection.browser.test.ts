/**
 * A control's words are not text to select, under `Defaults.reset`: a double tap or click
 * on a button selects nothing, where one on a paragraph beside it still selects a word.
 */
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  window.getSelection()?.removeAllRanges()
})

it('selects no word of a button, a tab or a menu row, and still one of a paragraph', async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(
    Layers.standard.declare,
    Layers.standard.in('reset', Defaults.reset),
  )
  document.head.append(sheet)
  document.body.innerHTML =
    '<p id="words">Plain words to read</p>' +
    '<button id="save">Save draft</button>' +
    '<div role="tab" id="tab" tabindex="0">Settings panel</div>' +
    '<div role="menuitem" id="row" tabindex="-1">Rename file</div>'
  const selected = () => window.getSelection()?.toString().trim() ?? ''
  for (const id of ['save', 'tab', 'row']) {
    await userEvent.dblClick(document.getElementById(id)!)
    expect([id, selected()]).toEqual([id, ''])
  }
  await userEvent.dblClick(document.getElementById('words')!)
  expect(selected()).not.toBe('')
})
