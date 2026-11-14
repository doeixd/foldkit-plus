/**
 * `Conformance.checkbox` against the shipped Checkbox and against a checkbox
 * assembled from primitives, each beside a disabled one.
 */
import { Schema } from 'effect'
import { view as checkboxView } from '@foldkit/ui/checkbox'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Conformance } from 'foldkit-mixins/testing'
import { afterEach, expect, test, vi } from 'vitest'
import { Checkbox } from '../../src/index.js'
import * as HandBuilt from './checkbox.handBuilt.js'
import { harness } from './harness.js'

const Model = Schema.Struct({ subscribe: Schema.Boolean, locked: Schema.Boolean })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Toggled: { field: Schema.Literals(['subscribe', 'locked']), isChecked: Schema.Boolean },
})
type Message = typeof Message.Type

afterEach(() => {
  document.body.replaceChildren()
})

const mountShipped = () => {
  const container = document.createElement('div')
  container.id = 'conformance-checkbox'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { subscribe: false, locked: false } }),
      update: (model: Model, message: Message) =>
        Message.match(message, {
          Toggled: ({ field, isChecked }) => ({ model: { ...model, [field]: isChecked } }),
        }),
      view: (model: Model, h: HtmlBuilder<Message>) => {
        const one = (field: 'subscribe' | 'locked', label: string, isDisabled: boolean) =>
          checkboxView<Message>(
            {
              id: field,
              isChecked: model[field],
              isDisabled,
              onToggle: isChecked => Message.Toggled({ field, isChecked }),
              toView: Checkbox.toView([], { h }, resolved =>
                h.div([], [h.button(resolved.checkbox, []), h.label(resolved.label, [label])]),
              ),
            },
            h,
          )
        return h.div([], [one('subscribe', 'Subscribe', false), one('locked', 'Locked', true)])
      },
    }),
  )
}

const enter = async () => {
  const boxes = await vi.waitFor(() => {
    const found = document.querySelectorAll<HTMLElement>('[role="checkbox"]')
    expect(found).toHaveLength(2)
    return found
  })
  boxes[0]!.focus()
}

test.each([
  ['the shipped Checkbox', mountShipped],
  ['a checkbox assembled from primitives', HandBuilt.mount],
] as const)('%s conforms', async (_, mount) => {
  const handle = mount()
  try {
    const result = await Conformance.checkbox(harness, {
      name: 'Subscribe',
      disabled: 'Locked',
      enter,
    })
    expect(Conformance.failures(result)).toEqual([])
    expect(result.length).toBeGreaterThan(5)
  } finally {
    handle.dispose()
  }
})
