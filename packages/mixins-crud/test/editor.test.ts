// @vitest-environment jsdom
/**
 * `EditorView`, `ConfirmView` and `Toolbar`: what each state of an editor and
 * a remover draws, which buttons send which Messages, and that a server's
 * markup of an open editor carries its form's names.
 */
import { Effect, Option, Schema } from 'effect'
import type { EditorStatus, RemoverStatus } from 'foldkit-crud'
import { Form } from 'foldkit-form'
import { SlotView } from 'foldkit-mixins'
import { FormView } from 'foldkit-mixins-form'
import { Inert } from 'foldkit-mixins/testing'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { ConfirmView, EditorView, Toolbar } from '../src/index.js'

type Message =
  | { readonly _tag: 'Closed' }
  | { readonly _tag: 'Retried' }
  | { readonly _tag: 'Yes' }
  | { readonly _tag: 'No' }
const Editor = EditorView.forMessages<Message>().define()
const Confirm = ConfirmView.forMessages<Message>().define()
const Bar = Toolbar.forMessages<Message>().define()
const h = SlotView.inertBuilder<Message>()
const form = h.form([h.Id('the-form')], [])

const drawn = (status: EditorStatus, extra: Partial<Parameters<typeof Editor>[0]> = {}): Html =>
  Editor(
    {
      id: 'post',
      status,
      title: 'Edit post',
      form,
      error: 'slug taken',
      onClose: { _tag: 'Closed' },
      onRetry: { _tag: 'Retried' },
      ...extra,
    },
    h,
  )

const read = (root: Html) => {
  const section = Inert.byTag(root, 'section')[0]
  const status = Inert.all(root).find(
    node => Inert.value(node, 'role') !== undefined && node.sel === 'p',
  )
  return {
    status: Inert.value(section, 'data-status'),
    busy: Inert.value(section, 'aria-busy'),
    line: status === undefined ? undefined : [Inert.value(status, 'role'), Inert.text(status)],
    form: Inert.all(root).some(node => Inert.value(node, 'id') === 'the-form'),
    buttons: Inert.byTag(root, 'button').map(button => Inert.text(button)),
  }
}

describe('EditorView', () => {
  it.each([
    ['Loading', 'true', ['status', 'Loading…'], false, ['Close']],
    ['NotFound', undefined, ['status', 'That does not exist.'], false, ['Close']],
    ['LoadFailed', undefined, ['alert', 'It could not be read.'], false, ['Try again', 'Close']],
    ['Editing', undefined, undefined, true, ['Close']],
    ['Saving', 'true', ['status', 'Saving…'], true, ['Close']],
    ['Saved', undefined, ['status', 'Saved.'], true, ['Close']],
    ['SaveFailed', undefined, ['alert', 'Not saved: slug taken'], true, ['Close']],
    [
      'Conflict',
      undefined,
      ['alert', 'Someone else saved this first, so your changes were not saved.'],
      true,
      ['Close'],
    ],
    [
      'Moved',
      undefined,
      ['status', 'Someone else has saved this since you opened it.'],
      true,
      ['Close'],
    ],
  ] as const)('draws %s as its own state', (status, busy, line, hasForm, buttons) => {
    expect(read(drawn(status))).toEqual({ status, busy, line, form: hasForm, buttons })
  })

  it('draws nothing while closed', () => {
    expect(Inert.all(drawn('Closed')).some(node => node.sel === 'section')).toBe(false)
  })

  it('is named by its title, and its buttons send the application’s Messages', () => {
    const root = drawn('LoadFailed')
    const section = Inert.byTag(root, 'section')[0]
    expect(Inert.value(section, 'aria-labelledby')).toBe('post-title')
    expect(Inert.text(Inert.byTag(root, 'h2')[0])).toBe('Edit post')
    expect(Inert.byTag(root, 'button').map(button => button.data?.on?.click !== undefined)).toEqual(
      [true, true],
    )
    expect(read(drawn('Editing', { onClose: undefined })).buttons).toEqual([])
  })

  it('says its states in the application’s words', () => {
    expect(
      read(drawn('SaveFailed', { words: { saveFailed: 'Nicht gespeichert: {message}' } })).line,
    ).toEqual(['alert', 'Nicht gespeichert: slug taken'])
  })

  it('draws every element in a Slot', () => {
    const root = Inert.draw(Editor, {
      id: 'post',
      status: 'LoadFailed',
      title: 'Edit post',
      form,
      onClose: { _tag: 'Closed' },
      onRetry: { _tag: 'Retried' },
    })
    expect(Inert.byTag(root, 'button')).toHaveLength(2)
    expect(Inert.unslotted(root)).toEqual([])
    // Open, the body holds the application's form, which is the only element of its own.
    const open = Inert.draw(Editor, {
      id: 'post',
      status: 'Editing',
      title: 'Edit post',
      form,
      onClose: { _tag: 'Closed' },
    })
    expect(Inert.unslotted(open)).toEqual(['section > div > form'])
  })

  it('serves an open editor with its form’s names', async () => {
    const Post = Form.make(
      'Post',
      Form.input(Schema.Struct({ title: Schema.String, body: Schema.String })),
    )
    const PostForm = FormView.define(Post)
    const html = await Effect.runPromise(
      renderToString(
        {
          init: () => ({ model: Post.initial }),
          view: (model: typeof Post.initial, h: HtmlBuilder<typeof Post.Message.Type>) => ({
            title: 'Post',
            body: EditorView.forMessages<typeof Post.Message.Type>().define()(
              {
                id: 'post',
                status: 'Editing',
                title: 'New post',
                form: PostForm({ model, errors: [], canSubmit: false }, h),
              },
              h,
            ),
          }),
        },
        { buildId: 'b' },
      ),
    )
    const page = new DOMParser().parseFromString(
      injectIntoTemplate(
        '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
        html,
      ),
      'text/html',
    )
    expect(
      Array.from(page.querySelectorAll('section [name]')).map(element =>
        element.getAttribute('name'),
      ),
    ).toEqual(['title', 'body'])
  })
})

