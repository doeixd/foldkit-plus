declare module 'virtual:foldkit-styles' {
  export const href: string
}

declare module '*.woff2?url' {
  const url: string
  export default url
}
