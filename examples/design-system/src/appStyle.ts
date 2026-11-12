/**
 * The demo's theme: the shipped one, with no knob set, so the components look as
 * a new application gets them. The page's sheet (`sheet.ts`) and the Styles
 * (`style.ts`) are built from it.
 */
import { AppStyle } from 'foldkit-mixins/app'

export const app = AppStyle.make({})

export const { t, L } = app
export const stylesheet = app.stylesheet
