import { Option } from 'effect'
import { Layout, Picture, type ImageAsset, type Provider } from 'foldkit-media'
import type { AvatarPicture } from '../avatar.js'
import { imgAttributes } from '../imageAttributes.js'

/**
 * A picture `foldkit-media` writes the candidates of, as the avatar's `picture`:
 * the asset, the provider of its variants, and how wide the avatar is drawn in
 * CSS pixels (`Avatar.widthOf(size)`), so a 24px avatar fetches a 48px variant,
 * not the original. With a provider that has no URL for the asset the initials
 * stand alone. An application that passes `src` as text never imports this.
 */
export const picture = <Asset extends ImageAsset>(options: {
  readonly asset: Asset
  readonly provider: Provider.Provider<NoInfer<Asset>>
  readonly width: number
}): AvatarPicture => ({
  attributes: h =>
    Option.map(
      Picture.derive({
        asset: options.asset,
        provider: options.provider,
        layout: Layout.Fixed({ width: options.width }),
      }),
      ({ img }) => imgAttributes(img, h),
    ),
})
