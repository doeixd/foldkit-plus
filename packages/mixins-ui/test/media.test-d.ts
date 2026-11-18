/**
 * An image's facts and its provider must agree: `Provider.hosted` names an
 * original by its content hash, so facts without one are refused where the
 * view is written, not drawn as an unavailable image.
 */
import { Schema } from 'effect'
import { HashedAsset, ImageAsset, Layout, Provider } from 'foldkit-media'
import { SlotView } from 'foldkit-mixins'
import { Avatar, Image } from '../src/index.js'

const h = SlotView.inertBuilder<never>()
const facts = { key: 'a.jpg', width: 800, height: 600, alpha: false, placeholder: null }
const unhashed = Schema.decodeUnknownSync(ImageAsset)({ ...facts, hash: null })
const hashed = Schema.decodeUnknownSync(HashedAsset)({ ...facts, hash: 'a'.repeat(64) })
const hosted = Provider.hosted()
const layout = Layout.Constrained({ width: 400 })
const alt = Image.described('A photograph')

Image.view({ asset: hashed, provider: hosted, layout, alt }, h)
Image.view({ asset: unhashed, provider: Provider.cdnCgi(), layout, alt }, h)
Image.view({ asset: hashed, provider: Provider.cdnCgi(), layout, alt }, h)
// @ts-expect-error: `Provider.hosted` needs the facts' content hash.
Image.view({ asset: unhashed, provider: hosted, layout, alt }, h)

Avatar.view(
  { name: 'Ada', picture: Avatar.picture({ asset: hashed, provider: hosted, width: 40 }) },
  h,
)
Avatar.view(
  {
    name: 'Ada',
    // @ts-expect-error: the same for an avatar's picture.
    picture: Avatar.picture({ asset: unhashed, provider: hosted, width: 40 }),
  },
  h,
)
Avatar.group(
  {
    people: [
      { name: 'Ada', picture: Avatar.picture({ asset: hashed, provider: hosted, width: 40 }) },
    ],
  },
  h,
)
