/**
 * Checks the built richtext packages the way a consumer meets them: through each
 * package's `exports` map, from `dist`. Everything inside this workspace resolves
 * those packages from source, so nothing else would catch a wrong `exports` path
 * or a missing file. Run `pnpm build` first, then `pnpm --filter
 * foldkit-mixins-richtext smoke`.
 */
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const checks = []
const check = (name, ok) => checks.push([name, ok])

const richtext = await import('foldkit-richtext')
check('richtext', typeof richtext.run === 'function' && typeof richtext.marksInRange === 'function')

const interpreter = await import('foldkit-richtext-dom')
check('richtext-dom (interpreter)', typeof interpreter.mount === 'function')

const host = await import('foldkit-richtext-dom/host')
check(
  '/host',
  typeof host.mountInto === 'function' &&
    typeof host.attachmentIn === 'function' &&
    typeof host.placeRendering === 'function' &&
    typeof host.renderingFor === 'function',
)

const events = await import('foldkit-richtext-dom/events')
check('/events', typeof events.attach === 'function' && typeof events.intentFor === 'function')

const html = await import('foldkit-richtext-dom/html')
check('/html', typeof html.parseHtml === 'function')

const view = await import('foldkit-richtext-dom/view')
check('/view', typeof view.renderDocument === 'function' && typeof view.renderBlocks === 'function')

const toolbar = await import('foldkit-richtext-dom/toolbar')
check(
  '/toolbar',
  typeof toolbar.marksToolbar === 'function' && typeof toolbar.markActive === 'function',
)

const editor = await import('foldkit-richtext-dom/editor')
check(
  '/editor',
  typeof editor.toMessage === 'function' &&
    typeof editor.attachEditor === 'function' &&
    typeof editor.events === 'function' &&
    typeof editor.patchEditor === 'function',
)

const bundle = await import('foldkit-richtext-dom/editor-bundle')
check(
  '/editor-bundle',
  typeof bundle.editorAt === 'function' &&
    typeof bundle.update === 'function' &&
    typeof bundle.edited === 'function',
)

const family = await import('foldkit-mixins-richtext')
check(
  'mixins-richtext',
  typeof family.markToolbar === 'function' && typeof family.MarkToolbarSlots === 'object',
)

// One real transaction, not just an export probe: a wrong shape N exported would
// still import.
const document = richtext.decodeDocument({
  version: 1,
  children: [
    { type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 'a', text: 'ab', marks: [] }] },
  ],
})
const at = offset => ({ node: richtext.NodeId.make('a'), offset, affinity: 'after' })
const result = richtext.run(
  { document, selection: { type: 'Range', anchor: at(2), focus: at(2) } },
  { type: 'InsertText', text: '!' },
  { mint: () => 'new-1' },
)
check(
  'a transaction through the build',
  result.ok && result.state.document.children[0].children[0].text === 'ab!',
)
check('marksInRange through the build', richtext.marksInRange(document, null).size === 0)

// The rendering registry is the newest public surface, so exercise it rather than
// just importing it.
const linked = richtext.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p2',
      children: [
        {
          type: 'Text',
          id: 'b',
          text: 'docs',
          marks: [{ name: 'Link', props: { href: '/x?a=1&b=2' } }],
        },
      ],
    },
  ],
})
const renderer = richtext.rendering({
  marks: {
    Link: mark => ({
      tag: 'a',
      attributes: { href: String(richtext.markProps(mark)?.href ?? '') },
    }),
  },
})
check(
  'a declared mark renders through the build',
  richtext.documentToHtml(linked, renderer) === '<p><a href="/x?a=1&amp;b=2">docs</a></p>',
)
check(
  'the name fallback survives the build',
  richtext.documentToHtml(linked) === '<p><span data-marks="Link">docs</span></p>',
)

// §122: a registry placed for a host id is what the editor mount reads back, and
// the recorded identity is the registry itself, not a copy of it.
host.placeRendering('smoke-placed', renderer)
check('a registry placed for a host id', host.renderingFor('smoke-placed') === renderer)
check('the default for an unplaced id', host.renderingFor('smoke-none') === richtext.noRendering)

const consumer = fileURLToPath(new URL('./consumer.ts', import.meta.url))
let types = true
try {
  execSync(
    `pnpm exec tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --lib es2022,dom "${consumer}"`,
    { stdio: 'pipe' },
  )
} catch {
  types = false
}
check('the types conditions', types)

for (const [name, ok] of checks) console.log(`${ok ? 'ok   ' : 'FAIL '}${name}`)
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
