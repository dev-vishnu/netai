import Link from 'next/link';
import { notFound } from 'next/navigation';
import { companyName, store } from '@/lib/store';

export default async function ContactPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const contact = store.contacts.find((candidate) => candidate.id === contactId);
  if (!contact) notFound();
  return (
    <>
      <h1>{contact.name}</h1>
      <p className="sub">{contact.title} at <Link href={`/companies/${contact.companyId}`}>{companyName(contact.companyId)}</Link></p>
      <dl className="facts"><dt>Email</dt><dd>{contact.email}</dd></dl>
    </>
  );
}