describe('ConfirmView', () => {
  const asked = (
    status: RemoverStatus,
    name: Option.Option<string> = Option.some('Hello, World'),
  ) =>
    Confirm(
      {
        id: 'delete',
        status,
        name,
        onConfirm: { _tag: 'Yes' },
        onCancel: { _tag: 'No' },
        error: 'still linked',
      },
      h,
    )
  const buttons = (root: Html) =>
    Inert.byTag(root, 'button').map(button => [
      Inert.text(button),
      Inert.value(button, 'disabled') ?? false,
    ])

  it('asks about the thing by its name, and confirms or cancels', () => {
    const root = asked('Confirming')
    expect(Inert.text(Inert.byTag(root, 'p')[0])).toBe('Delete Hello, World?')
    expect(buttons(root)).toEqual([
      ['Delete', false],
      ['Cancel', false],
    ])
    expect(Inert.value(Inert.byRole(root, 'group')[0], 'aria-labelledby')).toBe('delete-question')
  })

  it('cannot confirm without a name for what it deletes', () => {
    const root = asked('Confirming', Option.none())
    expect(buttons(root)).toEqual([
      ['Delete', true],
      ['Cancel', false],
    ])
    expect(Inert.byTag(root, 'button')[0]?.data?.on?.click).toBeUndefined()
  })

  it.each([
    ['Deleting', 'status', 'Deleting…'],
    ['Deleted', 'status', 'Deleted.'],
    ['DeleteFailed', 'alert', 'Not deleted: still linked'],
  ] as const)('says %s', (status, role, text) => {
    const line = Inert.byRole(asked(status), role)[0]
    expect(Inert.text(line)).toBe(text)
  })

  it('asks again after a failed delete, and draws nothing while idle', () => {
    expect(buttons(asked('DeleteFailed')).map(([text]) => text)).toEqual(['Delete', 'Cancel'])
    expect(Inert.all(asked('Idle')).some(node => node.sel === 'div')).toBe(false)
  })
})

describe('Toolbar', () => {
  it('draws only the parts it is given, each in its Slot', () => {
    const root = Inert.draw(Bar, {
      search: h.input([h.Type('search')]),
      actions: [h.button([], ['New post'])],
    })
    expect(Inert.children(root).map(part => Inert.children(part)[0]?.sel)).toEqual([
      'input',
      'button',
    ])
    // Only the application's own controls are outside the toolbar's Slots.
    expect(Inert.unslotted(root)).toEqual(['div > div > input', 'div > div > button'])
  })
})
