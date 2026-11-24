import { Layer } from 'effect'
import { Action, Checkbox, KeyedList, Text, TextInput } from './surface.js'

/** Adapt named slots on a fresh or server-rendered template to their DOM properties. */
export const renderer = (root: HTMLElement) => {
  const anchors = new Map<string, HTMLElement>()
  for (const node of root.querySelectorAll<HTMLElement>('[data-slot]')) {
    const id = node.getAttribute('data-slot')!
    if (anchors.has(id)) throw new Error(`Duplicate DOM anchor "${id}"`)
    anchors.set(id, node)
  }
  const anchor = (id: string): HTMLElement => {
    const node = anchors.get(id)
    if (node === undefined) throw new Error(`Missing DOM anchor "${id}"`)
    return node
  }
  const input = (id: string, type: 'checkbox' | 'text'): HTMLInputElement => {
    const node = anchor(id)
    if (!(node instanceof HTMLInputElement) || node.type !== type) {
      throw new Error(`Anchor "${id}" requires a ${type} input`)
    }
    return node
  }
  return Layer.mergeAll(
    Layer.succeed(Text, {
      set: (id, value) => {
        anchor(id).textContent = String(value)
      },
    }),
    Layer.succeed(Checkbox, {
      set: (id, value) => {
        input(id, 'checkbox').checked = value
      },
    }),
    Layer.succeed(TextInput, {
      set: (id, value) => {
        input(id, 'text').value = value
      },
    }),
    Layer.succeed(Action, {
      set: (id, value) => {
        const node = anchor(id)
        if (!(node instanceof HTMLButtonElement))
          throw new Error(`Anchor "${id}" requires a button`)
        node.disabled = !value
      },
    }),
    Layer.succeed(KeyedList, {
      set: (id, keys) => {
        const list = anchor(id)
        const children = new Map(
          Array.from(list.children).map(child => [child.getAttribute('data-key'), child]),
        )
        if (children.size !== keys.length || keys.some(key => !children.has(key))) {
          throw new Error(`Keyed list "${id}" requires a matching template`)
        }
        let next = list.firstElementChild
        for (const key of keys) {
          const child = children.get(key)!
          if (child !== next) list.insertBefore(child, next)
          next = child.nextElementSibling
        }
      },
    }),
  )
}
