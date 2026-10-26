/**
 * The stack in a real browser: a child with no width of its own fills it, one
 * that sets a width keeps it though the stack's layer comes after, and a text
 * field fills it without spilling past its edge.
 */
import { afterEach, expect, test } from 'vitest'
import { Layers, Style } from '../src/index.js'
import { Layout } from '../src/layout.js'
import * as Rules from '../src/styleRules.js'

const L = Layers.standard
// Placed as an application places them: a component's width, then the stack's layer.
const Box = L.in('components', Style.self({ inlineSize: '16px', blockSize: '16px' }))
const Stack = L.in('layouts', Layout.stack())
const Centered = L.in('layouts', Layout.stack({ align: 'center' }))
const classOf = (piece: typeof Box) => Rules.className(piece.rules ?? [])

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

test('a stack fills its children, keeps a set width, and holds a field inside it', () => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = Style.stylesheet(L.declare, Box, Stack, Centered)
  document.head.append(style)
  // The align option is a custom property on the element, as the runtime writes it.
  const centeredVars = Object.entries(Centered.style)
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ')
  const holder = document.createElement('div')
  holder.innerHTML = `
    <div class="${classOf(Stack)}" style="inline-size: 400px">
      <div id="plain">words</div>
      <input id="field">
      <input id="box" type="checkbox" class="${classOf(Box)}">
    </div>
    <div class="${classOf(Centered)}" style="inline-size: 400px; ${centeredVars}">
      <button id="centered">centred</button>
    </div>`
  document.body.append(holder)
  const width = (id: string) => document.getElementById(id)!.getBoundingClientRect().width
  expect(['plain', 'field', 'box', 'centered'].map(width)).toEqual([400, 400, 16, 400])
})
