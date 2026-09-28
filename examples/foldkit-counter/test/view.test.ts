import { SlotView, Style } from 'foldkit-mixins'
import { Inert, type Node as InertNode } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { Counter, type Message, view } from '../src/main.js'
import { stylesheet } from '../src/style.js'

const tree = Inert.draw(Counter, { count: 0 })

/** The compiled CSS behind the classes on `nodes`. */
const cssOf = (nodes: ReadonlyArray<InertNode>): string =>
  Style.usedIn(nodes.flatMap(Inert.classes).join(' '))

describe('the counter view', () => {
  test('puts the count in the document title', () => {
    expect(view({ count: 3 }, SlotView.inertBuilder<Message>()).title).toBe('Counter: 3')
  })

  test('draws every element through a Slot, so a Style can reach all of it', () => {
    expect(Inert.unslotted(tree)).toEqual([])
  })

  test('draws each button as a solid Button recipe', () => {
    const buttons = Inert.byTag(tree, 'button')
    expect(buttons).toHaveLength(3)
    for (const button of buttons) {
      expect(cssOf([button])).toContain('background:var(--_fk-tone-fill)')
    }
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    // A token read without a fallback renders nothing when the sheet lacks it.
    const read = new Set(
      [...cssOf(Inert.all(tree)).matchAll(/var\((--fk-[\w-]+)\)/g)].map(([, name]) => name),
    )
    expect(read.size).toBeGreaterThan(0)
    expect([...read].filter(name => !stylesheet.includes(`${name}:`))).toEqual([])
  })
})
