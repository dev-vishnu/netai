import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderManifest, scanAppDir } from './scan';

const fixtureRoot = path.join(import.meta.dirname, '__fixtures__');
const appDir = path.join(fixtureRoot, 'app');

describe('scanAppDir', () => {
  const routes = scanAppDir(appDir);

  it('finds pages and agent files, strips route groups, and skips what the agent cannot stand in', () => {
    expect(routes.map(({ path, page, agentFile }) => [path, page, Boolean(agentFile)])).toEqual([
      ['/', true, false],
      ['/deals', true, true],
      ['/deals/[dealId]', true, true],
      ['/deals/new', true, false],
      ['/pricing', true, false],
      ['/settings', false, true]
    ]);
  });

  it('imports each agent file relative to the manifest folder', () => {
    const manifest = renderManifest(routes, path.join(fixtureRoot, '.netai'));
    expect(manifest).toContain('import route0 from "../app/deals/agent";');
    expect(manifest).toContain('import route1 from "../app/deals/[dealId]/agent";');
    expect(manifest).toContain('import route2 from "../app/(admin)/settings/agent";');
    expect(manifest).toContain('{ path: "/settings", page: false, route: route2 },');
    expect(manifest).toContain('{ path: "/deals/new", page: true },');
  });
});
