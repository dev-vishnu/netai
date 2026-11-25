import { action, defineRoute } from '@netai/next';
import { z } from 'zod';
import { moveDeal } from '@/lib/actions';
import { STAGES, store } from '@/lib/store';

export default defineRoute({
  note: 'one deal and its stage history',
  read: ({ params }) => {
    const deal = store.deals.find((candidate) => candidate.id === params.dealId);
    if (!deal) throw new Error(`No deal ${params.dealId}`);
    return deal;
  },
  actions: {
    move_stage: action({
      kind: 'write',
      description: 'move this deal to another pipeline stage',
      reminder: 'Won and lost close the deal for reporting; say so when you propose either.',
      input: z.object({ stage: z.enum(STAGES) }),
      handler: ({ params, input }) => moveDeal(params.dealId, input.stage)
    })
  }
});
