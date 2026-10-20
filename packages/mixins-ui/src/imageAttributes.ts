import { Option } from 'effect'
import type { Picture } from 'foldkit-media'
import type { Attribute, HtmlBuilder } from 'foldkit/html'

/** An `img`'s candidates, box and loading, as `Picture.derive` gives them: shared by every view that draws one. */
export const imgAttributes = <Message>(
  img: Picture.Img,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Attribute<Message>> => [
  h.Loading(img.loading),
  ...Option.match(img.decoding, { onNone: () => [], onSome: value => [h.Decoding(value)] }),
  ...Option.match(img.fetchPriority, {
    onNone: () => [],
    onSome: value => [h.Fetchpriority(value)],
  }),
  h.Sizes(img.sizes),
  h.Srcset(img.srcset),
  h.Src(img.src),
  h.Width(String(img.width)),
  h.Height(String(img.height)),
]
