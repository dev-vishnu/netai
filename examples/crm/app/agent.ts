import { defineRoute } from '@netai/next';
import { store } from '@/lib/store';

export default defineRoute({
  note: 'dashboard: pipeline totals',
  read: () => ({
    workspace: store.settings.workspaceName,
    companies: store.companies.length,
    contacts: store.contacts.length,
    openPipeline: store.deals
      .filter((deal) => deal.stage !== 'won' && deal.stage !== 'lost')
      .reduce((sum, deal) => sum + deal.value, 0),
    currency: store.settings.currency
  })
});
