import { action, defineRoute } from '@netai/next';
import { z } from 'zod';
import { updateCompany } from '@/lib/actions';
import { store } from '@/lib/store';

export default defineRoute({
  note: 'one company with its contacts and deals',
  read: ({ params }) => {
    const company = store.companies.find((candidate) => candidate.id === params.companyId);
    if (!company) throw new Error(`No company ${params.companyId}`);
    return {
      ...company,
      contacts: store.contacts.filter((contact) => contact.companyId === company.id),
      deals: store.deals.filter((deal) => deal.companyId === company.id)
    };
  },
  actions: {
    update_company: action({
      kind: 'write',
      description: 'change this company\'s name, industry or website',
      input: z.object({ name: z.string().optional(), industry: z.string().optional(), website: z.url().optional() }),
      handler: ({ params, input }) => updateCompany(params.companyId, input)
    })
  }
});
