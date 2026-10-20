/**
 * The type of a `?image` import, for an application using `foldkit-media/vite`'s
 * `images` plugin: add `"foldkit-media/client"` to the tsconfig's `types`.
 */
declare module '*?image' {
  import type { ImageAsset, Provider } from 'foldkit-media'

  const image: { readonly asset: ImageAsset; readonly provider: Provider.Provider }
  export default image
}
