/**
 * `foldkit-media/vite`: icons and images as imports. Each plugin is a module
 * of its own, so a Vite config that imports `icons` by path to this source
 * does not bundle `images`, whose sharp module reaches workspace packages that
 * Node cannot load from source.
 */
export { exportName, icons, type IconsOptions } from './icons.js'
export { images, type ImagesOptions } from './images.js'
