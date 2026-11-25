import { NetaiChat } from '@netai/next/client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { switchRole } from '@/lib/actions';
import { currentUser } from '@/lib/session';
import { store } from '@/lib/store';
import './globals.css';

export const metadata = { title: 'netai CRM example' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="sidebar">
            <span className="brand">{store.settings.workspaceName}</span>
            <Link href="/">Dashboard</Link>
            <Link href="/companies">Companies</Link>
            <Link href="/contacts">Contacts</Link>
            <Link href="/deals">Deals</Link>
            {user.role === 'admin' && <Link href="/settings">Settings</Link>}
            <div className="who">
              Signed in as {user.name}
              <form action={switchRole}>
                <button type="submit">Switch to {user.role === 'admin' ? 'member' : 'admin'}</button>
              </form>
            </div>
          </nav>
          <main>{children}</main>
        </div>
        <NetaiChat title="Ask the CRM" />
      </body>
    </html>
  );
}
