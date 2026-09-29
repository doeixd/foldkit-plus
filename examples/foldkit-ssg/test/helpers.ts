import { Effect } from 'effect'
import { Style } from 'foldkit-mixins'
import { SSR } from 'foldkit-ssr'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Model, init, plan, prerenderPaths, routing, update, view } from '../src/main.js'
import { stylesheet } from '../src/style.js'

/** The example's own `index.html`, which the build renders each page into. */
export const template = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8')

const head = (rendered: { readonly html: string }): string =>
  `<style>${stylesheet}</style><style>${Style.usedIn(rendered.html)}</style>`

/** Every page in `prerenderPaths`, rendered into `from` as build `buildId` saw it. */
export const generate = (from: string, buildId: string) =>
  Effect.runPromise(
    SSR.generate({ Model, init, update, view, container: null, routing }, plan, {
      buildId,
      template: from,
      origin: 'https://example.com',
      paths: prerenderPaths,
      head,
    }),
  )
