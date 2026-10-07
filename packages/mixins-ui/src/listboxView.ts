/**
 * Forked listbox views: the single and multi variants over the shared
 * transcription in `./listboxShared.js`. Each `create` binds the upstream
 * bundle for the item/value pair and swaps in only the view; state,
 * Messages, update, Commands, Mounts, and subscriptions stay upstream.
 */
import { Option } from 'effect'
import * as UpstreamListbox from '@foldkit/ui/listbox'
import type {
  Bundle as UpstreamSingleBundle,
  Model as SingleModel,
  ViewInputs as UpstreamSingleInputs,
} from '@foldkit/ui/listbox'
import type { Message } from '@foldkit/ui/listbox'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineView, type View as SubmodelView } from 'foldkit/submodel'
import {
  computeRender,
  type ListboxGroupRender,
  type ListboxHeadingRender,
  type ListboxItemRender,
  type ListboxRenderInfo,
  type NormalizedInputs,
  type SharedBehavior,
  type SharedViewInputs,
} from './listboxShared.js'

export type { ListboxGroupRender, ListboxHeadingRender, ListboxItemRender, ListboxRenderInfo }

/** Upstream's markup from the computed bundles: the default `toView`. */
export const defaultToView =
  (h: HtmlBuilder<Message>) =>
  (render: ListboxRenderInfo): Html => {
    const drawItem = (item: ListboxItemRender): Html =>
      h.keyed('div')(item.key, [...item.attributes], [item.content])
    const drawGroup = (group: ListboxGroupRender): ReadonlyArray<Html> => {
      const drawn = group.items.map(drawItem)
      if (group.group === undefined) return drawn
      const headed: ReadonlyArray<Html> =
        group.heading === undefined
          ? []
          : [
              h.keyed('div')(
                group.heading.id,
                [...group.heading.attributes],
                [group.heading.content],
              ),
            ]
      const grouped = h.keyed('div')(
        group.group.key,
        [...group.group.attributes],
        [...headed, ...drawn],
      )
      return [
        ...(group.separator === undefined
          ? []
          : [h.keyed('div')(group.separator.key, [...group.separator.attributes])]),
        grouped,
      ]
    }
    const grouped = render.groups.flatMap(drawGroup)
    return h.div(
      [...render.wrapper],
      [
        h.keyed('button')(`${render.id}-button`, [...render.button], [render.buttonContent]),
        ...render.hiddenInputs,
        ...(render.backdrop === undefined
          ? []
          : [h.keyed('div')(render.backdrop.key, [...render.backdrop.attributes])]),
        ...(render.items === undefined
          ? []
          : [
              h.keyed('div')(
                render.items.key,
                [...render.items.attributes],
                render.scroll === undefined ? grouped : [h.div([...render.scroll], grouped)],
              ),
            ]),
      ],
    )
  }

const makeSharedView = (
  behavior: SharedBehavior,
): SubmodelView<SingleModel, Message, SharedViewInputs> => {
  const view = (
    model: SingleModel,
    viewInputs: SharedViewInputs,
    h: HtmlBuilder<Message>,
  ): Html => {
    const render = computeRender(model, viewInputs, h, behavior)
    return (viewInputs.toView ?? defaultToView(h))(render)
  }
  return defineView<SingleModel, Message, SharedViewInputs>(view)
}

const singleShared = makeSharedView({ ariaMultiSelectable: false })
const multiShared = makeSharedView({ ariaMultiSelectable: true })

/** Upstream single view inputs plus the seam. */
export type SingleViewInputs<
  Item = string,
  Value extends string = Item extends string ? Item : string,
> = UpstreamSingleInputs<Item, Value> & Readonly<{ toView?: (render: ListboxRenderInfo) => Html }>

/** Upstream multi view inputs plus the seam. */
export type MultiViewInputs<
  Item = string,
  Value extends string = Item extends string ? Item : string,
> = UpstreamListbox.Multi.ViewInputs<Item, Value> &
  Readonly<{ toView?: (render: ListboxRenderInfo) => Html }>

type MultiModel = UpstreamListbox.Multi.Model

type UpstreamMultiBundle<Item, Value extends string> = UpstreamListbox.Multi.Bundle<Item, Value>

const singleViewImpl = defineView<SingleModel, Message, SingleViewInputs<unknown, string>>(
  (model, { maybeSelectedValue, toView, ...baseInputs }, h) =>
    singleShared(
      model,
      {
        ...baseInputs,
        selectedValues: Option.toArray(maybeSelectedValue),
        toView,
      },
      h,
    ),
)

/** Upstream single `Bundle` with the forked `view`. */
export type SingleBundle<
  Item = string,
  Value extends string = Item extends string ? Item : string,
> = Omit<UpstreamSingleBundle<Item, Value>, 'view'> & {
  readonly view: SubmodelView<SingleModel, Message, SingleViewInputs<Item, Value>>
}

/** Pairs the forked single view with upstream's `update` and helpers. */
export const create = <
  Item = string,
  Value extends string = Item extends string ? Item : string,
>(): SingleBundle<Item, Value> => {
  const bound = UpstreamListbox.create<Item, Value>()
  return {
    ...bound,
    view: singleViewImpl as unknown as SubmodelView<
      SingleModel,
      Message,
      SingleViewInputs<Item, Value>
    >,
  }
}

const multiViewImpl = defineView<MultiModel, Message, MultiViewInputs<unknown, string>>(
  (model, { toView, ...rest }, h) =>
    multiShared(model as unknown as SingleModel, { ...rest, toView }, h),
)

/** Upstream multi `Bundle` with the forked `view`. */
export type MultiBundle<
  Item = string,
  Value extends string = Item extends string ? Item : string,
> = Omit<UpstreamMultiBundle<Item, Value>, 'view'> & {
  readonly view: SubmodelView<MultiModel, Message, MultiViewInputs<Item, Value>>
}

/** Pairs the forked multi view with upstream's `update` and helpers. */
export const Multi = {
  create: <
    Item = string,
    Value extends string = Item extends string ? Item : string,
  >(): MultiBundle<Item, Value> => {
    const bound = UpstreamListbox.Multi.create<Item, Value>()
    return {
      ...bound,
      view: multiViewImpl as unknown as SubmodelView<
        MultiModel,
        Message,
        MultiViewInputs<Item, Value>
      >,
    }
  },
}
