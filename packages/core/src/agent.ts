import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  tool,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage
} from 'ai';
import { z } from 'zod';
import type { NetaiContext } from './route';
import { fail, pathOf, RouteTree, type Out } from './tree';

/** What the browser tells the agent about the screen the user is on. */
export interface ClientState {
  pathname?: string;
  state?: Record<string, unknown>;
}

export interface AgentOptions {
  tree: RouteTree;
  model: LanguageModel;
  /** Resolves the per-request context handed to every list, read, visible and action handler. */
  context?: (request: Request) => NetaiContext | Promise<NetaiContext>;
  /** App-specific guidance, appended after the built-in instructions. */
  instructions?: string;
  /**
   * HMAC secret that binds each approval to the server that issued it. Without
   * one, a client that edits its own message history can approve its own writes.
   */
  approvalSecret?: string;
  maxSteps?: number;
}

const PREAMBLE = `You work inside this web app on behalf of the signed-in user. The app is a tree of routes, drawn below; every path in it is also the URL of a page the user can see.

- explore {op:"ls"} lists what is under a path; rows the app returns become concrete paths. explore {op:"read"} reads a path.
- Read <path>/actions.json to see what can be done at a path. Load one action with find_action, then run it with call_action at that same path. Queries run immediately. Writes ask the user first; if they decline, do not retry or re-propose it.
- Creating happens on a list route (/deals); editing happens on an item route (/deals/{dealId}).
- The user watches the app follow you as you explore. open_page takes them to a page when they ask to see one.
- Never invent ids. Take them from ls rows or from what you read.`;

export async function buildInstructions(
  tree: RouteTree,
  context: NetaiContext,
  client: ClientState,
  appInstructions?: string
): Promise<string> {
  const sections = [PREAMBLE, `# Layout\n${await tree.render(context)}`];
  if (appInstructions) sections.push(appInstructions);
  if (client.pathname) sections.push(`The user is on ${client.pathname}.`);
  if (client.state && Object.keys(client.state).length)
    sections.push(`On their screen: ${JSON.stringify(client.state)}`);
  return sections.join('\n\n');
}

const pathField = z.string().describe('Absolute path in the layout, such as /deals/d_42.');

export function createNetaiTools(tree: RouteTree, context: NetaiContext) {
  return {
    explore: tool({
      description: 'List (ls) or read a path in the app. Read <path>/actions.json for the actions at a path.',
      inputSchema: z.object({
        op: z.enum(['ls', 'read']),
        path: pathField,
        limit: z.number().int().min(1).max(100).optional(),
        skip: z.number().int().min(0).optional()
      }),
      execute: async ({ op, path, limit, skip }): Promise<Out> => {
        const location = await tree.locate(path, context);
        if (!('node' in location)) return location;
        const href = tree.hrefOf(location);
        if (location.actionsFile) return tree.actionsFile(location);
        const result =
          op === 'ls'
            ? await tree.ls(location, context, limit, skip)
            : await tree.read(location, context);
        return result.ok ? { ...result, href } : result;
      }
    }),

    find_action: tool({
      description: 'Load one action listed in a path\'s actions.json: its input schema and how to use it.',
      inputSchema: z.object({ path: pathField, action: z.string() }),
      execute: async ({ path, action }): Promise<Out> => {
        const location = await tree.locate(path, context);
        if (!('node' in location)) return location;
        const definition = tree.actionAt(location, action);
        if (!definition)
          return fail(`No action "${action}" at ${pathOf(location)}.`, [
            `{op:"read", path:"${pathOf(location).replace(/\/$/, '')}/actions.json"}`
          ]);
        return {
          ok: true,
          text: [
            `${action} (${definition.kind}): ${definition.description}`,
            definition.reminder ?? '',
            `Run it with call_action {path:"${pathOf(location)}", action:"${action}", args}.`
          ]
            .filter(Boolean)
            .join('\n'),
          data: { kind: definition.kind, schema: z.toJSONSchema(definition.input) }
        };
      }
    }),

    call_action: tool({
      description: 'Run an action at a path, with args matching the schema find_action returned.',
      inputSchema: z.object({
        path: pathField,
        action: z.string(),
        args: z.record(z.string(), z.unknown()).optional()
      }),
      execute: async ({ path, action, args }): Promise<Out> => {
        const location = await tree.locate(path, context);
        if (!('node' in location)) return location;
        const definition = tree.actionAt(location, action);
        if (!definition)
          return fail(`No action "${action}" at ${pathOf(location)}.`, [
            `{op:"read", path:"${pathOf(location).replace(/\/$/, '')}/actions.json"}`
          ]);
        const parsed = definition.input.safeParse(args ?? {});
        if (!parsed.success)
          return {
            ok: false,
            error: 'invalid_args',
            text: 'Invalid args — nothing ran. Fix them against `data.schema` and call again.',
            data: { issues: z.treeifyError(parsed.error), schema: z.toJSONSchema(definition.input) }
          };
        try {
          const data = await definition.handler({
            params: location.params,
            context,
            input: parsed.data
          });
          const wrote = definition.kind === 'write';
          return {
            ok: true,
            text: wrote ? `${action} done.` : 'Result in `data`.',
            data,
            href: tree.hrefOf(location),
            changed: wrote || undefined
          };
        } catch (error) {
          return fail(`${action} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }),

    open_page: tool({
      description: 'Take the user to a page in the app.',
      inputSchema: z.object({ path: pathField }),
      execute: async ({ path }): Promise<Out> => {
        const location = await tree.locate(path, context);
        if (!('node' in location)) return location;
        const href = tree.hrefOf(location);
        if (!href) return fail(`${pathOf(location)} is not a page.`, [`{op:"ls", path:"${pathOf(location)}"}`]);
        return { ok: true, text: `Opened ${href}.`, href };
      }
    })
  };
}

export type NetaiTools = ReturnType<typeof createNetaiTools>;

/** Writes pause for the user unless the action opts out with `confirm: false`. */
export function approvalPolicy(tree: RouteTree, context: NetaiContext) {
  return {
    call_action: async ({ path, action }: { path: string; action: string }) => {
      const location = await tree.locate(path, context);
      if (!('node' in location)) return undefined;
      const definition = tree.actionAt(location, action);
      return definition?.kind === 'write' && definition.confirm !== false
        ? ('user-approval' as const)
        : undefined;
    }
  };
}

let warnedAboutSecret = false;

export async function handleAgentRequest(request: Request, options: AgentOptions): Promise<Response> {
  const body = (await request.json()) as { messages: UIMessage[] } & ClientState;
  const context = (await options.context?.(request)) ?? ({} as NetaiContext);
  const tools = createNetaiTools(options.tree, context);

  if (!options.approvalSecret && process.env.NODE_ENV === 'production' && !warnedAboutSecret) {
    warnedAboutSecret = true;
    console.warn('[netai] no approvalSecret set: a modified client could approve its own writes.');
  }

  const result = streamText({
    model: options.model,
    instructions: await buildInstructions(
      options.tree,
      context,
      { pathname: body.pathname, state: body.state },
      options.instructions
    ),
    messages: await convertToModelMessages(body.messages, { tools }),
    tools,
    toolApproval: approvalPolicy(options.tree, context),
    experimental_toolApprovalSecret: options.approvalSecret,
    stopWhen: isStepCount(options.maxSteps ?? 25)
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      originalMessages: body.messages,
      // A missing API key or a bad model id should be obvious while building, never leaked in production.
      onError: (error) =>
        process.env.NODE_ENV === 'production'
          ? 'The assistant hit an error.'
          : error instanceof Error
            ? error.message
            : String(error)
    })
  });
}
