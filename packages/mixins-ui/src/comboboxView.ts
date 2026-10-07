/**
 * Forked combobox views: the single and multi variants over the shared
 * transcription in `./comboboxShared.js`. Each `create` binds the upstream
 * bundle for the item type and swaps in only the view; state, Messages,
 * update, Commands, Mounts, and subscriptions stay upstream. If upstream
 * gains a seam, delete both modules; on a bump, re-transcribe and re-run
 * the battery.
 */
import { Option } from 'effect'
import * as UpstreamCombobox from '@foldkit/ui/combobox'
import type {
  Bundle as UpstreamSingleBundle,
  Model as SingleModel,
  ViewInputs as UpstreamSingleInputs,
} from '@foldkit/ui/combobox'
import type { Message } from '@foldkit/ui/combobox'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineView, type View as SubmodelView } from 'foldkit/submodel'
import {
  computeRender,
  type ComboboxGroupRender,
  type ComboboxHeadingRender,
  type ComboboxItemRender,
  type ComboboxRenderInfo,
  type NormalizedInputs,
} from './comboboxShared.js'

export type SharedViewInputs = NormalizedInputs<string> & {
  toView?: ((render: ComboboxRenderInfo) => Html) | undefined
}

export type SharedBehavior = Readonly<{ ariaMultiSelectable: boolean }>

/** Upstream's markup from the computed bundles: the default `toView`. */
export const defaultToView =
  (h: HtmlBuilder<Message>) =>
  (render: ComboboxRenderInfo): Html => {
    const drawItem = (item: ComboboxItemRender): Html =>
      h.keyed('div')(item.key, [...item.attributes], [item.content])
    const drawGroup = (group: ComboboxGroupRender): ReadonlyArray<Html> => {
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
    return h.div([...render.wrapper], [
      h.div([...render.inputWrapper], [
        h.input([...render.input]),
        ...(render.toggleButton === undefined
          ? []
          : [
              h.keyed('button')(
                render.toggleButton.key,
                [...render.toggleButton.attributes],
                [render.toggleButton.content],
              ),
            ]),
      ]),
      ...(render.backdrop === undefined
        ? []
        : [h.keyed('div')(render.backdrop.key, [...render.backdrop.attributes])]),
      ...(render.items === undefined
        ? []
        : [
            h.keyed('div')(
              render.items.key,
              [...render.items.attributes],
              render.scroll === undefined
                ? grouped
                : [h.div([...render.scroll], grouped)],
            ),
          ]),
      ...render.hiddenInputs,
    ])
  }

const makeSharedView = (behavior: SharedBehavior): SubmodelView<
  SingleModel,
  Message,
  SharedViewInputs
> => {
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

export type {
  ComboboxGroupRender,
  ComboboxHeadingRender,
  ComboboxItemRender,
  ComboboxRenderInfo,
}

/** Upstream single view inputs plus the seam. */
export type SingleViewInputs<Item extends string> = UpstreamSingleInputs<Item> &
  Readonly<{ toView?: (render: ComboboxRenderInfo) => Html }>

/** Upstream multi view inputs plus the seam. */
export type MultiViewInputs<Item extends string> =
  UpstreamCombobox.Multi.ViewInputs<Item> &
    Readonly<{ toView?: (render: ComboboxRenderInfo) => Html }>

type MultiModel = UpstreamCombobox.Multi.Model

type UpstreamMultiBundle<Item extends string> =
  UpstreamCombobox.Multi.Bundle<Item>

const singleViewImpl = defineView<SingleModel, Message, SingleViewInputs<string>>(
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
export type SingleBundle<Item extends string = string> = Omit<
  UpstreamSingleBundle<Item>,
  'view'
> & {
  readonly view: SubmodelView<SingleModel, Message, SingleViewInputs<Item>>
}

/** Pairs the forked single view with upstream's `update` and helpers. */
export const create = <Item extends string = string>(): SingleBundle<Item> => {
  const bound = UpstreamCombobox.create<Item>()
  return {
    ...bound,
    view: singleViewImpl as unknown as SubmodelView<
      SingleModel,
      Message,
      SingleViewInputs<Item>
    >,
  }
}

const multiViewImpl = defineView<MultiModel, Message, MultiViewInputs<string>>(
  (model, { toView, ...rest }, h) =>
    multiShared(
      model as unknown as SingleModel,
      { ...rest, toView },
      h,
    ),
)

/** Upstream multi `Bundle` with the forked `view`. */
export type MultiBundle<Item extends string = string> = Omit<
  UpstreamMultiBundle<Item>,
  'view'
> & {
  readonly view: SubmodelView<MultiModel, Message, MultiViewInputs<Item>>
}

/** Pairs the forked multi view with upstream's `update` and helpers. */
export const Multi = {
  create: <Item extends string = string>(): MultiBundle<Item> => {
    const bound = UpstreamCombobox.Multi.create<Item>()
    return {
      ...bound,
      view: multiViewImpl as unknown as SubmodelView<
        MultiModel,
        Message,
        MultiViewInputs<Item>
      >,
    }
  },
}
