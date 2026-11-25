import type { z } from 'zod';

/**
 * Whatever the app resolves per request (the user, their org, a db handle).
 * Apps describe it by augmenting this interface:
 * `declare module '@netai/core' { interface NetaiContext { user: User } }`
 */
export interface NetaiContext {}

export type Params = Record<string, string>;

export interface RouteArgs {
  params: Params;
  context: NetaiContext;
}

export interface ListArgs extends RouteArgs {
  limit: number;
  skip: number;
}

export interface ListRow {
  id: string;
  title?: string;
  [field: string]: unknown;
}

export type ListResult = ListRow[] | { items: ListRow[]; total?: number };

export interface ActionDefinition<Input extends z.ZodType = z.ZodType> {
  /** A query runs straight away; a write asks the user first unless `confirm` is false. */
  kind: 'query' | 'write';
  /** One line, shown when the agent reads the route's actions.json. */
  description: string;
  /** The longer contract, shown only once the agent loads this action. */
  reminder?: string;
  input: Input;
  confirm?: boolean;
  handler(args: RouteArgs & { input: z.infer<Input> }): unknown;
}

export interface RouteDefinition {
  /** Shown next to the route in the tree the agent sees. */
  note?: string;
  /** Keeps a page out of the agent's tree. */
  hidden?: boolean;
  /** Closes this route and everything under it for a request that fails it. */
  visible?(args: RouteArgs): boolean | Promise<boolean>;
  /** Rows for the dynamic segment below this route; each row's id becomes a child path. */
  list?(args: ListArgs): ListResult | Promise<ListResult>;
  read?(args: RouteArgs): unknown;
  actions?: Record<string, ActionDefinition>;
}

export const defineRoute = (route: RouteDefinition): RouteDefinition => route;

export const action = <Input extends z.ZodType>(
  definition: ActionDefinition<Input>
): ActionDefinition<Input> => definition;
