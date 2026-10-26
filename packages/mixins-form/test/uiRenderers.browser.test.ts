/// <reference types="@vitest/browser-playwright" />
/**
 * `UiForm.renderers` under the keyboard, in a real browser: Space presses the
 * Toggle's and a choice's `role="checkbox"` button, and the arrows move the
 * select, each sending the form's own `Changed`.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Frames } from 'foldkit-mixins/testing'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FormView } from '../src/index.js'
import * as UiForm from '../src/ui.js'
import { Edit, options } from './fixture.js'

type Model = typeof Edit.initial
type Message = typeof Edit.Message.Type
const View = FormView.define(Edit, { renderers: UiForm.renderers() })

afterEach(() => document.body.replaceChildren())

const mount = async () => {
  const frames = Frames.track()
  const container = document.createElement('div')
  container.id = 'ui-keys'
  document.body.append(container)
  const sent: Array<Message> = []
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: Edit.bundle.Model,
      container,
      init: () => ({ model: Edit.initial }),
      update: (model: Model, message: Message) => {
        sent.push(message)
        return { model: Edit.bundle.update(model, message, undefined).model }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        View({ model, errors: [], canSubmit: false, options }, h),
    }),
  )
  await vi.waitFor(() => expect(document.getElementById('Edit-featured')).not.toBeNull())
  const changed = () => sent.filter(message => message._tag === 'Changed')
  return {
    changed,
    dispose: () => {
      handle.dispose()
      frames.dispose()
    },
    settle: () => frames.settle(),
  }
}

it('presses the Toggle with Space', async () => {
  const page = await mount()
  try {
    document.getElementById('Edit-featured')!.focus()
    await userEvent.keyboard(' ')
    await vi.waitFor(() =>
      expect(page.changed()).toEqual([Edit.Message.Changed({ key: 'featured', value: true })]),
    )
    await page.settle()
    expect(document.getElementById('Edit-featured')!.getAttribute('aria-checked')).toBe('true')
  } finally {
    page.dispose()
  }
})

it('presses a choice with Space', async () => {
  const page = await mount()
  try {
    document.getElementById('Edit-tagIds-1')!.focus()
    await userEvent.keyboard(' ')
    await vi.waitFor(() =>
      expect(page.changed()).toEqual([Edit.Message.Changed({ key: 'tagIds', value: ['t2'] })]),
    )
  } finally {
    page.dispose()
  }
})

it('moves the select with the arrows', async () => {
  const page = await mount()
  try {
    document.getElementById('Edit-status')!.focus()
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() =>
      expect(page.changed()).toEqual([Edit.Message.Changed({ key: 'status', value: 'draft' })]),
    )
  } finally {
    page.dispose()
  }
})
