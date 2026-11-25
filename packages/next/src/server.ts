import { handleAgentRequest, RouteTree, type AgentOptions, type RouteEntry } from '@netai/core';

export interface AgentHandlerOptions extends Omit<AgentOptions, 'tree'> {
  /** The generated `.netai/manifest.ts` export. */
  manifest: RouteEntry[];
}

/** `export const { POST } = createAgentHandler({ manifest, model })` in `app/api/netai/route.ts`. */
export function createAgentHandler({ manifest, ...options }: AgentHandlerOptions) {
  const tree = new RouteTree(manifest);
  return {
    POST: (request: Request) => handleAgentRequest(request, { ...options, tree })
  };
}

export { action, defineRoute, type NetaiContext } from '@netai/core';
