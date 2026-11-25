import { z } from 'zod';
import { action, defineRoute } from './route';
import { RouteTree } from './tree';

declare module './route' {
  interface NetaiContext {
    role?: 'admin' | 'member';
  }
}

export const handlerCalls: string[] = [];

const deals = [
  { id: 'd_1', title: 'Acme rebrand' },
  { id: 'd_2', title: 'Globex renewal' }
];

export const crmTree = () =>
  new RouteTree([
    { path: '/', page: true, route: defineRoute({ note: 'dashboard' }) },
    {
      path: '/deals',
      page: true,
      route: defineRoute({
        note: 'the sales pipeline',
        list: ({ limit, skip }) => ({ items: deals.slice(skip, skip + limit), total: deals.length }),
        actions: {
          create_deal: action({
            kind: 'write',
            description: 'open a new deal',
            input: z.object({ title: z.string() }),
            handler: ({ input }) => {
              handlerCalls.push(`create_deal:${input.title}`);
              return { id: 'd_3', ...input };
            }
          })
        }
      })
    },
    { path: '/deals/new', page: true },
    {
      path: '/deals/[dealId]',
      page: true,
      route: defineRoute({
        read: ({ params }) => deals.find((deal) => deal.id === params.dealId),
        actions: {
          move_stage: action({
            kind: 'write',
            description: 'move this deal',
            reminder: 'Read the deal first.',
            input: z.object({ stage: z.enum(['lead', 'won']) }),
            handler: ({ params, input }) => ({ id: params.dealId, stage: input.stage })
          }),
          deal_history: action({
            kind: 'query',
            description: 'stage changes',
            input: z.object({}),
            handler: ({ params }) => [{ id: params.dealId, stage: 'lead' }]
          })
        }
      })
    },
    { path: '/companies/[companyId]', page: true },
    {
      path: '/settings',
      page: true,
      route: defineRoute({ visible: ({ context }) => context.role === 'admin' })
    },
    { path: '/settings/billing', page: true },
    { path: '/internal', page: true, route: defineRoute({ hidden: true }) }
  ]);
