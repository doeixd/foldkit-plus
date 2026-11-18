import { Option } from 'effect'
import { SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as UiProgress from '../progress.js'
import { Status, type Entry } from '../fileUpload.js'

/**
 * How a FileUpload draws an uploading entry: a `Progress` bar or ring, built by
 * the application and handed to the view as `progress`. It lives in a module of
 * its own so a field that sends nothing never loads the Progress widget.
 */
export interface Progress {
  /** One entry's progress, named by `label` and read as `loaded` of `total`. */
  readonly draw: <Outer>(
    options: { readonly id: string; readonly entry: Entry; readonly label: string },
    h: HtmlBuilder<Outer>,
  ) => Html
}

const Slots = SlotView.over(UiProgress.ProgressSlots)<undefined, never>()

// The label names the bar for readers of the screen; a sighted reader has the
// row's own words, so it is out of sight and still in the accessibility tree.
const unseen = Slots.behavior(
  {
    label: {
      attributes: ({ h }) => [
        h.Style({
          position: 'absolute',
          inlineSize: '1px',
          blockSize: '1px',
          margin: '-1px',
          padding: '0',
          overflow: 'hidden',
          clipPath: 'inset(50%)',
          whiteSpace: 'nowrap',
          border: '0',
        }),
      ],
    },
  },
  { name: 'FileUploadProgressLabel' },
)

/** `style` is a style of `ProgressSlots`: `Recipes.Progress({})` for a bar, `{ shape: 'ring' }` for a ring. */
export const make = (
  options: { readonly style?: NamedStyle<typeof UiProgress.ProgressSlots> | undefined } = {},
): Progress => ({
  draw: ({ id, entry, label }, h) => {
    const { loaded, total } = Status.matchOrElse(
      entry.status,
      { Uploading: uploading => uploading },
      () => ({ loaded: 0, total: entry.size }),
    )
    return UiProgress.view(
      {
        id,
        label,
        value: Option.some(loaded),
        max: total,
        style: options.style,
        mixins: [unseen.mixin],
      },
      h,
    )
  },
})
