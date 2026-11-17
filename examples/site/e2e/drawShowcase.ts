/** The browser's half of `parity.e2e.ts`: each showcase drawn by the runtime, compared with what the server wrote. */
import { Schema } from 'effect'
import * as Runtime from 'foldkit/runtime'

import { previewOf } from './showcaseView.js'

// What a Mount or a measurement adds after the first draw (`style`, `data-*`, `tabindex`, `popover`)
// is no mismatch; the elements, their ids, classes, roles and ARIA are what hydration matches.
const KEPT = /^(id|class|role|aria-.*|href|type|name|for|dir)$/

const signature = (root: Element): Array<string> =>
  [root, ...root.querySelectorAll('*')].map(element =>
    [
      element.tagName,
      ...Array.from(element.attributes)
        .filter(attribute => KEPT.test(attribute.name))
        .map(attribute => `${attribute.name}=${attribute.value}`)
        .sort(),
    ].join(' '),
  )

/** The slugs whose drawn markup differs from the served, each with the first element that does. */
export const differing = async (
  pages: ReadonlyArray<readonly [slug: string, html: string]>,
): Promise<Array<string>> => {
  const found: Array<string> = []
  for (const [slug, html] of pages) {
    const served = new DOMParser().parseFromString(html, 'text/html').body
    const container = document.createElement('div')
    container.id = `parity-${slug}`
    document.body.append(container)
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model: Schema.Struct({}),
        container,
        init: () => ({ model: {} }),
        update: model => ({ model }),
        view: previewOf(slug),
      }),
    )
    await new Promise(resolve => setTimeout(resolve, 300))
    // The runtime replaces its container with what it draws.
    const last = document.body.lastElementChild
    const drawn = last?.id === container.id ? last.firstElementChild : last
    const a = signature(served.firstElementChild ?? served)
    const b = drawn === null ? [] : signature(drawn)
    const at = a.findIndex((item, index) => item !== b[index])
    if (at !== -1 || a.length !== b.length)
      found.push(`${slug}: at ${at} served ${a[at] ?? '(none)'} | drawn ${b[at] ?? '(none)'}`)
    handle.dispose()
    document.body.replaceChildren()
  }
  return found
}
