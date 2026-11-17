// @vitest-environment jsdom
/**
 * `X.configure`: a widget's look and message-free options given once, as a
 * base and named presets, and the call over both.
 */
import { describe, expect, it } from 'vitest'
import { Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Button, ButtonSlots, TagsInput } from '../src/index.js'
import { h, message } from './fixture.js'

const quiet = Style.forSlots(ButtonSlots)({ button: Style.class('quiet') })
const danger = Style.forSlots(ButtonSlots)({ button: Style.class('danger') })
const once = Style.forSlots(ButtonSlots)({ button: Style.class('once') })
const marked = Style.forSlots(ButtonSlots)({ button: Style.class('marked') })

const buttonOf = (html: ReturnType<typeof Button.view>) => {
  const [button] = Inert.byTag(html, 'button')
  return {
    classes: Inert.classes(button),
    type: Inert.value(button, 'type'),
  }
}

describe('Button.configure', () => {
  const App = Button.configure({
    base: { style: quiet, type: 'submit', mixins: [marked.mixin] },
    presets: { danger: { style: danger, type: 'button' }, plain: {} },
  })

  it('draws the base where the call names no preset', () => {
    expect(buttonOf(App.view({ label: 'Save' }, h))).toEqual({
      classes: ['quiet', 'marked'],
      type: 'submit',
    })
  })

  it('draws the named preset over the base, and the call over both', () => {
    expect(buttonOf(App.view({ label: 'Delete', preset: 'danger' }, h))).toEqual({
      classes: ['danger', 'marked'],
      type: 'button',
    })
    expect(
      buttonOf(App.view({ label: 'Delete', preset: 'danger', style: once, type: 'reset' }, h)),
    ).toEqual({ classes: ['once', 'marked'], type: 'reset' })
  })

  it('keeps the mixins of the base, the preset and the call, in that order', () => {
    const Both = Button.configure({
      base: { mixins: [quiet.mixin] },
      presets: { danger: { mixins: [danger.mixin] } },
    })
    expect(
      buttonOf(Both.view({ label: 'Go', preset: 'danger', mixins: [once.mixin] }, h)).classes,
    ).toEqual(['quiet', 'danger', 'once'])
  })

  it('is the plain view when nothing is configured', () => {
    expect(buttonOf(Button.configure({}).view({ label: 'Go', style: once }, h))).toEqual(
      buttonOf(Button.view({ label: 'Go', style: once }, h)),
    )
  })

  it('still sends the call’s Message', () => {
    const [button] = Inert.byTag(
      App.view({ label: 'Go', onClick: message('Clicked') }, h),
      'button',
    )
    expect(button?.data?.on?.['click']).toBeDefined()
    const [idle] = Inert.byTag(App.view({ label: 'Go' }, h), 'button')
    expect(idle?.data?.on?.['click']).toBeUndefined()
  })
})

describe('TagsInput.configure', () => {
  const model = TagsInput.init({ id: 'topics', tags: ['a'] })
  const App = TagsInput.configure({
    base: { placeholder: 'Add a topic', words: { mark: '✕' } },
    presets: { french: { words: { remove: tag => `Retirer ${tag}` } } },
  })
  const drawn = (options: {
    readonly preset?: 'french'
    readonly words?: TagsInput.TagsInputWords
    readonly placeholder?: string
  }) => App.view({ model, onMessage: () => message('Clicked'), label: 'Topics', ...options }, h)
  const remove = (html: ReturnType<typeof drawn>) => {
    const [button] = Inert.byTag(html, 'button')
    return [Inert.value(button, 'aria-label'), Inert.text(button)]
  }
  const placeholder = (html: ReturnType<typeof drawn>) =>
    Inert.value(
      Inert.byTag(html, 'input').find(input => Inert.value(input, 'type') !== 'hidden'),
      'placeholder',
    )

  it('merges words word by word across the base, the preset and the call', () => {
    expect(remove(drawn({}))).toEqual(['Remove a', '✕'])
    expect(remove(drawn({ preset: 'french' }))).toEqual(['Retirer a', '✕'])
    expect(remove(drawn({ preset: 'french', words: { mark: 'x' } }))).toEqual(['Retirer a', 'x'])
  })

  it('takes an option from the base until the call gives it', () => {
    expect(placeholder(drawn({}))).toBe('Add a topic')
    expect(placeholder(drawn({ placeholder: 'Topic' }))).toBe('Topic')
  })
})
