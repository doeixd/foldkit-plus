/**
 * `SSR.unbound` lets a Slot's attributes into a static region, and throws on
 * anything in them that dispatches a Message.
 */
import { Effect } from 'effect'
import { inertHtml, type Attribute, type ChildAttribute, type HtmlBuilder } from 'foldkit/html'
import { expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { config, Message, plan, type Model } from './staticFixture.js'

/** The page's HTML, its post's title drawn in a region with the attributes `slot` gives. */
const served = (
  slot: (h: HtmlBuilder<Message>) => ReadonlyArray<Attribute<Message> | ChildAttribute>,
) =>
  Effect.runPromise(
    SSR.render(
      {
        ...config,
        view: (model: Model, h: HtmlBuilder<Message>) => ({
          title: 'Post',
          body: h.main(
            [],
            [SSR.static('post-copy', ih => [ih.h1(SSR.unbound(slot(h)), [model.post.title])])],
          ),
        }),
      },
      plan,
      { buildId: 'b' },
    ),
  ).then(page => page.rendered.html)

it('draws attributes that bind nothing as they are', async () => {
  const html = await served(h => [
    h.Class('hero'),
    h.AriaLabel('Greeting'),
    h.DataAttribute('slot', 'hero'),
  ])
  expect(html).toContain('<h1 aria-label="Greeting" data-slot="hero" class="hero">Hello</h1>')
})

it.each([
  ['OnClick', (h: HtmlBuilder<Message>) => h.OnClick(Message.Liked())],
  ['OnInput', (h: HtmlBuilder<Message>) => h.OnInput(() => Message.Liked())],
])('throws on %s, naming it', async (tag, handler) => {
  await expect(served(h => [h.Class('hero'), handler(h)])).rejects.toThrow(`given ${tag}`)
})

it("throws on a Submodel's attribute", async () => {
  // As Foldkit's `childAttributes` makes one, which needs a running Submodel.
  const child: ChildAttribute = {
    __childAttribute: true,
    attribute: inertHtml.Class('picked'),
    dispatch: () => {},
    resolveUnmount: () => () => {},
    boundaryMappers: [],
  }
  await expect(served(() => [child])).rejects.toThrow("a Submodel's attribute")
})
