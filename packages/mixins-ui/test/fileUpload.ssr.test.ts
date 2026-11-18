// @vitest-environment jsdom
/**
 * The field rendered on a server, as a browser parses it: a file input that
 * the picker labels, named, typed and counted so a form submitted before the
 * page hydrates is right, a stored file listed, and the markup unchanged by the parse.
 */
import { Effect } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { expect, test } from 'vitest'
import * as FileUpload from '../src/fileUpload.js'
import { message, type TestMessage } from './fixture.js'

test('a served field parses back to a named file input, its picker, its stored rows and its status', async () => {
  const model = FileUpload.init({
    id: 'up',
    multiple: true,
    accept: ['.pdf', 'image/*'],
    maxFiles: 3,
    initial: [{ id: 's1', name: 'cv.pdf', size: 1536, type: 'application/pdf', url: '/cv.pdf' }],
  })
  const served = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: {} }),
        view: (_: object, h: HtmlBuilder<TestMessage>) => ({
          title: 'Apply',
          body: FileUpload.view(
            {
              model,
              onMessage: () => message('Clicked'),
              label: 'Attach files',
              name: 'attachments',
              required: true,
              description: 'PDFs or images',
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
  expect(input?.getAttribute('accept')).toBe('.pdf,image/*')
  expect(input?.hasAttribute('multiple')).toBe(true)
  expect(input?.hasAttribute('required')).toBe(true)
  expect(input?.getAttribute('aria-describedby')).toBe('up-description up-constraints')
  expect(input?.nextElementSibling?.tagName).toBe('LABEL')
  expect(page.querySelector('label')?.getAttribute('for')).toBe(input?.id)
  expect(page.querySelector('li [title]')?.textContent).toBe('cv.pdf')
  expect(page.querySelector('li button')?.getAttribute('aria-label')).toBe('Remove cv.pdf')
  expect(page.querySelector('[role="status"]')).not.toBeNull()
})
