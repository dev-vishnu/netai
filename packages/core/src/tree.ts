import type {
  ActionDefinition,
  ListRow,
  NetaiContext,
  Params,
  RouteDefinition
} from './route';

/** One route the framework adapter found: a template such as `/deals/[dealId]`. */
export interface RouteEntry {
  path: string;
  page: boolean;
  route?: RouteDefinition;
}

export interface Out {
  ok: boolean;
  text: string;
  data?: unknown;
  error?: string;
  try?: string[];
  /** The page the user can be shown for this result. */
  href?: string;
  /** A write landed, so whatever the user is looking at may be stale. */
  changed?: boolean;
}

export const fail = (error: string, examples: string[] = []): Out => ({
  ok: false,
  text: `ERROR: ${error}${examples.length ? `\nTry:\n  ${examples.join('\n  ')}` : ''}`,
  error,
  try: examples
});

interface TreeNode {
  segment: string;
  param?: string;
  page: boolean;
  route?: RouteDefinition;
  children: TreeNode[];
}

export interface Location {
  node: TreeNode;
  params: Params;
  chain: TreeNode[];
  segments: string[];
  actionsFile: boolean;
}

export const ACTIONS_FILE = 'actions.json';
const DYNAMIC_SEGMENT = /^\[([A-Za-z_$][\w$]*)\]$/;
const NOTE_COLUMN = 44;
const DEFAULT_LIMIT = 50;

const splitPath = (path: string): string[] =>
  path.split('?')[0].split('/').filter(Boolean);

export const pathOf = (location: Pick<Location, 'segments'>): string =>
  `/${location.segments.join('/')}`;

const tokenOf = (node: TreeNode): string =>
  node.param ? `{${node.param}}` : node.segment;

