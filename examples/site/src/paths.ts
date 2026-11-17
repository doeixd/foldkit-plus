/**
 * Which of the site's two applications draws an address: the component pages
 * and the theme creator are the second, everything else the first. The build,
 * the dev server and the browser's entry all ask here, so a page is served by
 * the application that takes it over. Light, since the first entry reads it.
 */
export const isComponentPath = (path: string): boolean =>
  /^\/(components(\/|$)|create\/?$|primitives\/gallery\/?$)/.test(path)
