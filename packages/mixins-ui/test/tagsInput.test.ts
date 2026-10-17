// @vitest-environment jsdom
/**
 * TagsInput as a transition and as markup: a commit adds each new part of
 * the draft and refuses empty and repeated ones and those past `max`, saying
 * why until the next edit, Backspace on an empty draft takes the last tag, a
 * removal sends the focus back to the input, and the chips are a list named
 * by the field's label.
 */
import { Effect, Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, Style, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns, Recipes, TagsInput, TagsInputSlots } from '../src/index.js'
import { h, message, sends, type TestMessage } from './fixture.js'

const { Message, Refusal, init, update } = TagsInput

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

// Drawn through `Inert.draw`, which alone marks the Slots that `unslotted` reads.
const Drawn = SlotView.forMessages<TestMessage>().define(
  TagsInputSlots,
  (tags: ReadonlyArray<string>, _, h) =>
    TagsInput.view(
      {
        model: init({ id: 'topics', tags }),
        onMessage: () => message('Clicked'),
        label: 'Topics',
        style,
      },
      h,
    ),
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
    ['a draft of blanks', ' , ', Refusal.Empty()],
    ['a draft of tags already there', 'b, a', Refusal.Repeat({ tag: 'b' })],
  ])('refuses %s, keeping it to be seen and saying why', (_, draft, refusal) => {
    const model = withDraft(['a', 'b'], draft)
    const after = update(model, Message.Committed()).model
    expect(after.tags).toBe(model.tags)
    expect(after.draft).toBe(draft)
    expect(after.refusal).toEqual(Option.some(refusal))
    expect(after.refusals).toBe(1)
  })

  it('adds the new parts of a draft and names the repeat it left out', () => {
    const after = update(withDraft(['a'], 'b, a, c'), Message.Committed()).model
    expect(after.tags).toEqual(['a', 'b', 'c'])
    expect(after.draft).toBe('')
    expect(after.refusal).toEqual(Option.some(Refusal.Repeat({ tag: 'a' })))
  })

  it('reads keys typed before the emptied input is drawn as the next draft alone', () => {
    const added = update(withDraft([], 'react'), Message.Committed()).model
    // The input still showed the added draft when these keys landed.
    const early = update(added, Message.Typed({ text: 'reactvu' })).model
    expect(early.draft).toBe('vu')
    // Once a text arrives without it, the input was drawn empty: a retyped tag is a tag.
    const drawn = update(added, Message.Typed({ text: 'r' })).model
    expect(drawn.draft).toBe('r')
    expect(update(drawn, Message.Typed({ text: 'react' })).model.draft).toBe('react')
  })

  it('takes nothing on Enter in an empty field', () => {
    const model = init({ id: 'topics', tags: ['a'] })
    expect(update(model, Message.Committed()).model).toBe(model)
  })

  it('adds up to max, and refuses the rest as full', () => {
    const typed = update(
      init({ id: 'topics', tags: ['a'], max: 3 }),
      Message.Typed({ text: 'b, c, d' }),
    )
    const after = update(typed.model, Message.Committed()).model
    expect(after.tags).toEqual(['a', 'b', 'c'])
    expect(after.refusal).toEqual(Option.some(Refusal.Full({ max: 3 })))
    const full = update(update(after, Message.Typed({ text: 'e' })).model, Message.Committed())
    expect(full.model.tags).toEqual(['a', 'b', 'c'])
    expect(full.model.draft).toBe('e')
    expect(full.model.refusals).toBe(2)
  })

  it.each([
    ['an edit of the draft', Message.Typed({ text: 'c' })],
    ['a removal', Message.Removed({ tag: 'a' })],
  ])('forgets the refusal on %s', (_, message) => {
    const refused = update(withDraft(['a'], 'a'), Message.Committed()).model
    expect(update(refused, message).model.refusal).toEqual(Option.none())
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

  it("focuses the field's own input once a tag is removed", async () => {
    document.body.innerHTML = '<input id="topics"><input id="topics-input">'
    const [command] = update(
      init({ id: 'topics', tags: ['a'] }),
      Message.Removed({ tag: 'a' }),
    ).commands!
    await Effect.runPromise(command!.effect)
    expect(document.activeElement?.id).toBe('topics-input')
    document.body.replaceChildren()
  })
})

describe('TagsInput.view', () => {
  it('meets the tags input pattern', () => {
    expect(A11y.validate(Patterns.TagsInput, TagsInputSlots)).toEqual([])
  })

  it('draws every element in a Slot', () => {
    expect(Inert.unslotted(Inert.draw(Drawn, ['a', 'b']))).toEqual([])
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

  it('commits on Enter and on the delimiter, and passes every key on', () => {
    const view = (h: HtmlBuilder<TagsInput.Message>) =>
      TagsInput.view({ model: init({ id: 'topics' }), onMessage: m => m, label: 'Topics' }, h)
    sends(
      view,
      Scene.keydown(Scene.label('Topics'), 'Enter'),
      Scene.expectOutMessages(Message.Committed(), Message.Pressed({ key: 'Enter' })),
      Scene.keydown(Scene.label('Topics'), ','),
      Scene.expectOutMessages(Message.Committed(), Message.Pressed({ key: ',' })),
      Scene.keydown(Scene.label('Topics'), 'a'),
      Scene.expectOutMessage(Message.Pressed({ key: 'a' })),
      Scene.type(Scene.label('Topics'), 'react'),
      Scene.expectOutMessage(Message.Typed({ text: 'react' })),
    )
  })

  it('removes the tag whose button is pressed', () => {
    const lifted: Array<TagsInput.Message> = []
    TagsInput.view(
      {
        model: init({ id: 'topics', tags: ['react', 'effect'] }),
        onMessage: m => {
          lifted.push(m)
          return message('Clicked')
        },
        label: 'Topics',
      },
      h,
    )
    expect(lifted.filter(m => m._tag === 'Removed')).toEqual([
      Message.Removed({ tag: 'react' }),
      Message.Removed({ tag: 'effect' }),
    ])
  })

  it('says why a commit was refused in a status region drawn always, which the input points at', () => {
    const quiet = drawn(['a'])
    expect(Inert.byRole(quiet, 'status').map(Inert.text)).toEqual([''])
    expect(Inert.value(Inert.byTag(quiet, 'input')[0], 'aria-describedby')).toBeUndefined()
    const refused = update(withDraft(['a'], 'a'), Message.Committed()).model
    const tree = TagsInput.view(
      { model: refused, onMessage: () => message('Clicked'), label: 'Topics', style },
      h,
    )
    const [status] = Inert.byRole(tree, 'status')
    expect(Inert.text(status)).toBe('a is already added')
    expect(Inert.value(Inert.byTag(tree, 'input')[0], 'aria-describedby')).toBe(
      Inert.value(status, 'id'),
    )
  })

  it('alternates the shake with each refusal, so a second one replays it', () => {
    const control = (model: TagsInput.Model) =>
      Inert.value(
        Inert.byTag(
          TagsInput.view({ model, onMessage: () => message('Clicked'), label: 'Topics' }, h),
          'div',
        )[1],
        'data-refused',
      )
    const once = update(withDraft(['a'], 'a'), Message.Committed()).model
    const twice = update(once, Message.Committed()).model
    expect([control(withDraft(['a'], 'a')), control(once), control(twice)]).toEqual([
      undefined,
      'odd',
      'even',
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
