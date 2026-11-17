import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, SegmentedSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import * as Fields from '../fields.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import { fields } from '../previewShared.js'
import type { Live } from '../showcase.js'

const segmentedBasic = <Message>(style: NamedStyle<typeof SegmentedSlots>, live: Live<Message>) =>
  Snippet.segmented(
    style,
    live.widgets.range,
    range => live.onWidget(Widgets.Message.ChoseRange({ range })),
    live.direction,
    live.h,
  )

const segmentedIcons =
  (iconOnly: boolean) =>
  <Message>(style: NamedStyle<typeof SegmentedSlots>, live: Live<Message>) =>
    Snippet.segmentedIcons(
      style,
      live.widgets.viewMode,
      mode => live.onWidget(Widgets.Message.ChoseViewMode({ mode })),
      iconOnly,
      live.direction,
      live.h,
    )

export const showcase = fromRecipe(
  about('segmented'),
  SegmentedSlots,
  Recipes.Segmented,
  segmentedBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: segmentedBasic },
    { name: 'icons', title: 'Icons', draw: segmentedIcons(false) },
    { name: 'icon-only', title: 'Icons alone', draw: segmentedIcons(true) },
    {
      name: 'sizes',
      title: 'Sizes',
      draw: (_style, live) =>
        Snippet.segmentedSizes(
          live.widgets.range,
          range => live.onWidget(Widgets.Message.ChoseRange({ range })),
          live.direction,
          live.h,
        ),
    },
    {
      name: 'multiple',
      title: 'Several at once',
      draw: (style, live) =>
        Snippet.segmentedMultiple(
          style,
          live.widgets.fields.repeatOn,
          day => fields(live, Fields.Message.ToggledDay({ day })),
          live.h,
        ),
    },
    {
      name: 'full',
      title: 'Full width',
      // As wide as the box it is in, which here is the preview's width.
      draw: (style, live) =>
        live.h.div(
          [live.h.Style({ inlineSize: 'min(28rem, 100%)' })],
          [segmentedBasic(style, live)],
        ),
      pins: { width: 'fill' },
    },
    { name: 'underline', title: 'Underline', draw: segmentedBasic, pins: { tray: 'underline' } },
  ],
)
