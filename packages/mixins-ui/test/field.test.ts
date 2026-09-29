// @vitest-environment jsdom
/**
 * `Input.field` and `Textarea.field` in one call each: a `FieldValidation`
 * state drawn with its label, control, and description placed, on the real
 * runtime.
 */
import { Schema } from 'effect'
import { FieldValidation } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Input, Textarea, type FieldParts } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

type State = FieldValidation.Field<string>
const Model = Schema.Struct({ field: FieldValidation.Field(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Changed: { value: Schema.String } })
type Message = typeof Message.Type

type View = (model: Model, h: HtmlBuilder<Message>) => Html
type Draw = (parts: FieldParts, h: HtmlBuilder<Message>) => Html

const show = (view: View, id: string, initial: State, seen?: Array<string>) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  // The runtime renders into its container by id.
  container.id = id
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { field: initial } }),
      update: (model: Model, message: Message) => {
        if (message._tag === 'Changed') {
          seen?.push(message.value)
          return {
            model: { ...model, field: FieldValidation.NotValidated({ value: message.value }) },
          }
        }
        return { model }
      },
      view,
    }),
  )
  return handle
}

const changed = (value: string) => Message.Changed({ value })

const components: ReadonlyArray<{
  readonly name: string
  readonly control: string
  readonly view: (extra?: { readonly draw: Draw }) => View
}> = [
  {
    name: 'Input.field',
    control: 'input',
    view: (extra?: { readonly draw: Draw }) => (model, h) =>
      Input.field({ id: 'name', label: 'Name', field: model.field, changed, ...extra }, h),
  },
  {
    name: 'Textarea.field',
    control: 'textarea',
    view: (extra?: { readonly draw: Draw }) => (model, h) =>
      Textarea.field({ id: 'bio', label: 'Bio', field: model.field, changed, ...extra }, h),
  },
]

for (const component of components) {
  describe(component.name, () => {
    it('draws the label with the value', async () => {
      const handle = show(
        component.view(),
        `${component.control}-value`,
        FieldValidation.NotValidated({ value: 'Ada' }),
      )
      try {
        await vi.waitFor(() =>
          expect(document.querySelector('label')?.textContent).toBe(
            component.control === 'input' ? 'Name' : 'Bio',
          ),
        )
        const control = document.querySelector(component.control) as HTMLInputElement
        expect(control.value).toBe('Ada')
      } finally {
        handle.dispose()
      }
    })

    it('says nothing under a field with no answer yet', async () => {
      const handle = show(
        component.view(),
        `${component.control}-quiet`,
        FieldValidation.NotValidated({ value: '' }),
      )
      try {
        await vi.waitFor(() => expect(document.querySelector(component.control)).not.toBeNull())
        expect(document.querySelector('span')).toBeNull()
        expect(document.querySelector(component.control)?.getAttribute('aria-invalid')).toBeNull()
      } finally {
        handle.dispose()
      }
    })

    it('says the first error under an invalid field, linked from it', async () => {
      const invalid = FieldValidation.Invalid({
        value: 'x',
        errors: ['Too short', 'Needs a digit'],
      })
      const handle = show(component.view(), `${component.control}-invalid`, invalid)
      try {
        await vi.waitFor(() =>
          expect(document.querySelector('span')?.textContent).toBe('Too short'),
        )
        const control = document.querySelector(component.control) as HTMLElement
        const description = document.querySelector('span') as HTMLElement
        expect(control.getAttribute('aria-invalid')).toBe('true')
        expect(control.getAttribute('aria-describedby')).toContain(description.id)
      } finally {
        handle.dispose()
      }
    })

    it('says a check is running, and says nothing once it passes', async () => {
      const checking = show(
        component.view(),
        `${component.control}-checking`,
        FieldValidation.Validating({ value: 'ada@x.y' }),
      )
      try {
        await vi.waitFor(() =>
          expect(document.querySelector('span')?.textContent).toBe('Checking…'),
        )
      } finally {
        checking.dispose()
      }
      const valid = show(
        component.view(),
        `${component.control}-valid`,
        FieldValidation.Valid({ value: 'ada@x.y' }),
      )
      try {
        await vi.waitFor(() => expect(document.querySelector(component.control)).not.toBeNull())
        expect(document.querySelector('span')).toBeNull()
      } finally {
        valid.dispose()
      }
    })

    it('draws through a custom draw instead of the stack', async () => {
      const handle = show(
        component.view({ draw: (_parts, h) => h.p([], ['custom']) }),
        `${component.control}-custom`,
        FieldValidation.NotValidated({ value: '' }),
      )
      try {
        await vi.waitFor(() => expect(document.querySelector('p')?.textContent).toBe('custom'))
        expect(document.querySelector('label')).toBeNull()
      } finally {
        handle.dispose()
      }
    })
  })
}

describe('Input.field specifics', () => {
  it('forwards type and placeholder to the control', async () => {
    const handle = show(
      (model, h) =>
        Input.field(
          {
            id: 'email',
            label: 'Email',
            field: model.field,
            changed,
            type: 'email',
            placeholder: 'you@example.com',
          },
          h,
        ),
      'input-attrs',
      FieldValidation.NotValidated({ value: '' }),
    )
    try {
      await vi.waitFor(() =>
        expect(document.querySelector('input')?.getAttribute('type')).toBe('email'),
      )
      expect(document.querySelector('input')?.getAttribute('placeholder')).toBe('you@example.com')
    } finally {
      handle.dispose()
    }
  })

  it('sends what is typed as the changed Message', async () => {
    const seen: Array<string> = []
    const handle = show(
      (model, h) => Input.field({ id: 'name', label: 'Name', field: model.field, changed }, h),
      'input-typing',
      FieldValidation.NotValidated({ value: '' }),
      seen,
    )
    try {
      await vi.waitFor(() => expect(document.querySelector('input')).not.toBeNull())
      const control = document.querySelector('input') as HTMLInputElement
      control.value = 'Ada'
      control.dispatchEvent(new Event('input', { bubbles: true }))
      await vi.waitFor(() => expect(seen).toEqual(['Ada']))
    } finally {
      handle.dispose()
    }
  })
})

describe('Textarea.field specifics', () => {
  it('forwards rows and placeholder to the control', async () => {
    const handle = show(
      (model, h) =>
        Textarea.field(
          {
            id: 'bio',
            label: 'Bio',
            field: model.field,
            changed,
            rows: 5,
            placeholder: 'A few words',
          },
          h,
        ),
      'textarea-attrs',
      FieldValidation.NotValidated({ value: '' }),
    )
    try {
      await vi.waitFor(() =>
        expect(document.querySelector('textarea')?.getAttribute('rows')).toBe('5'),
      )
      expect(document.querySelector('textarea')?.getAttribute('placeholder')).toBe('A few words')
    } finally {
      handle.dispose()
    }
  })
})
