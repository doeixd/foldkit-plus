/**
 * The fixture site's browser entry: takes its page over. The plugin test
 * never runs this bundle (it resumes the built pages in jsdom instead); it
 * exists so the fixture is a real site Vite can build.
 */
/// <reference types="vite/client" />
import { FOLDKIT_APP_ATTRIBUTE, SSR } from 'foldkit-ssr/client'
import { Model, init, plan, routing, update, view } from './app.js'

const container =
  document.getElementById('root') ??
  document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`)
if (container === null) throw new Error('the fixture page has no #root and no rendered application')

SSR.hydrate({ Model, init, update, view, container, routing }, plan, {
  buildId: import.meta.env.FOLDKIT_BUILD_ID,
})
