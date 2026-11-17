// @vitest-environment jsdom
/**
 * The field rendered on a server, as a browser parses it: a file input that
 * the trigger labels, named so a form submitted before the page hydrates
 * carries the files, and the markup unchanged by the parse.
 */
import { Effect } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { expect, test } from 'vitest'
import * as FileInput from '../src/fileInput.js'
import { message, type TestMessage } from './fixture.js'

test('a served field parses back to a named file input, its label and its rows', async () => {
  const served = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: {} }),
        view: (_: object, h: HtmlBuilder<TestMessage>) => ({
          title: 'Apply',
          body: FileInput.view(
            {
              id: 'cv',
              label: 'Attach a resume',
              files: [new File(['a'], 'resume.pdf')],
              onChange: () => message('Other'),
              onRemove: () => message('Clicked'),
              name: 'attachments',
              accept: ['.pdf'],
              multiple: true,
              required: true,
              description: 'Up to 5 MB',
            },
            h,
          ),
        }),
      },
      { buildId: 'b' },
    ),
  )
  const page = new DOMParser().parseFromString(
    injectIntoTemplate(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      served,
    ),
    'text/html',
  )
  const input = page.querySelector('input')
  expect(input?.getAttribute('type')).toBe('file')
  expect(input?.getAttribute('name')).toBe('attachments')
  expect(input?.getAttribute('accept')).toBe('.pdf')
  expect(input?.hasAttribute('multiple')).toBe(true)
  expect(input?.hasAttribute('required')).toBe(true)
  expect(input?.getAttribute('aria-describedby')).toBe('cv-description')
  expect(page.querySelector('label')?.getAttribute('for')).toBe(input?.id)
  expect(page.querySelector('li button')?.getAttribute('aria-label')).toBe('Remove resume.pdf')
})
