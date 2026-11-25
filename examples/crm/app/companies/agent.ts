import { action, defineRoute } from '@netai/next';
import { z } from 'zod';
import { createCompany } from '@/lib/actions';
import { store } from '@/lib/store';

export default defineRoute({
  note: 'every company',
  list: ({ limit, skip }) => ({
    items: store.companies.slice(skip, skip + limit).map((company) => ({
      id: company.id,
      title: `${company.name} (${company.industry})`
    })),
    total: store.companies.length
  }),
  actions: {
    create_company: action({
      kind: 'write',
      description: 'add a company',
      reminder: 'ls /companies first so you do not add one that already exists.',
      input: z.object({ name: z.string().min(1), industry: z.string().min(1), website: z.url().optional() }),
      handler: ({ input }) => createCompany(input)
    })
  }
});
