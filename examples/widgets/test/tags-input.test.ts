// @vitest-environment jsdom

import { Option } from 'effect'
import { Command } from 'foldkit/scene'
import { Scene } from 'foldkit/test'
import { TagsInput } from 'foldkit-mixins-ui'
import { describe, expect, it, test } from 'vitest'
import { FORM, Message, RECEIPT, ReadSubmission, initial, update } from '../src/tags-input/app.js'
import { island } from '../src/tags-input/island.js'
import { TagsForm } from '../src/tags-input/view.js'

const got = (message: TagsInput.Message) => Message.GotTopics({ message })
const typed = (text: string) => got(TagsInput.Message.Typed({ text, drawn: 0 }))

// A Command carries its Effect, which `toEqual` cannot compare: read what it was asked.
const asked = (commands: ReturnType<typeof update>['commands']) =>
  (commands ?? []).map(command => [command.name, command.args])

const added = update(
  update(initial, typed('tags, form')).model,
  got(TagsInput.Message.Committed()),
).model

describe('update', () => {
  it('commits the draft split at the comma into tags', () => {
    expect(added.topics.tags).toEqual(['foldkit', 'effect', 'tags', 'form'])
    expect(added.topics.draft).toBe('')
  })

  it('a refused commit changes the field and not the tags', () => {
    const typedRepeat = update(initial, typed('effect')).model
    const refused = update(typedRepeat, got(TagsInput.Message.Committed())).model
    expect(refused.topics.tags).toBe(initial.topics.tags)
    expect(Option.isSome(refused.topics.refusal)).toBe(true)
  })

  it('a Message that changes nothing returns the Model it was given', () => {
    expect(update(initial, got(TagsInput.Message.Committed())).model).toBe(initial)
    expect(update(initial, got(TagsInput.Message.Removed({ tag: 'absent' }))).model).toBe(initial)
  })

  it('removing a chip moves focus, as a Command of the field lifted into the application', () => {
    const result = update(initial, got(TagsInput.Message.Removed({ tag: 'foldkit' })))
    expect(result.model.topics.tags).toEqual(['effect'])
    expect(asked(result.commands).map(([name]) => name)).toEqual(['Focus'])
  })

  it('a change to the tags drops the receipt, typing does not', () => {
    const receipt = update(added, Message.GotSubmission({ tags: ['a'] })).model
    expect(receipt.receipt).toEqual(Option.some(['a']))
    expect(update(receipt, typed('draft')).model.receipt).toEqual(Option.some(['a']))
    expect(update(receipt, got(TagsInput.Message.Removed({ tag: 'form' }))).model.receipt).toEqual(
      Option.none(),
    )
  })

  it('a submit reads the form', () => {
    const result = update(added, Message.Submitted())
    expect(result.model).toBe(added)
    expect(asked(result.commands)).toEqual([['ReadSubmission', { form: FORM }]])
  })
})

test('one hidden input per tag draws under the field name, and the draft has none', () => {
  Scene.scene(
    { update, view: TagsForm },
    Scene.given(update(initial, typed('half-typed')).model),
    Scene.expectAll(Scene.all.selector('input[type="hidden"][name="topics"]')).toHaveCount(2),
  )
})

test('a submit shows the tags the form held, with a status region standing ready before it', () => {
  Scene.scene(
    { update, view: TagsForm },
    Scene.given(initial),
    Scene.expect(Scene.selector(`#${RECEIPT}`)).toExist(),
    Scene.submit(Scene.selector(`#${FORM}`)),
    Command.resolve(ReadSubmission, Message.GotSubmission({ tags: ['foldkit', 'effect'] })),
    Scene.expect(Scene.selector(`#${RECEIPT}`)).toHaveText('Submitted foldkit, effect'),
  )
})

test('the trace tells the same story', () => {
  expect(island.runDemo()).toEqual([
    'typed "tags, form": tags=[foldkit, effect] draft="tags, form"',
    'pressed Enter: tags=[foldkit, effect, tags, form] draft=""',
    'removed effect: tags=[foldkit, tags, form] draft=""',
  ])
})
