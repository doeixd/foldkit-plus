// @vitest-environment jsdom
/**
 * A `CustomElement.define` spec compiles to its tag: declared properties become
 * props React writes as DOM properties, and declared events become
 * `on<event-name>` listeners that dispatch the mapped Message.
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { DiagnosticCode, transformSourceFile } from '../src/index.js'
import { compile, load, typecheck } from './harness.js'

const view = `
import { Schema } from 'effect'
import { CustomElement } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Message, type Model } from './message'

const colorPicker = CustomElement.define({
  tag: 'color-picker',
  properties: { color: Schema.String },
  events: { 'color-changed': Schema.Struct({ value: Schema.String }) },
})

export const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const picker = colorPicker.withMessage(h)
  return h.div(
    [],
    [
      picker(
        [
          h.Class('picker'),
          picker.Color(model.color),
          picker.OnColorChanged(detail => Message.Picked({ color: detail.value })),
        ],
        [],
      ),
    ],
  )
}
`

const messageModule = `
export type Model = { readonly color: string }
export type Message = { readonly _tag: 'Picked'; readonly color: string }
export const Message = {
  Picked: (fields: { readonly color: string }): Message => ({ _tag: 'Picked', ...fields }),
}
`

it('compiles the element to its tag with property and event props, and no Foldkit import', () => {
  const code = compile(view)
  expect(code).toContain(
    `<color-picker className={'picker'} color={model.color} oncolor-changed={(event: CustomEvent) => dispatch((detail => Message.Picked({ color: detail.value }))(event.detail))}/>`,
  )
  expect(code).not.toMatch(/from ['"]foldkit/)
  expect(code).not.toContain('CustomElement.define')
  expect(code).not.toContain('withMessage')
  expect(code).toMatch(
    /declare module "react" \{\s+namespace JSX \{\s+interface IntrinsicElements \{\s+"color-picker": Record<string, unknown>;/,
  )
})

// Runs tsc against React's types; slow when 300 test workers compete for the CPU.
it('emits TSX that type-checks against React', { timeout: 30_000 }, () => {
  expect(typecheck({ 'View.tsx': compile(view), 'message.ts': messageModule }, 'View.tsx')).toEqual(
    [],
  )
})

it('writes the property and dispatches the event through React', async () => {
  class ColorPicker extends HTMLElement {
    color = ''
  }
  customElements.define('color-picker', ColorPicker)
  const Message = { Picked: (fields: { color: string }) => ({ _tag: 'Picked', ...fields }) }
  const generated = load(compile(view), { './message': { Message } })
  const dispatched: Array<unknown> = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const App = ({ color }: { readonly color: string }) =>
    generated.view({ color }, (message: unknown) => dispatched.push(message))
  const render = (color: string) => root.render(createElement(App, { color }))
  render('red')
  try {
    await vi.waitFor(() => expect(container.querySelector('color-picker')).not.toBeNull())
    const picker = container.querySelector('color-picker') as ColorPicker
    expect(picker.color).toBe('red')
    // A property, as Foldkit writes it, not an attribute.
    expect(picker.getAttribute('color')).toBeNull()

    picker.dispatchEvent(new CustomEvent('color-changed', { detail: { value: 'blue' } }))
    expect(dispatched).toEqual([{ _tag: 'Picked', color: 'blue' }])

    render('green')
    await vi.waitFor(() => expect(picker.color).toBe('green'))
  } finally {
    root.unmount()
  }
})

const define = `import { Schema } from 'effect'
import { CustomElement } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
const spec = CustomElement.define({ tag: 'x-el', properties: { value: Schema.String }, events: {} })
`

it.each([
  [
    'a spec defined in another module',
    `import { imported } from './elements'\nimport type { HtmlBuilder } from 'foldkit/html'\nexport const view = (h: HtmlBuilder<M>) =>\n  imported.withMessage(h)([], [])`,
    'Define the custom element in this module',
  ],
  [
    'a factory the spec does not declare',
    `${define}export const view = (h: HtmlBuilder<M>) => {\n  const el = spec.withMessage(h)\n  return el([el.Missing(1)], [])\n}`,
    'is not a declared property or event of <x-el>',
  ],
  [
    'a bound builder passed around',
    `${define}export const view = (h: HtmlBuilder<M>) => {\n  const el = spec.withMessage(h)\n  return keep(el)\n}`,
    'can only be called as an element',
  ],
  [
    'an unexported spec used outside withMessage',
    `${define}export const tag = spec.tag\nexport const view = (h: HtmlBuilder<M>) => h.p([], [])`,
    'can only be used as spec.withMessage(h)',
  ],
])('rejects %s', (_, source, fragment) => {
  const result = transformSourceFile('src/View.ts', `${source}\n`)
  expect(result.ok).toBe(false)
  expect(result.diagnostics[0]).toMatchObject({ code: DiagnosticCode.CustomElement })
  expect(result.diagnostics[0]?.message).toContain(fragment)
})

it('keeps an exported spec for other modules', () => {
  const code = compile(
    `${define.replace('const spec', 'export const spec')}export const view = (h: HtmlBuilder<M>) =>\n  spec.withMessage(h)([], [])\n`,
  )
  expect(code).toContain('export const spec = CustomElement.define(')
  expect(code).toContain(`import { CustomElement } from 'foldkit'`)
  expect(code).toContain('<x-el />')
})
