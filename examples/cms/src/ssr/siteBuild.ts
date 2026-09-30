/**
 * The site as the build renders it: what `staticSite` evaluates through its
 * server. Paths and configs come from the seed the visitors' sandboxes start
 * from, on the same server the sandbox runs; the template and head are the
 * build's own. `prerender.ts` keeps the same pieces composed for tests.
 */
import { Effect } from 'effect'
import { Remote } from 'foldkit-remote'
import type { SiteModule } from 'foldkit-ssr/vite'
import { ORIGIN } from '../content/domain.js'
import { answer } from '../server/endpoint.js'
import { openServer } from '../server/server.js'
import { memorySqlite } from '../server/sqlite-node.js'
import { remoteClient, type Send } from '../server/transport.js'
import { siteConfig } from '../content/siteConfig.js'
import * as Site from '../apps/siteApp.js'
import { listSitePaths, siteTemplate, stylesOf, urlAt } from './prerender.js'
import { plan } from './sitePlan.js'

/** The seeded backend the build lists and renders from, started once. */
const backend = (() => {
  let started: Promise<ReturnType<typeof openServer>> | undefined
  return () => {
    if (started === undefined) {
      const opened = openServer(() => new Date(), memorySqlite())
      started = opened.seed().then(() => opened)
    }
    return started
  }
})()

export const site = {
  origin: ORIGIN,
  paths: async () => listSitePaths(await backend()),
  config: async (path: string) => {
    const served = await backend()
    const send: Send = (chair, body) => answer(served, chair, JSON.parse(body))
    const remote = Remote.clientLayer(remoteClient(send, 'visitor'))
    const now = new Date()
    const prepared = await Effect.runPromise(
      Site.Data.satisfy(Site.initial(urlAt(path)).model, Site.actives, {
        now: () => now.getTime(),
      }).pipe(Effect.provide(remote)),
    )
    return siteConfig({
      initial: () =>
        Site.placements.initial({
          remote: prepared.remote,
          route: prepared.route,
          reader: prepared.reader,
        }),
      resources: remote,
      container: null,
    })
  },
  plan,
  template: (built: string) => siteTemplate(built),
  head: rendered => stylesOf(rendered.html),
  files: 'flat',
  sitemap: true,
  robots: true,
} satisfies SiteModule
