import { action, defineRoute } from '@netai/next';
import { z } from 'zod';
import { updateSettings } from '@/lib/actions';
import { store } from '@/lib/store';

export default defineRoute({
  note: 'workspace settings (admins only)',
  visible: ({ context }) => context.user.role === 'admin',
  read: () => store.settings,
  actions: {
    update_settings: action({
      kind: 'write',
      description: 'rename the workspace or change its currency',
      input: z.object({
        workspaceName: z.string().min(1).optional(),
        currency: z.enum(['USD', 'EUR', 'INR']).optional()
      }),
      handler: ({ input }) => updateSettings(input)
    })
  }
});
