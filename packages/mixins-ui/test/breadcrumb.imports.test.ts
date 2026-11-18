// @vitest-environment node
/**
 * What a page drawing a Breadcrumb without a Menu must not load: Menu. A trail
 * that opens a Menu is given `BreadcrumbMenu.make(...)`, so the trail and its
 * recipe import Menu for a type at most, which the compiler erases.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

const imports = (file: string): ReadonlyArray<{ readonly type: boolean; readonly from: string }> =>
  Array.from(
    readFileSync(resolve(import.meta.dirname, file), 'utf8').matchAll(
      /^(import|export)(\s+type)?\s[^;]*?from\s+'([^']+)'/gm,
    ),
    match => ({ type: match[2] !== undefined, from: match[3] ?? '' }),
  )

test.each(['../src/breadcrumb.ts', '../src/recipes/breadcrumb.ts'])(
  '%s imports Menu for a type only',
  file => {
    const menus = imports(file).filter(entry => /(^|\/)menu(\.js)?$/.test(entry.from))
    expect(menus.filter(entry => !entry.type)).toEqual([])
  },
)

test('the menu collapse is the module that loads Menu', () => {
  expect(imports('../src/breadcrumb/menu.ts')).toContainEqual({ type: false, from: '../menu.js' })
})
