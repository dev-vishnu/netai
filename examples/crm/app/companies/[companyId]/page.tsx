import Link from 'next/link';
import { notFound } from 'next/navigation';
import { store } from '@/lib/store';

export default async function CompanyPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const company = store.companies.find((candidate) => candidate.id === companyId);
  if (!company) notFound();
  const contacts = store.contacts.filter((contact) => contact.companyId === company.id);
  const deals = store.deals.filter((deal) => deal.companyId === company.id);
  return (
    <>
      <h1>{company.name}</h1>
      <p className="sub">{company.industry}{company.website ? ` · ${company.website}` : ''}</p>
      <section>
        <h2>Contacts</h2>
        <table>
          <thead><tr><th>Name</th><th>Title</th><th>Email</th></tr></thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id}><td><Link href={`/contacts/${contact.id}`}>{contact.name}</Link></td><td>{contact.title}</td><td>{contact.email}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2>Deals</h2>
        <table>
          <thead><tr><th>Deal</th><th>Stage</th><th>Value</th></tr></thead>
          <tbody>
            {deals.map((deal) => (
              <tr key={deal.id}><td><Link href={`/deals/${deal.id}`}>{deal.title}</Link></td><td>{deal.stage}</td><td className="num">{deal.value}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
