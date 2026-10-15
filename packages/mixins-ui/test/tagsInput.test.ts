/**
 * TagsInput as a transition and as markup: a commit adds each new part of
 * the draft and refuses empty and repeated ones, Backspace on an empty
 * draft takes the last tag, a removal sends the focus back to the input,
 * and the chips are a list named by the field's label.
 */
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns, Recipes, TagsInput, TagsInputSlots } from '../src/index.js'
import { h, message } from './fixture.js'

const { Message, init, update } = TagsInput

const withDraft = (tags: ReadonlyArray<string>, draft: string) =>
  update(init({ id: 'topics', tags }), Message.Typed({ text: draft })).model

const style = Style.forSlots(TagsInputSlots)(Recipes.TagsInput({}))
const drawn = (tags: ReadonlyArray<string>, disabled = false) =>
  TagsInput.view(
    {
      model: init({ id: 'topics', tags }),
      onMessage: () => message('Clicked'),
      label: 'Topics',
      disabled,
      style,
    },
    h,
  )

describe('TagsInput.update', () => {
  it.each([
    ['adds the trimmed draft', ['a'], '  b ', ['a', 'b']],
    ['adds each part of a pasted list, in order', [], 'b, c,,d', ['b', 'c', 'd']],
    ['skips the parts already there, adding the rest', ['a'], 'a, b, b', ['a', 'b']],
  ] as const)('%s, and clears the draft', (_, tags, draft, after) => {
    const { model } = update(withDraft(tags, draft), Message.Committed())
    expect(model.tags).toEqual(after)
    expect(model.draft).toBe('')
  })

  it.each([
    ['an empty draft', '   '],
    ['a draft of tags already there', 'a, a'],
  ])('refuses %s, keeping it to be seen', (_, draft) => {
    const model = withDraft(['a'], draft)
    expect(update(model, Message.Committed()).model).toBe(model)
  })

  it('splits on its own delimiter', () => {
    const typed = update(init({ id: 'topics', delimiter: ';' }), Message.Typed({ text: 'a,b;c' }))
    expect(update(typed.model, Message.Committed()).model.tags).toEqual(['a,b', 'c'])
  })

  it('takes the last tag on Backspace only while the draft is empty', () => {
    const empty = withDraft(['a', 'b'], '')
    expect(update(empty, Message.Pressed({ key: 'Backspace' })).model.tags).toEqual(['a'])
    const typing = withDraft(['a', 'b'], 'c')
    expect(update(typing, Message.Pressed({ key: 'Backspace' })).model).toBe(typing)
    expect(update(empty, Message.Pressed({ key: 'x' })).model).toBe(empty)
    const none = init({ id: 'topics' })
    expect(update(none, Message.Pressed({ key: 'Backspace' })).model).toBe(none)
  })

  it('removes a tag by its text and sends the focus back to the input', () => {
    const model = init({ id: 'topics', tags: ['a', 'b', 'c'] })
    const result = update(model, Message.Removed({ tag: 'b' }))
    expect(result.model.tags).toEqual(['a', 'c'])
    expect((result.commands ?? []).map(command => command.name)).toEqual(['FocusInput'])
    const gone = update(model, Message.Removed({ tag: 'z' }))
    expect(gone.model).toBe(model)
    expect(gone.commands).toBeUndefined()
  })
})

describe('TagsInput.view', () => {
  it('meets the tags input pattern', () => {
    expect(A11y.validate(Patterns.TagsInput, TagsInputSlots)).toEqual([])
  })

  it('draws every element in a Slot', () => {
    expect(Inert.unslotted(drawn(['a', 'b']))).toEqual([])
  })

  it('draws the tags as a list the label names, each with a named remove button', () => {
    const tree = drawn(['react', 'effect'])
    const [label] = Inert.byTag(tree, 'label')
    const [list] = Inert.byTag(tree, 'ul')
    const [input] = Inert.byTag(tree, 'input')
    expect(Inert.value(label, 'for')).toBe(Inert.value(input, 'id'))
    expect(Inert.value(list, 'aria-labelledby')).toBe(Inert.value(label, 'id'))
    expect(Inert.byTag(tree, 'li').map(item => Inert.text(item))).toEqual(['react×', 'effect×'])
    expect(Inert.byTag(tree, 'button').map(button => Inert.value(button, 'aria-label'))).toEqual([
      'Remove react',
      'Remove effect',
    ])
  })

  it('draws no list while there are no tags', () => {
    expect(Inert.byTag(drawn([]), 'ul')).toEqual([])
  })

  it('takes no keys or presses while disabled', () => {
    const [input] = Inert.byTag(drawn(['a'], true), 'input')
    const [remove] = Inert.byTag(drawn(['a'], true), 'button')
    expect(Inert.value(input, 'disabled')).toBeDefined()
    expect(input?.data?.on?.['keydown']).toBeUndefined()
    expect(remove?.data?.on?.['click']).toBeUndefined()
    const [live] = Inert.byTag(drawn(['a']), 'input')
    expect(live?.data?.on?.['keydown']).toBeTypeOf('function')
  })
})
