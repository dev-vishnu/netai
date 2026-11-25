import { action, defineRoute } from '@netai/next';
import { z } from 'zod';
import { createContact } from '@/lib/actions';
import { companyName, store } from '@/lib/store';

export default defineRoute({
  note: 'people at the companies',
  list: ({ limit, skip }) => ({
    items: store.contacts.slice(skip, skip + limit).map((contact) => ({
      id: contact.id,
      title: `${contact.name}, ${contact.title ?? 'contact'} at ${companyName(contact.companyId)}`
    })),
    total: store.contacts.length
  }),
  actions: {
    create_contact: action({
      kind: 'write',
      description: 'add a person to a company',
      reminder: 'companyId must be an id from ls /companies.',
      input: z.object({
        companyId: z.string(),
        name: z.string().min(1),
        email: z.email(),
        title: z.string().optional()
      }),
      handler: ({ input }) => createContact(input)
    })
  }
});
