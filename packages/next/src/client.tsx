'use client';

import { AgentChat, type AgentChatProps } from '@netai/react';
import { usePathname, useRouter } from 'next/navigation';

export type NetaiChatProps = Omit<AgentChatProps, 'pathname' | 'onNavigate' | 'onRefresh'>;

/** The netai chat, wired to the Next router: it follows the agent and re-fetches after writes. */
export function NetaiChat(props: NetaiChatProps) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <AgentChat
      {...props}
      pathname={pathname}
      onNavigate={(href) => router.push(href)}
      onRefresh={() => router.refresh()}
    />
  );
}

export { useNetaiContext } from '@netai/react';
