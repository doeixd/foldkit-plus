import { Style } from 'foldkit-mixins'
import { Inert, type Node as InertNode } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { AppRoute, Page } from '../src/main.js'
import { stylesheet } from '../src/style.js'

const trees = [AppRoute.Home(), AppRoute.About(), AppRoute.NotFound({ path: '/missing' })].map(
  route => Inert.draw(Page, { route, count: 3 }),
)

/** The compiled CSS behind the classes on `nodes`. */
const cssOf = (nodes: ReadonlyArray<InertNode>): string =>
  Style.usedIn(nodes.flatMap(Inert.classes).join(' '))

describe('the pages', () => {
  test('draw every element through a Slot, so a Style can reach all of it', () => {
    for (const tree of trees) expect(Inert.unslotted(tree)).toEqual([])
  })

  test('ship every theme token the drawn styles read in the stylesheet', () => {
    // A token read without a fallback renders nothing when the sheet lacks it.
    const read = new Set(
      trees.flatMap(tree => {
        const nodes = Inert.all(tree)
        const inline = nodes.flatMap(node => Object.values(Inert.style(node))).join(' ')
        return [...`${cssOf(nodes)}${inline}`.matchAll(/var\((--fk-[\w-]+)\)/g)].map(
          ([, name]) => name,
        )
      }),
    )
    expect(read.size).toBeGreaterThan(0)
    expect([...read].filter(name => !stylesheet.includes(`${name}:`))).toEqual([])
  })
})
