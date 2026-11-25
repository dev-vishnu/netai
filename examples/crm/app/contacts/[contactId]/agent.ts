import { action, defineRoute } from '@netai/next';
import { z } from 'zod';
import { updateContact } from '@/lib/actions';
import { store } from '@/lib/store';

export default defineRoute({
  read: ({ params }) => {
    const contact = store.contacts.find((candidate) => candidate.id === params.contactId);
    if (!contact) throw new Error(`No contact ${params.contactId}`);
    return contact;
  },
  actions: {
    update_contact: action({
      kind: 'write',
      description: 'change this person\'s name, email or title',
      input: z.object({ name: z.string().optional(), email: z.email().optional(), title: z.string().optional() }),
      handler: ({ params, input }) => updateContact(params.contactId, input)
    })
  }
});
