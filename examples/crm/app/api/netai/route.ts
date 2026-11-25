import { anthropic } from '@ai-sdk/anthropic';
import { createAgentHandler } from '@netai/next';
import { manifest } from '@/.netai/manifest';
import { currentUser } from '@/lib/session';

export const { POST } = createAgentHandler({
  manifest,
  model: anthropic(process.env.NETAI_MODEL ?? 'claude-sonnet-5-5'),
  context: async () => ({ user: await currentUser() }),
  approvalSecret: process.env.NETAI_APPROVAL_SECRET,
  instructions: 'This is a small CRM. Amounts are in the workspace currency; read / for it.'
});
