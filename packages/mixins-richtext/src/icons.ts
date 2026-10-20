/**
 * The rich text chrome's icons: line drawings on a 24-unit grid, stroked in the text's color, so
 * every toolbar, menu and card draws from one set. Decorative: each is hidden from assistive
 * technology, and the control it sits in carries the name that is read.
 *
 * The drawings are Lucide's (https://lucide.dev), generated into `iconData.ts` by `pnpm icons`
 * from `icons.json`, under its ISC license:
 *
 *   ISC License. Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of
 *   Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.
 *   Permission to use, copy, modify, and/or distribute this software for any purpose with or
 *   without fee is hereby granted, provided that the above copyright notice and this permission
 *   notice appear in all copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL
 *   WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 *   AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR
 *   CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
 *   WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 *   CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
import { Icon } from 'foldkit-media'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { icons, type IconName } from './iconData.js'

/** The names of the drawings in the set. */
export type RichTextIconName = IconName

/** Whether a name, such as a slash entry's id, has a drawing in the set. */
export const isRichTextIcon = (name: string): name is RichTextIconName => Object.hasOwn(icons, name)

/** An icon as inline SVG, `size` CSS pixels square, in the text's color. */
export const richTextIcon = <Message>(
  h: HtmlBuilder<Message>,
  name: RichTextIconName,
  { size = 16 }: { readonly size?: number } = {},
): Html => Icon.draw(icons[name], h, { size: `${size}px` })

/**
 * An icon as a CSS `url(…)`, for markup that cannot hold an element of its own, such as a
 * rendering's adornment: a stylesheet masks it over the text's color.
 */
export const richTextIconUrl = (name: RichTextIconName): string => Icon.maskUrl(icons[name])
