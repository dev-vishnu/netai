import { describe, expect, it } from 'vitest';
import { crmTree } from './crm.fixture';
import type { Location, Out, RouteTree } from './tree';

const at = async (tree: RouteTree, path: string, role: 'admin' | 'member' = 'admin') => {
  const located = await tree.locate(path, { role });
  if (!('node' in located)) throw new Error(located.text);
  return located as Location;
};

describe('RouteTree', () => {
  it('prefers a literal folder over a [param] sibling', async () => {
    const tree = crmTree();
    expect((await at(tree, '/deals/new')).params).toEqual({});
    expect((await at(tree, '/deals/d_1')).params).toEqual({ dealId: 'd_1' });
  });

  it('lists static children and list rows as concrete paths', async () => {
    const tree = crmTree();
    const out = await tree.ls(await at(tree, '/deals'), {});
    expect(out.ok).toBe(true);
    expect(out.text).toContain('/deals/new');
    expect(out.text).toContain('/deals/d_1  Acme rebrand');
    expect(out.text).toContain('# 2 of 2 {dealId} rows');
    expect(out.text).toContain('read /deals/actions.json');
  });

  it('pages a list and says how to get the rest', async () => {
    const tree = crmTree();
    const out = await tree.ls(await at(tree, '/deals'), {}, 1, 0);
    expect(out.text).toContain('skip:1 for more');
    expect(out.text).not.toContain('d_2');
  });

  it('marks a dynamic segment with no list as not listable', async () => {
    const tree = crmTree();
    const out = await tree.ls(await at(tree, '/companies'), {});
    expect(out.text).toContain('/companies/{companyId}');
    expect(out.text).toContain('not listable');
  });

  it('reads a route and points at its actions', async () => {
    const tree = crmTree();
    const out = await tree.read(await at(tree, '/deals/d_2'), {});
    expect(out.data).toEqual({ id: 'd_2', title: 'Globex renewal' });
    expect(out.text).toContain('/deals/d_2/actions.json');
  });

  it('tells the agent a page-only route has nothing to read', async () => {
    const tree = crmTree();
    const out = await tree.read(await at(tree, '/deals/new'), {});
    expect(out.ok).toBe(false);
    expect(out.text).toContain('open_page');
  });

  it('answers actions.json from the route declaration', async () => {
    const tree = crmTree();
    const location = await at(tree, '/deals/d_1/actions.json');
    expect(location.actionsFile).toBe(true);
    const out: Out = tree.actionsFile(location);
    expect(out.data).toEqual({
      actions: [
        { name: 'move_stage', kind: 'write', description: 'move this deal' },
        { name: 'deal_history', kind: 'query', description: 'stage changes' }
      ]
    });
  });

  it('answers an unknown segment with the nearest path and what is there', async () => {
    const tree = crmTree();
    const out = (await tree.locate('/dealz/d_1', {})) as Out;
    expect(out.ok).toBe(false);
    expect(out.text).toContain('Nothing at "dealz" under /');
    expect(out.text).toContain('deals');
    expect(out.try).toEqual(['{op:"ls", path:"/"}']);
  });

  it('closes a gated branch all the way down, including paths nobody listed', async () => {
    const tree = crmTree();
    const out = (await tree.locate('/settings/billing', { role: 'member' })) as Out;
    expect(out.ok).toBe(false);
    expect(out.text).toContain('not available');
    expect('node' in (await tree.locate('/settings/billing', { role: 'admin' }))).toBe(true);
  });

  it('keeps hidden routes and gated branches out of the rendered layout', async () => {
    const tree = crmTree();
    const member = await tree.render({ role: 'member' });
    expect(member).not.toContain('settings');
    expect(member).not.toContain('internal');
    const admin = await tree.render({ role: 'admin' });
    expect(admin).toContain('settings/');
    expect(admin).toMatch(/\{dealId\}\s+# read · page — actions: move_stage, deal_history/);
  });

  it('gives an href only for pages', async () => {
    const tree = crmTree();
    expect(tree.hrefOf(await at(tree, '/deals/d_1'))).toBe('/deals/d_1');
  });
});
