/**
 * The site's reading Blocks while their reads are not ready: a failed read is
 * a failure treatment, never busy-forever; a read on its way is busy; nothing
 * published is an empty treatment. Drawn through the site's own Renderer, as
 * the public page, the preview and the canvas draw them.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { NodeId, type Document } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { settingsOf } from 'foldkit-builder'
import { Image, SiteRenderer } from '../src/content/site.js'
import { Capability, Slot, SlotView, Slots } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'

const ProbeMessage = defineMessageUnion({ Ticked: {} })
type ProbeMessage = typeof ProbeMessage.Type
const ProbeSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })

interface ProbeInput {
  readonly block: string
  readonly props: Readonly<Record<string, Schema.Json>>
  readonly data: unknown
}

const NODE = NodeId.make('node-1')

const Probe = SlotView.define(
  ProbeSlots,
  (input: ProbeInput, slots, h: HtmlBuilder<ProbeMessage>) => {
    const document: Document = {
      format: 1 as const,
      roots: [NODE],
      nodes: { [NODE]: { block: input.block, props: input.props, regions: {} } },
    }
    return h.div(
      slots.root.attrs(),
      Renderer.render(SiteRenderer, document, h, { data: { [NODE]: input.data } }),
    )
  },
)

const draw = (block: string, props: ProbeInput['props'], data: unknown): Html =>
  Inert.draw(Probe, { block, props, data })

const failed = { _tag: 'Failed' as const, error: { _tag: 'ReadFailed', message: 'unreachable' } }
const loading = { _tag: 'Loading' as const }
const emptyPage = { _tag: 'Ready' as const, value: { items: [] as ReadonlyArray<never> } }

describe('the site’s reading Blocks', () => {
  it('says a failed PostList read as an alert, never as busy', () => {
    const root = draw('PostList', { heading: 'From the blog', count: 3 }, failed)
    expect(Inert.text(root)).toContain('The posts could not be read.')
    const [alert] = Inert.byRole(root, 'alert')
    expect(alert).toBeDefined()
    expect(Inert.value(alert, 'aria-busy')).toBe(undefined)
  })

  it('says a loading PostList read as busy, and an empty one as neither', () => {
    const busy = draw('PostList', { heading: '', count: 3 }, loading)
    expect(Inert.text(busy)).toContain('Loading posts…')
    expect(Inert.value(Inert.byRole(busy, 'status')[0], 'aria-busy')).toBe('true')
    const empty = draw('PostList', { heading: '', count: 3 }, emptyPage)
    expect(Inert.text(empty)).toContain('Nothing is published yet.')
    expect(Inert.value(Inert.byRole(empty, 'status')[0], 'aria-busy')).toBe(undefined)
  })

  it('says a failed featured post as an alert, never as busy-forever', () => {
    const root = draw('FeaturedPost', { post: 'post-1' }, failed)
    expect(Inert.text(root)).toContain('The featured post could not be read.')
    expect(Inert.byRole(root, 'alert')).toHaveLength(1)
  })

  it('asks for a featured post when none is chosen, without an alert', () => {
    const root = draw('FeaturedPost', { post: null }, failed)
    expect(Inert.text(root)).toContain('Choose a post to feature.')
    expect(Inert.byRole(root, 'alert')).toHaveLength(0)
  })

  it('says a failed LatestPages read as an alert, and an empty one as empty', () => {
    const bad = draw('LatestPages', { count: 3, except: null }, failed)
    expect(Inert.text(bad)).toContain('The pages could not be read.')
    expect(Inert.byRole(bad, 'alert')).toHaveLength(1)
    const none = draw('LatestPages', { count: 3, except: null }, emptyPage)
    expect(Inert.text(none)).toContain('Nothing yet.')
    expect(Inert.byRole(none, 'alert')).toHaveLength(0)
  })

  it('draws nothing when `except` leaves a non-empty list with nothing', () => {
    const one = {
      _tag: 'Ready' as const,
      value: { items: [{ id: 'a', label: 'A' }] },
    }
    // Leaving out is routine — every page carrying this list leaves out the
    // page it is on — so an emptied list draws nothing rather than claiming
    // there are no pages.
    const leftOut = draw('LatestPages', { count: 3, except: 'a' }, one)
    expect(Inert.text(leftOut)).not.toContain('A')
    expect(Inert.text(leftOut)).not.toContain('Nothing yet.')
    const kept = draw('LatestPages', { count: 3, except: null }, one)
    expect(Inert.text(kept)).toContain('A')
  })
})

describe('the site’s Image', () => {
  const desk = {
    key: '/images/desk.svg',
    width: 800,
    height: 600,
    alpha: false,
    hash: null,
    placeholder: null,
  }
  const ratioOf = (props: Readonly<Record<string, Schema.Json>>) =>
    Inert.style(
      Inert.byTag(draw('Image', { alt: 'A desk', caption: '', ...props }, null), 'img')[0],
    )['--image-ratio']

  it('keeps the box its facts give, while they are of the file it shows', () => {
    expect(ratioOf({ src: '/images/desk.svg', asset: desk })).toBe('800 / 600')
  })

  it.each([
    ['facts of an address it no longer shows', { src: '/images/meadow.svg', asset: desk }],
    ['no facts', { src: '/images/desk.svg' }],
  ])('keeps the 4:3 box for %s', (_, props) => {
    expect(ratioOf(props)).toBe(undefined)
  })

  it('keeps its facts out of the inspector, neither edited nor shown', () => {
    const settings = settingsOf(Image)
    expect(settings.shown({ src: '/images/desk.svg', asset: desk })).toEqual([])
    expect(Object.keys(settings.seed())).not.toContain('asset')
  })
})
