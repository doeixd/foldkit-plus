// @vitest-environment node
/**
 * What a page drawing FileUpload without uploads or sorting must not load: the
 * Progress widget, Reorder and its pointer drag, FocusRecovery, and the media
 * package's browser upload. Each is a value the application imports and passes
 * in (`FileUploadProgress`, `FileUploadSort`), so the main module and its
 * recipe may import none of them, even for a type.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

const specifiers = (file: string): ReadonlyArray<string> =>
  Array.from(
    readFileSync(resolve(import.meta.dirname, file), 'utf8').matchAll(
      /^(?:import|export)\s[^;]*?from\s+'([^']+)'/gm,
    ),
    match => match[1] ?? '',
  )

const forbidden = /progress|reorder|pointer-drag|focus-recovery|foldkit-media|foldkit-primitives/

test.each(['../src/fileUpload.ts', '../src/recipes/fileUpload.ts'])(
  '%s imports no module a field without uploads or sorting must not load',
  file => {
    const found = specifiers(file).filter(specifier => forbidden.test(specifier))
    // Only the progress module's type, which the compiler erases, is named.
    expect(found.filter(specifier => specifier !== './fileUpload/progress.js')).toEqual([])
  },
)

test('the progress and sort modules are the only ones that load their widgets', () => {
  expect(specifiers('../src/fileUpload/progress.ts')).toContain('../progress.js')
  expect(specifiers('../src/fileUpload/sort.ts')).toContain('foldkit-primitives/interaction')
})

test('fileUpload.ts names the progress module as a type only', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/fileUpload.ts'), 'utf8')
  expect(source).toMatch(/^import type \{ Progress \} from '\.\/fileUpload\/progress\.js'/m)
})
