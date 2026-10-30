// @vitest-environment jsdom
/**
 * #356: the browser reads a kept field's marker as untrusted input. A marker
 * the server would never write refuses the page; a field the person did not
 * change sends nothing; a `select` counts as changed only off the option the
 * server selected.
 */
import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { KEEP_ATTRIBUTE, type DecodedBinding } from 'foldkit-ssr'
import { changed, keptFields, typedMessages } from '../src/keep.js'

const typing: DecodedBinding = {
  attribute: 'OnInput',
  event: 'input',
  message: { _tag: 'Typed', text: '' },
  hole: ['text'],
}
const keys: DecodedBinding = {
  attribute: 'OnKeyDown',
  event: 'keydown',
  message: { _tag: 'Pressed', key: '', modifiers: {} },
  hole: ['key', 'modifiers'],
}
const bindings = [typing, keys]

/** A root holding `markup`, parsed as a served page would be. */
const rootOf = (markup: string): Element => {
  const root = document.createElement('main')
  root.innerHTML = markup
  return root
}

describe('a kept field marker', () => {
  it.each([
    { marker: '', why: 'empty, which Number reads as binding 0' },
    { marker: 'x', why: 'not an ordinal' },
    { marker: '0 ', why: 'padded, which Number reads as 0' },
    { marker: '7', why: 'past the bindings' },
    { marker: '1', why: 'a key binding' },
  ])('refuses one that is $why', ({ marker }) => {
    const read = keptFields(rootOf(`<input ${KEEP_ATTRIBUTE}="${marker}">`), bindings)
    expect(Result.isFailure(read) && read.failure).toContain('names no input or change binding')
  })

  it('refuses one on an element that is no field', () => {
    const read = keptFields(rootOf(`<div ${KEEP_ATTRIBUTE}="0"></div>`), bindings)
    expect(Result.isFailure(read) && read.failure).toContain('is on a div, not a field')
  })

  it('replays a changed field into the hole, and nothing for an unchanged one', () => {
    const root = rootOf(
      `<input id="a" value="x" ${KEEP_ATTRIBUTE}="0"><textarea id="b" ${KEEP_ATTRIBUTE}="0">y</textarea>`,
    )
    const read = keptFields(root, bindings)
    if (Result.isFailure(read)) throw new Error(read.failure)
    const [a] = read.success
    if (!(a?.element instanceof HTMLInputElement)) throw new Error('#a is not the first field')
    a.element.value = 'xyz'
    expect(typedMessages(read.success)).toEqual([{ _tag: 'Typed', text: 'xyz' }])
  })

  it.each([
    { markup: '<option>s</option><option selected>m</option>', chosen: 'm', unchanged: true },
    { markup: '<option>s</option><option selected>m</option>', chosen: 's', unchanged: false },
    // The parser leaves the last `selected` option chosen.
    {
      markup: '<option selected>s</option><option selected>m</option>',
      chosen: 'm',
      unchanged: true,
    },
    // With none marked, the first enabled option is the default.
    { markup: '<option disabled>s</option><option>m</option>', chosen: 'm', unchanged: true },
  ])('reads a select at $chosen as unchanged: $unchanged', ({ markup, chosen, unchanged }) => {
    const read = keptFields(rootOf(`<select ${KEEP_ATTRIBUTE}="0">${markup}</select>`), bindings)
    if (Result.isFailure(read)) throw new Error(read.failure)
    const [field] = read.success
    if (!(field?.element instanceof HTMLSelectElement)) throw new Error('no select')
    field.element.value = chosen
    expect(changed(field)).toBe(!unchanged)
  })
})
