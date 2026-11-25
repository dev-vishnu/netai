# netai — MVP plan

**One line:** install a package, declare reads and writes next to your routes, and your web app gets an agent that browses its route tree like a filesystem, acts through your own server code, and moves the user's screen as it works.

## The idea, and where it comes from

Polaris (Contentstack) proved a pattern for agents over large surfaces:

- The product is drawn as a **virtual filesystem**. The model sees a rendered tree, `ls`/`read`s paths, reads a path's `actions.json` to see what it can do there, loads one action's schema with `find_action`, and runs it with `call_action`.
- **Four fixed tools no matter how many actions exist**, so the prompt stays small and cacheable, and the model discovers capabilities where they live instead of choosing from hundreds of flat tools.
- Writes ask before they run. Guidance (`hint`, `reminder`) sits on the action and arrives at the step that needs it, not in a giant system prompt.
- Errors teach: an unknown path answers with the nearest valid prefix and what to try.

netai turns that into a framework. The difference from Polaris: **the tree is not hand-written — it is the app's own route tree**, and a VFS path *is* a URL. So the agent's position is somewhere the user can be taken, which makes "act live on the web app" fall out of the design.

Nearest prior art: CopilotKit (actions per component, all in context), BuilderIO agent-native (flat `actions/*.ts`, all in context), WebMCP (per-page browser tools). None give the agent a navigable tree with progressive disclosure.

## Developer experience (target)

```ts
// app/deals/agent.ts
export default defineRoute({
  note: 'the sales pipeline',
  list: ({ limit, skip }) => listDeals({ limit, skip }),        // what `ls /deals` shows
  actions: {
    create_deal: action({
      kind: 'write',
      description: 'open a new deal',
      input: z.object({ title: z.string(), companyId: z.string(), value: z.number() }),
      handler: ({ input }) => createDeal(input)                  // an existing server action
    })
  }
});

// app/deals/[dealId]/agent.ts
export default defineRoute({
  read: ({ params }) => getDeal(params.dealId),
  actions: {
    move_stage: action({
      kind: 'write',
      description: 'move this deal to another pipeline stage',
      reminder: 'Read the deal first; moving to "won" is final for reporting.',
      input: z.object({ stage: z.enum(['lead', 'qualified', 'proposal', 'won', 'lost']) }),
      handler: ({ params, input }) => moveDeal(params.dealId, input.stage)
    })
  }
});
```

Setup in a Next app:

```ts
// next.config.ts
export default withNetai(nextConfig);
// app/api/netai/route.ts
export const { POST } = createAgentHandler({ manifest, model: anthropic('claude-sonnet-5-5') });
// app/layout.tsx
<NetaiChat />
```

## Packages

Framework-neutral core, thin per-framework adapters. Next is the first adapter, not the boundary.

| Package | Holds | Depends on |
|---|---|---|
| `@netai/core` | `defineRoute` / `action`, the tree engine (resolve, ls, read, actions, render, nearest-path errors, visibility), the four agent tools + approval policy + instructions, and `handleAgentRequest(Request) → Response` (web-standard, so any framework can mount it) | peer: `ai@7`, `zod@4` |
| `@netai/next` | `withNetai()` (scans `app/`, generates `.netai/manifest.ts`, watches in dev), `netai generate` CLI for CI, `createAgentHandler()` route handler, `<NetaiChat/>` client wrapper bound to `next/navigation` | `@netai/core`, `@netai/react`; peer: `next@16` |
| `@netai/react` | `<AgentChat/>` (useChat, step lines, approval cards, follow-mode toggle) and `useNetaiContext()` for client state; router-agnostic (`onNavigate`, `onRefresh`, `pathname` props) | peer: `react@19`, `@ai-sdk/react@4`, `ai@7` |

