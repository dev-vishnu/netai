import Link from 'next/link';
import { createCompanyFromForm } from '@/lib/actions';
import { store } from '@/lib/store';

export default function Companies() {
  return (
    <>
      <h1>Companies</h1>
      <p className="sub">{store.companies.length} companies</p>
      <table>
        <thead><tr><th>Name</th><th>Industry</th><th>Deals</th></tr></thead>
        <tbody>
          {store.companies.map((company) => (
            <tr key={company.id}>
              <td><Link href={`/companies/${company.id}`}>{company.name}</Link></td>
              <td>{company.industry}</td>
              <td className="num">{store.deals.filter((deal) => deal.companyId === company.id).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="inline" action={createCompanyFromForm}>
        <input name="name" placeholder="Company name" required />
        <input name="industry" placeholder="Industry" required />
        <button className="primary" type="submit">Add company</button>
      </form>
    </>
  );
}
