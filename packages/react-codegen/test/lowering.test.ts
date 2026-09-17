// @vitest-environment jsdom
/**
 * Submodels and memoized views compile to plain calls: a child view runs with a
 * dispatch that lifts its Messages, and a lazy slot calls its view directly.
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { DiagnosticCode, transformSourceFile } from '../src/index.js'
import { compile, load, typecheck } from './harness.js'

const view = `
import type { Html, HtmlBuilder } from 'foldkit/html'
import { createKeyedLazy, createLazy } from 'foldkit/html'
import * as Submodel from 'foldkit/submodel'
import { Child, Message, type Model } from './message'

const counterView = Submodel.defineView<number, Child>((count, h) =>
  h.button([h.Class('child'), h.OnClick(Child.Bumped({ by: count }))], [String(count)]),
)

const headerSlot = createLazy()
const rowSlot = createKeyedLazy()

const header = (title: string, h: HtmlBuilder<Message>): Html => h.h1([], [title])
const row = (label: string, h: HtmlBuilder<Message>): Html =>
  h.keyed('li')(label, [h.OnClick(Message.Picked({ label }))], [label])

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      headerSlot(header, [model.title, h]),
      h.ul([], model.items.map(item => rowSlot(item, row, [item, h]))),
      h.submodel({
        slotId: 'counter',
        model: model.count,
        view: counterView,
        toParentMessage: message => Message.GotChild({ message }),
      }),
    ],
  )
`

const messageModule = `
export type Model = { readonly title: string; readonly items: ReadonlyArray<string>; readonly count: number }
export type Child = { readonly _tag: 'Bumped'; readonly by: number }
export const Child = { Bumped: (fields: { readonly by: number }): Child => ({ _tag: 'Bumped', ...fields }) }
export type Message =
  | { readonly _tag: 'Picked'; readonly label: string }
  | { readonly _tag: 'GotChild'; readonly message: Child }
export const Message = {
  Picked: (fields: { readonly label: string }): Message => ({ _tag: 'Picked', ...fields }),
  GotChild: (fields: { readonly message: Child }): Message => ({ _tag: 'GotChild', ...fields }),
}
`

it('drops the Foldkit runtime from the output entirely', () => {
  const code = compile(view)
  expect(code).not.toMatch(/from ['"]foldkit/)
  expect(code).not.toContain('createLazy')
  expect(code).not.toContain('Slot')
  expect(code).toContain('counterView(model.count, submodelMessage =>')
})

it('emits TSX that type-checks against React', () => {
  expect(typecheck({ 'View.tsx': compile(view), 'message.ts': messageModule }, 'View.tsx')).toEqual(
    [],
  )
})

it('renders memoized rows and lifts Submodel Messages through toParentMessage', async () => {
  const Child = { Bumped: (fields: { by: number }) => ({ _tag: 'Bumped', ...fields }) }
  const Message = {
    Picked: (fields: { label: string }) => ({ _tag: 'Picked', ...fields }),
    GotChild: (fields: { message: unknown }) => ({ _tag: 'GotChild', ...fields }),
  }
  const generated = load(compile(view), { './message': { Child, Message } })
  const dispatched: Array<unknown> = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  root.render(
    createElement(() =>
      generated.view({ title: 'Title', items: ['a', 'b'], count: 3 }, (message: unknown) =>
        dispatched.push(message),
      ),
    ),
  )
  try {
    await vi.waitFor(() => expect(container.querySelector('h1')?.textContent).toBe('Title'))
    expect(Array.from(container.querySelectorAll('li')).map(li => li.textContent)).toEqual([
      'a',
      'b',
    ])

    ;(container.querySelectorAll('li')[1] as HTMLElement).click()
    expect(dispatched.at(-1)).toEqual({ _tag: 'Picked', label: 'b' })

    ;(container.querySelector('.child') as HTMLElement).click()
    expect(dispatched.at(-1)).toEqual({ _tag: 'GotChild', message: { _tag: 'Bumped', by: 3 } })
  } finally {
    root.unmount()
  }
})

it('passes viewInputs between the child model and the lifting dispatch', () => {
  const code = compile(`
import type { Html, HtmlBuilder } from 'foldkit/html'
export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({ slotId: 'menu', model: model.menu, view: menuView, viewInputs: { toView: renderMenu }, toParentMessage: GotMenu })
`)
  expect(code).toContain(
    'menuView(model.menu, { toView: renderMenu }, submodelMessage => dispatch((GotMenu)(submodelMessage)))',
  )
})

it('recognizes defineView only when it is imported from Foldkit', () => {
  const body = `const child = defineView<number, M>((count, h) =>
  h.p([], [String(count)]),
)
`
  const foldkit = compile(`import { defineView } from 'foldkit/submodel'
${body}`)
  expect(foldkit).toContain('(count: number, dispatch: (message: M) => void) => (<p>')
  const other = compile(`import { defineView } from 'another-library'
${body}`)
  expect(other).toContain('defineView<number, M>((count, h) =>')
  expect(
    compile(`import { Submodel } from 'foldkit'
${body.replace('defineView', 'Submodel.defineView')}`),
  ).toContain('(count: number, dispatch: (message: M) => void) =>')
})

const header = `import type { HtmlBuilder } from 'foldkit/html'\nimport { createLazy } from 'foldkit/html'\n`

it.each([
  [
    'a Submodel config that is not an object literal',
    `export const view = (h: HtmlBuilder<M>) =>\n  h.submodel(config)`,
    DiagnosticCode.UnsupportedBuilder,
    'object literal',
  ],
  [
    'a Submodel config missing toParentMessage',
    `export const view = (h: HtmlBuilder<M>) =>\n  h.submodel({ slotId: 'x', model: 1, view: v })`,
    DiagnosticCode.UnsupportedBuilder,
    'toParentMessage',
  ],
  [
    'a slot passed around instead of called',
    `const slot = createLazy()\nexport const view = (h: HtmlBuilder<M>) =>\n  keep(slot)`,
    DiagnosticCode.LazySlot,
    'called directly',
  ],
  [
    'a slot called with the wrong arity',
    `const slot = createLazy()\nexport const view = (h: HtmlBuilder<M>) =>\n  slot(row)`,
    DiagnosticCode.LazySlot,
    'slot(view, args)',
  ],
])('rejects %s', (_, body, code, fragment) => {
  const result = transformSourceFile('src/View.ts', header + body + '\n')
  expect(result.ok).toBe(false)
  const [diagnostic] = result.diagnostics
  expect(diagnostic?.code).toBe(code)
  expect(diagnostic?.message).toContain(fragment)
})
