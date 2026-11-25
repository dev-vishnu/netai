import Link from 'next/link';
import { companyName, store } from '@/lib/store';

export default function Contacts() {
  return (
    <>
      <h1>Contacts</h1>
      <p className="sub">{store.contacts.length} people</p>
      <table>
        <thead><tr><th>Name</th><th>Title</th><th>Company</th><th>Email</th></tr></thead>
        <tbody>
          {store.contacts.map((contact) => (
            <tr key={contact.id}>
              <td><Link href={`/contacts/${contact.id}`}>{contact.name}</Link></td>
              <td>{contact.title}</td>
              <td><Link href={`/companies/${contact.companyId}`}>{companyName(contact.companyId)}</Link></td>
              <td>{contact.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