const rowsOf = (result: ListRow[] | { items: ListRow[]; total?: number }) =>
  Array.isArray(result) ? { items: result, total: undefined } : result;

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class RouteTree {
  private readonly root: TreeNode = { segment: '', page: false, children: [] };

  constructor(entries: RouteEntry[]) {
    for (const entry of entries) this.insert(entry);
  }

  private insert(entry: RouteEntry): void {
    let node = this.root;
    for (const segment of splitPath(entry.path)) {
      const param = segment.match(DYNAMIC_SEGMENT)?.[1];
      let child = node.children.find((candidate) =>
        param ? candidate.param !== undefined : candidate.segment === segment
      );
      if (!child) {
        child = { segment: param ? '' : segment, param, page: false, children: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.page ||= entry.page;
    node.route = entry.route ?? node.route;
  }

  resolve(
    rawPath: string
  ):
    | { ok: true; location: Location }
    | { ok: false; nearest: Location; missing: string } {
    let segments = splitPath(rawPath);
    const actionsFile = segments.at(-1) === ACTIONS_FILE;
    if (actionsFile) segments = segments.slice(0, -1);

    let location: Location = {
      node: this.root,
      params: {},
      chain: [this.root],
      segments: [],
      actionsFile
    };
    for (const segment of segments) {
      // A literal folder wins over a [param] sibling, so `/deals/new` is never read as an id.
      const child =
        location.node.children.find((candidate) => candidate.segment === segment) ??
        location.node.children.find((candidate) => candidate.param !== undefined);
      if (!child)
        return { ok: false, nearest: { ...location, actionsFile: false }, missing: segment };
      location = {
        node: child,
        params: child.param
          ? { ...location.params, [child.param]: decodeURIComponent(segment) }
          : location.params,
        chain: [...location.chain, child],
        segments: [...location.segments, segment],
        actionsFile
      };
    }
    return { ok: true, location };
  }

  private async isVisible(node: TreeNode, params: Params, context: NetaiContext) {
    if (node.route?.hidden) return false;
    return node.route?.visible ? node.route.visible({ params, context }) : true;
  }

  private async visibleChildren(node: TreeNode, params: Params, context: NetaiContext) {
    const visible: TreeNode[] = [];
    for (const child of node.children)
      if (await this.isVisible(child, params, context)) visible.push(child);
    return visible;
  }

  /**
   * Resolves a path and applies every gate on the way down, so a hidden branch
   * is closed for a path nobody listed (one remembered from earlier, or guessed).
   */
  async locate(rawPath: string, context: NetaiContext): Promise<Location | Out> {
    const resolution = this.resolve(rawPath);
    if (!resolution.ok) {
      const near = pathOf(resolution.nearest);
      const children = await this.visibleChildren(
        resolution.nearest.node,
        resolution.nearest.params,
        context
      );
      const names = children.map(tokenOf).join(', ');
      return fail(
        `Nothing at "${resolution.missing}" under ${near}.${names ? ` What is there: ${names}.` : ''}`,
        [`{op:"ls", path:"${near}"}`]
      );
    }
    const { location } = resolution;
    for (const node of location.chain)
      if (!(await this.isVisible(node, location.params, context)))
        return fail(`${pathOf(location)} is not available to this user.`);
    return location;
  }

  hrefOf(location: Location): string | undefined {
    return location.node.page ? pathOf(location) : undefined;
  }

  actionAt(location: Location, name: string): ActionDefinition | undefined {
    return location.node.route?.actions?.[name];
  }

  async ls(location: Location, context: NetaiContext, limit = DEFAULT_LIMIT, skip = 0): Promise<Out> {
    const here = pathOf(location).replace(/\/$/, '');
    const children = await this.visibleChildren(location.node, location.params, context);
    const lines = children
      .filter((child) => !child.param)
      .map((child) => describeLine(`${here}/${child.segment}`, child));
    const data: { items?: ListRow[]; total?: number } = {};

    const dynamicChild = children.find((child) => child.param);
    const list = location.node.route?.list;
    if (dynamicChild && list) {
      try {
        const { items, total } = rowsOf(
          await list({ params: location.params, context, limit, skip })
        );
        data.items = items;
        data.total = total;
        for (const row of items)
          lines.push(
            `${here}/${encodeURIComponent(row.id)}${row.title ? `  ${row.title}` : ''}`
          );
        const more = total !== undefined && skip + items.length < total;
        lines.push(
          `# ${items.length}${total !== undefined ? ` of ${total}` : ''} ${tokenOf(dynamicChild)} rows${more ? ` — skip:${skip + items.length} for more` : ''}`
        );
      } catch (error) {
        return fail(`Listing ${here || '/'} failed: ${errorText(error)}`);
      }
    } else if (dynamicChild) {
      lines.push(
        `${describeLine(`${here}/${tokenOf(dynamicChild)}`, dynamicChild)}  (not listable — use an id you already have)`
      );
    }

    if (!lines.length)
      return fail(`${here || '/'} has nothing under it.`, [`{op:"read", path:"${here || '/'}"}`]);
    return {
      ok: true,
      text: withActionsPointer(lines.join('\n'), location),
      data: data.items ? data : undefined
    };
  }

  async read(location: Location, context: NetaiContext): Promise<Out> {
    const here = pathOf(location);
    const read = location.node.route?.read;
    if (!read) {
      if (location.node.children.length || location.node.route?.list)
        return fail(`${here} is a folder with nothing to read.`, [`{op:"ls", path:"${here}"}`]);
      return fail(
        `${here} has nothing to read${location.node.page ? ' — it is a page; open_page shows it to the user' : ''}.`
      );
    }
    try {
      const data = await read({ params: location.params, context });
      return { ok: true, text: withActionsPointer('Content in `data`.', location), data };
    } catch (error) {
      return fail(`Reading ${here} failed: ${errorText(error)}`);
    }
  }

  actionsFile(location: Location): Out {
    const actions = Object.entries(location.node.route?.actions ?? {}).map(
      ([name, definition]) => ({
        name,
        kind: definition.kind,
        description: definition.description
      })
    );
    if (!actions.length) return { ok: true, text: `No actions at ${pathOf(location)}.`, data: { actions } };
    return {
      ok: true,
      text: 'Actions in `data.actions`. Load one with find_action, then run it with call_action. Queries run immediately; writes ask the user first.',
      data: { actions }
    };
  }

  /** The annotated layout drawn into the agent's instructions. */
  async render(context: NetaiContext): Promise<string> {
    const lines: string[] = [];
    pushLine(lines, '/', annotate(this.root));
    await this.renderChildren(this.root, '', lines, context);
    return lines.join('\n');
  }

  private async renderChildren(
    node: TreeNode,
    prefix: string,
    lines: string[],
    context: NetaiContext
  ): Promise<void> {
    // Params are unknown while drawing templates, so a gate here sees only the context.
    const children = await this.visibleChildren(node, {}, context);
    for (const [index, child] of children.entries()) {
      const last = index === children.length - 1;
      const folder = child.children.length ? '/' : '';
      pushLine(lines, `${prefix}${last ? '└─ ' : '├─ '}${tokenOf(child)}${folder}`, annotate(child));
      await this.renderChildren(child, prefix + (last ? '   ' : '│  '), lines, context);
    }
  }
}

function annotate(node: TreeNode): string {
  const route = node.route;
  const abilities = [
    route?.list ? 'ls' : '',
    route?.read ? 'read' : '',
    node.page ? 'page' : ''
  ].filter(Boolean);
  const actions = Object.keys(route?.actions ?? {});
  const parts = [
    abilities.join(' · '),
    actions.length ? `actions: ${actions.join(', ')}` : '',
    route?.note ?? ''
  ].filter(Boolean);
  return parts.join(' — ');
}

function describeLine(path: string, node: TreeNode): string {
  const note = annotate(node);
  return note ? `${path}  # ${note}` : path;
}

function withActionsPointer(text: string, location: Location): string {
  if (!Object.keys(location.node.route?.actions ?? {}).length) return text;
  const here = pathOf(location).replace(/\/$/, '');
  return `${text}\n# actions available here — read ${here}/${ACTIONS_FILE}`;
}

function pushLine(lines: string[], left: string, note: string): void {
  if (!note) {
    lines.push(left);
    return;
  }
  const pad = left.length < NOTE_COLUMN ? ' '.repeat(NOTE_COLUMN - left.length) : '  ';
  lines.push(`${left}${pad}# ${note}`);
}
