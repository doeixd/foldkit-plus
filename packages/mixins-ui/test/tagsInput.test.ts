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
import { A11y, Behaviors, Style, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns, Recipes, TagsInput, TagsInputSlots } from '../src/index.js'
import { h, message, sends, type TestMessage } from './fixture.js'

const { Message, Refusal, init, update } = TagsInput

const withDraft = (tags: ReadonlyArray<string>, draft: string) =>
  update(init({ id: 'topics', tags }), Message.Typed({ text: draft, drawn: 0 })).model

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

  it('reads past the drafts added since the drawing a text came from', () => {
    const added = update(withDraft([], 'react'), Message.Committed()).model
    // The input drawn before the commit still holds the added draft.
    const early = update(added, Message.Typed({ text: 'reactreac', drawn: 0 })).model
    expect(early.draft).toBe('reac')
    // A frame then draws the draft alone, which starts like the added tag.
    const drawn = update(early, Message.Typed({ text: 'react', drawn: 1 })).model
    expect(drawn.draft).toBe('react')
    expect(drawn.added).toEqual([])
  })

  it('reads past each commit a text came after, and only those', () => {
    const one = update(
      update(withDraft([], 'a'), Message.Committed()).model,
      Message.Typed({ text: 'ab', drawn: 0 }),
    )
    const two = update(one.model, Message.Committed()).model
    expect(two.tags).toEqual(['a', 'b'])
    expect(update(two, Message.Typed({ text: 'abc', drawn: 0 })).model.draft).toBe('c')
    // Drawn between the commits, the input held the second draft alone.
    expect(update(two, Message.Typed({ text: 'bc', drawn: 1 })).model.draft).toBe('c')
  })

  it('counts no refused commit, which leaves the input as it was', () => {
    const added = update(withDraft([], 'a'), Message.Committed()).model
    const typed = update(added, Message.Typed({ text: 'aa', drawn: 0 })).model
    // A frame draws the draft `a` here; the commit after it is refused.
    const refused = update(typed, Message.Committed()).model
    expect(refused.tags).toEqual(['a'])
    expect(update(refused, Message.Typed({ text: 'ab', drawn: 1 })).model.draft).toBe('ab')
  })

  it('takes nothing on Enter in an empty field', () => {
    const model = init({ id: 'topics', tags: ['a'] })
    expect(update(model, Message.Committed()).model).toBe(model)
  })

  it('adds up to max, and refuses the rest as full', () => {
    const typed = update(
      init({ id: 'topics', tags: ['a'], max: 3 }),
      Message.Typed({ text: 'b, c, d', drawn: 0 }),
    )
    const after = update(typed.model, Message.Committed()).model
    expect(after.tags).toEqual(['a', 'b', 'c'])
    expect(after.refusal).toEqual(Option.some(Refusal.Full({ max: 3 })))
    const full = update(
      update(after, Message.Typed({ text: 'e', drawn: 0 })).model,
      Message.Committed(),
    )
    expect(full.model.tags).toEqual(['a', 'b', 'c'])
    expect(full.model.draft).toBe('e')
    expect(full.model.refusals).toBe(2)
  })

  it.each([
    ['an edit of the draft', Message.Typed({ text: 'c', drawn: 0 })],
    ['a removal', Message.Removed({ tag: 'a' })],
  ])('forgets the refusal on %s', (_, message) => {
    const refused = update(withDraft(['a'], 'a'), Message.Committed()).model
    expect(update(refused, message).model.refusal).toEqual(Option.none())
  })

  it('splits on its own delimiter', () => {
    const typed = update(
      init({ id: 'topics', delimiter: ';' }),
      Message.Typed({ text: 'a,b;c', drawn: 0 }),
    )
    expect(update(typed.model, Message.Committed()).model.tags).toEqual(['a,b', 'c'])
  })

  it('takes the last tag on Backspace only while the draft is empty', () => {
    const empty = withDraft(['a', 'b'], '')
    expect(update(empty, Message.BackspacedEmpty()).model.tags).toEqual(['a'])
    const typing = withDraft(['a', 'b'], 'c')
    expect(update(typing, Message.BackspacedEmpty()).model).toBe(typing)
    const none = init({ id: 'topics' })
    expect(update(none, Message.BackspacedEmpty()).model).toBe(none)
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

  const plain = (h: HtmlBuilder<TagsInput.Message>) =>
    TagsInput.view({ model: init({ id: 'topics' }), onMessage: m => m, label: 'Topics' }, h)

  it.each(['Enter', ','])('commits on %s', key => {
    sends(
      plain,
      Scene.keydown(Scene.label('Topics'), key),
      Scene.expectOutMessage(Message.Committed()),
    )
  })

  it('reports the text typed', () => {
    sends(
      plain,
      Scene.type(Scene.label('Topics'), 'react'),
      Scene.expectOutMessage(Message.Typed({ text: 'react', drawn: 0 })),
    )
  })

  describe('routes of the application', () => {
    type Outer = TagsInput.Message | { readonly _tag: 'Down' }
    const routeOn = (key: 'ArrowDown' | 'Enter') =>
      Behaviors.Keys.route<TagsInput.Model, Outer>(key, {
        on: [Behaviors.Keys.chord(key)],
        handle: () => Option.some({ _tag: 'Down' }),
      })
    const withRoutes = (routes: ReadonlyArray<TagsInput.Route<Outer>>) => (h: HtmlBuilder<Outer>) =>
      TagsInput.view(
        { model: init({ id: 'topics' }), onMessage: m => m, label: 'Topics', routes },
        h,
      )

    it('answer beside the keys of the field', () => {
      sends(
        withRoutes([routeOn('ArrowDown')]),
        Scene.keydown(Scene.label('Topics'), 'ArrowDown'),
        Scene.expectOutMessage({ _tag: 'Down' }),
      )
      sends(
        withRoutes([routeOn('ArrowDown')]),
        Scene.keydown(Scene.label('Topics'), 'Enter'),
        Scene.expectOutMessage(Message.Committed()),
      )
    })

    it('may not take a key the field takes', () => {
      expect(() =>
        TagsInput.view(
          {
            model: init({ id: 'topics' }),
            onMessage: m => m,
            label: 'Topics',
            routes: [routeOn('Enter')],
          },
          SlotView.inertBuilder<Outer>(),
        ),
      ).toThrow(/Enter/)
    })
  })

  describe('chips by keyboard', () => {
    const three = init({ id: 'topics', tags: ['a', 'b', 'c'] })
    const chips =
      (direction: 'ltr' | 'rtl' = 'ltr') =>
      (h: HtmlBuilder<TagsInput.Message>) =>
        TagsInput.view({ model: three, onMessage: m => m, label: 'Topics', direction }, h)
    const moved = (tag: string) => Message.FocusMoved({ chip: Option.some(tag) })

    it('holds one tab stop, the chip last moved to, else the last', () => {
      const stops = (model: TagsInput.Model) =>
        Inert.byTag(
          TagsInput.view({ model, onMessage: () => message('Clicked'), label: 'Topics' }, h),
          'button',
        ).map(button => Inert.value(button, 'tabindex'))
      expect(stops(three)).toEqual([-1, -1, 0])
      expect(stops(update(three, moved('a')).model)).toEqual([0, -1, -1])
      const gone = update(update(three, moved('a')).model, Message.Removed({ tag: 'a' })).model
      expect(stops(gone)).toEqual([-1, 0])
    })

    it('records where focus went, and is no change when it is there already', () => {
      expect(update(three, moved('b')).model.chip).toEqual(Option.some('b'))
      const there = update(three, moved('b')).model
      expect(update(there, moved('b')).model).toBe(there)
      expect(update(there, Message.FocusMoved({ chip: Option.none() })).model.chip).toEqual(
        Option.none(),
      )
    })

    it.each([
      ['ltr', 'b', 'ArrowLeft', moved('a')],
      ['ltr', 'b', 'ArrowRight', moved('c')],
      ['ltr', 'a', 'ArrowLeft', moved('a')],
      ['ltr', 'c', 'ArrowRight', Message.FocusMoved({ chip: Option.none() })],
      ['ltr', 'c', 'Home', moved('a')],
      ['ltr', 'a', 'End', moved('c')],
      ['rtl', 'b', 'ArrowLeft', moved('c')],
      ['rtl', 'b', 'ArrowRight', moved('a')],
      ['rtl', 'c', 'ArrowLeft', Message.FocusMoved({ chip: Option.none() })],
      ['ltr', 'b', 'Backspace', Message.Removed({ tag: 'b' })],
      ['ltr', 'b', 'Delete', Message.Removed({ tag: 'b' })],
    ] as const)(
      '%s: a key on chip %s, %s, sends the move or removal',
      (direction, tag, key, sent) => {
        sends(
          chips(direction),
          Scene.keydown(Scene.label(`Remove ${tag}`), key),
          Scene.expectOutMessage(sent),
        )
      },
    )

    it.each([
      ['ltr', 'ArrowLeft'],
      ['rtl', 'ArrowRight'],
    ] as const)('%s: %s in an empty input moves to the last chip', (direction, key) => {
      sends(
        chips(direction),
        Scene.keydown(Scene.label('Topics'), key),
        Scene.expectOutMessage(moved('c')),
      )
    })

    it('takes no keys on a chip while disabled', () => {
      const [remove] = Inert.byTag(drawn(['a'], true), 'button')
      expect(remove?.data?.on?.['keydown']).toBeUndefined()
    })
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
