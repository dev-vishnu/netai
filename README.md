# netai

**Make your web app agentic by declaring what each route can read and do.**

netai turns your app's route tree into a filesystem an AI agent can browse. Next to a route you declare what can be listed, read, queried and changed there. At build time netai assembles the tree, and an agent in your own backend explores it, acts through your own server code, and moves the user's screen as it works. Writes always ask first.

```
/                                         # read · page — dashboard: pipeline totals
├─ companies/                             # ls · page — actions: create_company — every company
│  └─ {companyId}                         # read · page — actions: update_company
├─ deals/                                 # ls · page — actions: create_deal, search_deals — the sales pipeline
│  └─ {dealId}                            # read · page — actions: move_stage
└─ settings/                              # read · page — actions: update_settings — admins only
   └─ team                                # page
```

*The layout the agent sees for the example CRM.*

## Why a tree

Most "add an agent to your app" kits give the model every action as a tool. That works for ten actions and falls apart at a hundred: the prompt grows, the model picks the wrong tool, and nothing tells it where things live.

netai gives the model **four fixed tools** however big the app gets. The model navigates instead of choosing:

| Tool | What it does |
|---|---|
| `explore` | `ls` a path (rows your app returns become concrete paths like `/deals/d_42`), `read` a path, or read `<path>/actions.json` to see what can be done there |
| `find_action` | loads one action's input schema and guidance |
| `call_action` | runs it at that path; route params come from the path, args are validated, writes pause for the user |
| `open_page` | takes the user to a page |

Every path is also a URL. So when the agent reads `/deals/d_42`, the user's screen goes there too, and after a write the page refreshes. The approach comes from a production agent that runs over a large product surface. There, actions sit where they apply and guidance arrives only at the step that needs it, which keeps the prompt small and the model on track.

## Quick start (Next.js)

```bash
npm i @netai/next @netai/core @netai/react ai zod @ai-sdk/anthropic
```

**1. Declare what a route offers**, next to its `page.tsx`:

```ts
// app/deals/[dealId]/agent.ts
import { action, defineRoute } from '@netai/next';
import { z } from 'zod';
import { getDeal, moveDeal } from '@/lib/deals';

export default defineRoute({
  note: 'one deal and its stage history',
  read: ({ params }) => getDeal(params.dealId),
  actions: {
    move_stage: action({
      kind: 'write',
      description: 'move this deal to another pipeline stage',
      reminder: 'Won and lost close the deal for reporting; say so when you propose either.',
      input: z.object({ stage: z.enum(['lead', 'qualified', 'proposal', 'won', 'lost']) }),
      handler: ({ params, input }) => moveDeal(params.dealId, input.stage)
    })
  }
});
```

A list route says what its dynamic child contains, and is where creates live:

```ts
// app/deals/agent.ts
export default defineRoute({
  list: ({ limit, skip }) => listDeals({ limit, skip }), // [{ id, title }]
  actions: { create_deal: action({ kind: 'write', /* … */ }) }
});
```

**2. Wrap your config.** The manifest is generated before Next starts and kept current in `next dev`:

```ts
// next.config.ts
import { withNetai } from '@netai/next/config';
export default withNetai({});
```

**3. Mount the agent:**

```ts
// app/api/netai/route.ts
import { anthropic } from '@ai-sdk/anthropic';
import { createAgentHandler } from '@netai/next';
import { manifest } from '@/.netai/manifest';

export const { POST } = createAgentHandler({
  manifest,
  model: anthropic('claude-sonnet-5-5'),
  context: async () => ({ user: await currentUser() }),
  approvalSecret: process.env.NETAI_APPROVAL_SECRET
});
```

**4. Add the chat:**

```tsx
// app/layout.tsx
import { NetaiChat } from '@netai/next/client';
// …
<NetaiChat title="Assistant" />
```

Add `.netai` to `.gitignore`, and put `.netai/**/*.ts` in your tsconfig `include`. In CI, run `netai generate` before `tsc`.

## The route API

| Field | Purpose |
|---|---|
| `note` | Shown next to the route in the layout |
| `list({ params, context, limit, skip })` | Rows `{ id, title? }` for the dynamic segment below this route. Return `{ items, total }` to page |
| `read({ params, context })` | What `explore read` returns |
| `actions` | `action({ kind: 'query' \| 'write', description, reminder?, input, confirm?, handler })` |
| `visible({ params, context })` | Closes this route **and everything under it** for requests that fail it, even for paths nobody listed |
| `hidden` | Keeps a page out of the agent's tree |

Queries run immediately. Writes show an approval card unless the action sets `confirm: false`. Type your request context once:

```ts
declare module '@netai/core' {
  interface NetaiContext { user: User }
}
```

**What becomes a node:** every `app/` folder with a `page.*` or an `agent.*`. Route groups `(x)` are stripped. Private `_x`, parallel `@x`, intercepting and catch-all routes are skipped for now. A literal folder beats a `[param]` sibling, so `/deals/new` is never treated as an id.

## Security model

- Handlers run inside your request. Your auth, cookies and permission checks apply unchanged, so the agent can do only what the signed-in user can.
- Writes ask by default. Set `approvalSecret` (`openssl rand -base64 32`): `useChat` history comes from the client, and the secret stops a modified client from approving its own writes.
- Treat data your routes return as untrusted input to a model that can write. That's one more reason writes ask.

## Packages

| Package | |
|---|---|
| [`@netai/core`](packages/core) | The tree engine, the four tools, the approval policy, and `handleAgentRequest(Request) → Response` (web-standard, so any framework can mount it) |
| [`@netai/next`](packages/next) | Next.js adapter: `withNetai`, `netai generate`, `createAgentHandler`, `<NetaiChat/>` |
| [`@netai/react`](packages/react) | `<AgentChat/>` (router-agnostic) and `useNetaiContext()` for on-screen state |

Built on the [AI SDK](https://ai-sdk.dev) v7, so any model provider works.

## Example

[`examples/crm`](examples/crm) is a small CRM with companies, contacts, deals and admin-only settings. The same server actions back its forms and its agent.

```bash
npm install && npm run build
cp examples/crm/.env.example examples/crm/.env.local   # add ANTHROPIC_API_KEY
npm run dev -w netai-example-crm
```

Try: *"move the Globex deal to proposal"*, *"add Wonka Industries and open a 30k deal for them"*, *"which deals are over 40k?"*. Use **Switch to member** to watch settings disappear from the agent's world.

## Status

Early MVP (0.1). On the roadmap: an eval against a flat-tools baseline, typed params from paths, catch-all routes, more framework adapters (SvelteKit, Remix), and a Mastra adapter.

MIT © Vishnu Pillai