Later adapters earn their place with a real user: `@netai/sveltekit`, `@netai/mastra` (the tree's tools as Mastra tools).

## Agent runtime: AI SDK v7

Chosen over Mastra for the core: stateless (fits serverless), already in every Next app, and v7 has what we need natively —
`streamText` + `toolApproval` (per-tool function → `'user-approval'` only for writes), `experimental_toolApprovalSecret` (HMAC-binds approvals, since `useChat` history is client-controlled), `useChat` + `addToolApprovalResponse`, `MockLanguageModelV4` for tests. Model is the caller's choice (any AI SDK provider).

## Mapping Polaris → netai

| Polaris | netai |
|---|---|
| `VfsNode` / `Collection` written by hand | folders under `app/`; `[param]` folder = collection item |
| `list` / `itemLs` | `list` on the route above a dynamic segment; returns `{ id, title? }` rows that become child paths |
| `read` / `itemRead` | `read` on the route |
| `writes` (create, at collection) / `itemWrites` (edit, at item) | `actions` with `kind: 'write'`, placed on the list route or the item route |
| `queries` | `actions` with `kind: 'query'` (parameterised reads; run without asking) |
| `hint` / `reminder` | `description` (shown in `actions.json`) / `reminder` (shown by `find_action`) |
| `permission: allow\|ask\|deny` | `confirm: false` on a write to skip the card (default asks) |
| `visibleWhen` + chain-wide `visibilityRefusal` | `visible({ params, context })`, gates the whole subtree |
| global action names | names scoped to the path: `call_action({ path, action, args })`, so route params never need repeating in args |
| `render()` into the prompt | rendered per request (visibility depends on the user) |
| `resolveNearest` + `fail(error, try[])` | kept as is |
| — | `href` on every result at a page route → the client follows; `open_page` for "take me to…" |

## Tree rules (Next adapter)

- A node exists for every folder with a `page.*` and/or an `agent.*`.
- `(group)` folders are stripped from the path; `_private`, `@slot`, intercepting `(.)x`, catch-all `[...x]`/`[[...x]]` and `api/` folders without an `agent.*` are skipped in the MVP.
- Literal segments win over a `[param]` sibling (as `pickChild` in Polaris).
- A page-only node is navigable but has nothing to read; an agent-only folder (no page) is readable but not navigable.
- `hidden: true` in `agent.ts` drops a page from the agent's tree.

## The four tools

| Tool | Input | Does |
|---|---|---|
| `explore` | `{ op: 'ls' \| 'read', path, limit?, skip? }` | `ls` = static children + `list` rows as concrete paths; `read` = route `read`; `read <path>/actions.json` = actions here as `{ name, kind, description }` |
| `find_action` | `{ path, action }` | the action's JSON schema + reminder |
| `call_action` | `{ path, action, args }` | validates args against the zod schema (invalid → `invalid_args` + schema, nothing runs), runs the handler; writes pause for approval |
| `open_page` | `{ path }` | resolves a page route and returns its `href`; the client navigates |

Every result is `{ ok, text, data?, error?, try?, href? }` — a short line for the model, the payload in `data`.

## Live UI

- The client sends `{ pathname, context }` with each message; the server puts "the user is on …" into the instructions, so "archive this one" resolves.
- The chat watches finished tool parts: `href` on `explore`/`call_action` → navigate when follow mode is on; `open_page` → always navigate; a successful write → `router.refresh()` so server components re-fetch.

## Security

- Handlers run inside the app's request: `cookies()`, `headers()` and the app's own auth checks apply. The agent can do only what the user can.
- Writes ask by default. Approval secret recommended; the handler warns in production without one.
- App data read by the agent is untrusted input to a model that can write: one more reason writes default to asking.

## Milestones

1. **Core engine** — tree build from entries, resolve / ls / read / actions.json / render / nearest / visibility. Unit tests.
2. **Agent** — the four tools, approval policy, instructions, `handleAgentRequest`. Tests with `MockLanguageModelV4`: explore → find → call write → approval request; approved re-call runs the handler; denied does not; invalid args never run.
3. **Next adapter** — scanner (fixture app dir → entries), manifest codegen, `withNetai` (+ dev watch), CLI, `createAgentHandler`, `<NetaiChat/>`. Scanner tests.
4. **React chat** — `<AgentChat/>`, step lines, approval cards, follow toggle, `useNetaiContext`.
5. **Example app** — `examples/crm` on Next 16: companies, contacts, deals, settings (admin-gated); in-memory store; server actions shared by forms and `agent.ts`. `next build` green.
6. **Ship prep** — README, live run against a real model (needs an API key), public repo `dev-vishnu/netai` (pushed only after an explicit go-ahead), npm publish under the `netai` org (needs the org claimed).

## Out of MVP

Parallel / intercepting / catch-all routes, Pages Router, durable or resumable runs, memory, search tools, DOM-level interaction, typed params from paths, the flat-tools eval (planned right after the live run).
