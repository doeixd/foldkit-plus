import { Style } from 'foldkit-mixins'
import { Inert, type Node as InertNode } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { Page } from '../src/main.js'
import { stylesheet } from '../src/style.js'

const tree = Inert.draw(Page, {
  count: 3,
  renderedAt: '2026-07-26T00:00:00.000Z',
  renderedOn: 'Server',
})

/** The compiled CSS behind the classes on `nodes`. */
const cssOf = (nodes: ReadonlyArray<InertNode>): string =>
  Style.usedIn(nodes.flatMap(Inert.classes).join(' '))

describe('the page', () => {
  test('draws every element through a Slot, so a Style can reach all of it', () => {
    expect(Inert.unslotted(tree)).toEqual([])
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    // A token read without a fallback renders nothing when the sheet lacks it.
    const nodes = Inert.all(tree)
    const inline = nodes.flatMap(node => Object.values(Inert.style(node))).join(' ')
    const read = new Set(
      [...`${cssOf(nodes)}${inline}`.matchAll(/var\((--fk-[\w-]+)\)/g)].map(([, name]) => name),
    )
    expect(read.size).toBeGreaterThan(0)
    expect([...read].filter(name => !stylesheet.includes(`${name}:`))).toEqual([])
  })
})
