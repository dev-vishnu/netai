import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { store } from '@/lib/store';

export default async function SettingsPage() {
  if ((await currentUser()).role !== 'admin') notFound();
  return (
    <>
      <h1>Settings</h1>
      <p className="sub">Admins only. <Link href="/settings/team">Team →</Link></p>
      <dl className="facts">
        <dt>Workspace</dt><dd>{store.settings.workspaceName}</dd>
        <dt>Currency</dt><dd>{store.settings.currency}</dd>
      </dl>
    </>
  );
}
