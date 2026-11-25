import { action, defineRoute } from '@netai/next';
import { z } from 'zod';
import { createDeal } from '@/lib/actions';
import { companyName, STAGES, store } from '@/lib/store';

export default defineRoute({
  note: 'the sales pipeline',
  list: ({ limit, skip }) => ({
    items: store.deals.slice(skip, skip + limit).map((deal) => ({
      id: deal.id,
      title: `${deal.title} — ${companyName(deal.companyId)}, ${deal.stage}, ${deal.value}`
    })),
    total: store.deals.length
  }),
  actions: {
    create_deal: action({
      kind: 'write',
      description: 'open a new deal (starts as a lead)',
      reminder: 'companyId must be an id from ls /companies; create the company first if it is missing.',
      input: z.object({ companyId: z.string(), title: z.string().min(1), value: z.number().positive() }),
      handler: ({ input }) => createDeal(input)
    }),
    search_deals: action({
      kind: 'query',
      description: 'filter deals by stage, company or minimum value',
      input: z.object({
        stage: z.enum(STAGES).optional(),
        companyId: z.string().optional(),
        minValue: z.number().optional()
      }),
      handler: ({ input }) =>
        store.deals.filter(
          (deal) =>
            (!input.stage || deal.stage === input.stage) &&
            (!input.companyId || deal.companyId === input.companyId) &&
            (input.minValue === undefined || deal.value >= input.minValue)
        )
    })
  }
});
