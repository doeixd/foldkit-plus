// @vitest-environment jsdom
/**
 * `X.configure`: a widget's look and message-free options given once, as a
 * base and named presets, and the call over both.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Button, ButtonSlots, FileUpload, FileUploadSlots, TagsInput } from '../src/index.js'
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

describe('FileUpload.configure', () => {
  const zone = Style.forSlots(FileUploadSlots)({ root: Style.class('zone') })
  const model = FileUpload.update(
    FileUpload.init({ id: 'up', multiple: true }),
    FileUpload.Message.Offered({ files: [new File(['x'], 'a.txt')], by: 'drop' }),
  ).model
  const App = FileUpload.configure({
    base: { style: zone, words: { prompt: 'Drop files here or', remove: 'Retirer {name}' } },
    presets: { plain: { words: { prompt: '' } } },
  })
  const field = { model, onMessage: () => message('Clicked'), label: 'browse' }
  const spans = (html: ReturnType<typeof App.view>) =>
    Inert.byTag(Inert.byTag(html, 'label')[0]!, 'span').map(span => Inert.text(span))
  const names = (html: ReturnType<typeof App.view>) =>
    Inert.byTag(html, 'button').map(button => Inert.value(button, 'aria-label'))

  it('draws the base’s style and words, a preset’s words over them and the call’s over both', () => {
    const base = App.view(field, h)
    expect(Inert.classes(Inert.byTag(base, 'div')[0])).toEqual(['zone'])
    expect(spans(base)).toEqual(['Drop files here or', 'browse'])
    expect(names(base)).toContain('Retirer a.txt')
    const plain = App.view({ ...field, preset: 'plain' }, h)
    expect(spans(plain)).toEqual(['browse'])
    expect(names(plain)).toContain('Retirer a.txt')
    expect(names(App.view({ ...field, words: { remove: 'Drop {name}' } }, h))).toContain(
      'Drop a.txt',
    )
  })

  it('binds `parts` as it binds `view`', () => {
    const { picker, items } = App.parts(field, h)
    expect(spans(Option.getOrThrow(picker))).toEqual(['Drop files here or', 'browse'])
    expect(names(Option.getOrThrow(items[0]!.actions))).toEqual(['Retirer a.txt'])
  })
})
