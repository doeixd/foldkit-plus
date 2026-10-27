/**
 * The phone audit over pages built to pass or fail it, in a real browser: a
 * target too small and too near another is named, and each exception WCAG
 * 2.5.8 grants is honoured; a page wider than the window is measured.
 */
import { afterEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { phoneAudit } from '../src/phoneAudit.js'

afterEach(() => {
  document.body.replaceChildren()
})

const audit = async (html: string) => {
  await page.viewport(390, 844)
  document.body.innerHTML = html
  return phoneAudit()
}

const small = 'style="inline-size: 16px; block-size: 16px; padding: 0; border: 0"'

test.each([
  {
    name: 'two small buttons side by side are both named',
    html: `<button id="a" ${small}></button><button id="b" ${small}></button>`,
    named: ['button#a "" 16x16', 'button#b "" 16x16'],
  },
  {
    name: 'a small button with room around it passes on its spacing',
    html: `<button id="a" ${small}></button>`,
    named: [],
  },
  {
    // Too near each other for the spacing exception: only being inline passes them.
    name: 'links inside a sentence pass as inline',
    html: '<p>Pages <a href="#x">1</a>, <a href="#y">2</a> and <a href="#z">3</a>.</p>',
    named: [],
  },
  {
    name: 'a small checkbox beside a link is named, unless its label is a target',
    html: `<label id="l"><input id="c" type="checkbox" ${small}></label><a href="#z" style="display:inline-block;inline-size:40px;block-size:40px">z</a>`,
    named: ['input#c "" 16x16'],
  },
  {
    name: 'a small checkbox whose label is a finger’s size passes',
    // The box sits against the link, too near for the spacing exception.
    html: `<label style="display:inline-flex;align-items:center;min-block-size:32px">Done <input id="c" type="checkbox" ${small}></label><a href="#z" style="display:inline-block;inline-size:40px;block-size:40px">z</a>`,
    named: [],
  },
  {
    name: 'a visually hidden input is no target',
    html: `<input type="file" style="position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%)"><button id="b" ${small}></button>`,
    named: [],
  },
])('$name', async ({ html, named }) => {
  expect((await audit(html)).small).toEqual(named)
})

test('a page wider than the window is measured', async () => {
  expect((await audit('<div style="inline-size: 500px">wide</div>')).overflow).toBeGreaterThan(0)
  expect((await audit('<div>narrow</div>')).overflow).toBe(0)
})
