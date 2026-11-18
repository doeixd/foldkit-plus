import type { NamedStyle } from 'foldkit-mixins'
import type { ImageCropperZoom } from '../imageCropper.js'
import * as Slider from '../slider.js'

/**
 * The zoom control as a Slider. Pass it as `ImageCropper.view`'s `zoom`;
 * `style` is a style of `SliderSlots` for it. A cropper given none draws no
 * zoom control and ships no Slider.
 */
export const zoomSlider = (style?: NamedStyle<typeof Slider.SliderSlots>): ImageCropperZoom => ({
  draw: (input, h) => Slider.view({ ...input, style }, h),
})
