/**
 * The parts of a server's fetch handler. Each owns one fact: a value built
 * once per isolate, the built template, the order requests are tried in, and
 * the Node adapter. None keeps a cache, a page table or a principal.
 */
export { isolate } from './isolate.js'
export { node, type NodeConfig, type NodeRequest, type NodeResponse } from './node.js'
export {
  routes,
  type Configured,
  type Handler,
  type RoutesConfig,
  type Variable,
} from './routes.js'
export { BUILD_META, buildTag, template, type Assets, type Template } from './template.js'
