/**
 * `foldkit-composition/surface`: Blocks that show a feature.
 *
 * A Surface-backed Block places a `foldkit-surface` Surface, such as a cart
 * summary, where an author puts it, with params its props give. The Surface
 * still owns what it reads and which Messages it may send; the Block only
 * chooses where the feature appears and with which params.
 *
 * `SurfaceBlock.reads(catalog, document)` is every Surface Block on the page as
 * one Projection over the Model, keyed by node, and `SurfaceBlock.active` is it
 * as an active Surface, so whatever the Surfaces read is fetched, and resumed
 * under SSR, as their own reads are. The Renderer hands each node its value as
 * `data`, and the Block's `value(data)` reads it typed.
 *
 * The Block holds its Surface, whose type carries the application's Model. Where
 * the Catalog is itself part of that Model, as it is when a form places the
 * page Builder, that is circular: a Block there names what it reads, as a
 * Query Block does, rather than holding it.
 */
import { Option, type Schema } from 'effect'
import { Metadata } from 'foldkit-metadata'
import { Projection, Surface, type ActiveSurface } from 'foldkit-surface'
import { Block, type AnyBlock } from '../block.js'
import { Catalog } from '../catalog.js'
import type { Content } from '../content.js'
import { index, type Document } from '../document.js'
import type { Region } from '../region.js'

/** The page's reads as an active Surface, whose Projection says what it reads: each node's value. */
export interface PageReads<AppModel> extends ActiveSurface<AppModel> {
  readonly projectionOf: (
    model: AppModel,
  ) => Option.Option<Projection<AppModel, Readonly<Record<string, unknown>>>>
  /**
   * Each node's value by node id, as a Renderer's `data` takes it: what the
   * Model holds of the page's reads, and nothing while it is inactive.
   */
  readonly data: (model: AppModel) => Readonly<Record<string, unknown>>
}

/** A page's reads as a Renderer's `data`: each node's value, or nothing while inactive. */
export const dataOf =
  <AppModel>(
    projectionOf: (
      model: AppModel,
    ) => Option.Option<Projection<AppModel, Readonly<Record<string, unknown>>>>,
  ) =>
  (model: AppModel): Readonly<Record<string, unknown>> =>
    Option.match(projectionOf(model), { onNone: () => ({}), onSome: reads => reads.read(model) })

/** What a Surface Block reads, from its decoded props. */
interface Read {
  readonly surface: Surface<unknown, unknown, unknown, unknown>
  readonly params: (props: unknown) => unknown
}

const readKey = Metadata.key<Read>('foldkit-composition/surface', {
  merge: reads => reads.slice(-1),
  summarize: read => read.surface.name,
})

/** A Block that shows a Surface's feature. */
export type SurfaceBlock<
  Name extends string,
  Props extends Schema.Top,
  Regions extends Readonly<Record<string, Region>>,
  Model,
> = Block<Name, Props, Regions> & {
  /** A node's Surface Model, from the `data` a Renderer hands its view; none without it. */
  readonly value: (data: unknown) => Option.Option<Model>
}

export const SurfaceBlock = {
  /** A Block showing `surface`, with the params `params` makes of its props. */
  define: <
    const Name extends string,
    Props extends Schema.Top,
    Root,
    Model,
    Message,
    Params,
    const Regions extends Readonly<Record<string, Region>> = {},
  >(
    name: Name,
    config: {
      readonly Props: Props
      readonly regions?: Regions
      readonly provides: ReadonlyArray<Content>
      readonly surface: Surface<Root, Model, Message, Params>
      readonly params: (props: Props['Type']) => Params
    },
  ): SurfaceBlock<Name, Props, Regions, Model> => {
    const block = Block.define(name, {
      Props: config.Props,
      ...(config.regions === undefined ? {} : { regions: config.regions }),
      provides: config.provides,
    }).pipe(
      Block.annotate(
        readKey.of({
          // Read back only by `reads`, with this Block's decoded props.
          surface: config.surface as Surface<unknown, unknown, unknown, unknown>,
          params: config.params as (props: unknown) => unknown,
        }),
      ),
    )
    return Object.freeze({
      ...block,
      pipe: block.pipe,
      // The Renderer hands a node what `reads` read for it, which is this Surface's Model.
      value: (data: unknown) => Option.fromUndefinedOr(data as Model | undefined),
    })
  },

  /**
   * Every Surface Block on the page as one Projection over the Model, keyed by
   * node id; none when the page has none. A node whose props do not decode, or
   * whose Block the Catalog lacks, reads nothing.
   */
  reads: <Root>(
    catalog: Catalog,
    document: Document,
  ): Option.Option<Projection<Root, Readonly<Record<string, unknown>>>> => {
    const entries: Record<string, Projection<Root, unknown>> = {}
    for (const id of index(document).keys()) {
      const node = document.nodes[id]
      const block: AnyBlock | undefined =
        node === undefined ? undefined : Catalog.block(catalog, node.block)
      const [read] = block === undefined ? [] : readKey.get(block.metadata)
      if (node === undefined || block === undefined || read === undefined) continue
      const props = Block.decode(block, node.props)
      if (props._tag === 'Failure') continue
      // The Surface is over this application's Model.
      entries[id] = read.surface.projection(read.params(props.success)) as Projection<Root, unknown>
    }
    return Object.keys(entries).length === 0
      ? Option.none()
      : Option.some(
          Projection.struct(entries) as Projection<Root, Readonly<Record<string, unknown>>>,
        )
  },

  /**
   * The page's Surface Blocks as an active Surface of the application `owner`
   * (`App.owner`), for `Data.wiring`, `Data.subscriptions` or an SSR plan's
   * `surfaces`: active while `documentOf` gives a page, and may send what each
   * Surface lists. A Surface of another application is refused here.
   */
  active: <Root>(
    name: string,
    owner: object,
    catalog: Catalog,
    documentOf: (model: Root) => Option.Option<Document>,
  ): PageReads<Root> => {
    const surfaces = catalog.blocks
      .flatMap(block => readKey.get(block.metadata))
      .map(read => read.surface)
    const foreign = surfaces.find(surface => surface.owner !== owner)
    if (foreign !== undefined)
      throw new Error(
        `SurfaceBlock.active: "${foreign.name}" belongs to another application than "${name}"`,
      )
    // The reads change only with the page, not with every Model the page is in.
    const byDocument = new WeakMap<Document, ReturnType<typeof SurfaceBlock.reads<Root>>>()
    const projectionOf = (model: Root) =>
      Option.flatMap(documentOf(model), document => {
        const known = byDocument.get(document)
        if (known !== undefined) return known
        const reads = SurfaceBlock.reads<Root>(catalog, document)
        byDocument.set(document, reads)
        return reads
      })
    return {
      name,
      owner,
      // What the features on a page may send, as each Surface lists it.
      messages: [...new Set(surfaces.flatMap(surface => Surface.at(surface, undefined).messages))],
      projectionOf,
      data: dataOf(projectionOf),
    }
  },
}
