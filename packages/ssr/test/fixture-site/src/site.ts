/**
 * The site description the `staticSite` plugin evaluates: the fixture's
 * config and plan, two pages, the built shell untouched, and per-page
 * styles for the first paint.
 */
import { config, plan } from './app.js'

export const site = {
  config,
  plan,
  buildId: 'fixture-build',
  origin: 'https://fixture.test',
  paths: ['/', '/about'],
  head: () => '<style>.fixture-first-paint{color:#123456}</style>',
  sitemap: true,
  robots: true,
}
