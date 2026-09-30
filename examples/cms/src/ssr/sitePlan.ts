/**
 * How the browser takes over a site page the build rendered
 * (`foldkit-ssr/client`, which carries no server renderer).
 */
import { Remote } from 'foldkit-remote'
import { SSR } from 'foldkit-ssr/client'
import { Projection } from 'foldkit-surface'
import type { siteConfig } from '../content/siteConfig.js'
import * as Site from '../apps/siteApp.js'
import { metaOf } from './siteMeta.js'

/**
 * How a page the build rendered is taken over in the browser (`foldkit-ssr`):
 * the route and the reader cross as they are, and Remote sends what the
 * page's reads hold, so the browser asks for none of it again.
 */
export const plan = SSR.plan(
  {
    owner: Site.App.owner,
    Message: Site.Message,
    // What crosses replaces the route and the reader; the rest starts here.
    initial: Site.placements.initial({
      remote: Remote.initial,
      route: { _tag: 'Blog' },
      reader: 'visitor',
    }).model,
  },
  {
    id: 'site',
    state: Projection.pick(Site.App.model.route, Site.App.model.reader),
    surfaces: Object.values(Site.actives),
    parts: [Remote.resume(Site.Data)],
    // Read from the route and Remote's reads, both of which cross.
    meta: metaOf,
  },
)

/** Takes the page over from what it carries, asking the server for none of it again. */
export const takeOver = (config: ReturnType<typeof siteConfig<HTMLElement>>, buildId: string) =>
  SSR.hydrate(config, plan, { buildId })
