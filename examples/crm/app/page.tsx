import Link from 'next/link';
import { store } from '@/lib/store';

export default function Dashboard() {
  const open = store.deals.filter((deal) => deal.stage !== 'won' && deal.stage !== 'lost');
  const money = new Intl.NumberFormat('en', { style: 'currency', currency: store.settings.currency, maximumFractionDigits: 0 });
  return (
    <>
      <h1>Dashboard</h1>
      <p className="sub">Try the assistant: “move the Globex deal to proposal” or “add Wonka Industries and open a 30k deal”.</p>
      <div className="cards">
        <div className="card"><div className="label">Open pipeline</div><div className="value">{money.format(open.reduce((sum, deal) => sum + deal.value, 0))}</div></div>
        <div className="card"><div className="label">Open deals</div><div className="value">{open.length}</div></div>
        <div className="card"><div className="label">Companies</div><div className="value">{store.companies.length}</div></div>
        <div className="card"><div className="label">Contacts</div><div className="value">{store.contacts.length}</div></div>
      </div>
      <section>
        <h2>Latest deals</h2>
        <table>
          <thead><tr><th>Deal</th><th>Stage</th><th>Value</th></tr></thead>
          <tbody>
            {store.deals.slice(-5).reverse().map((deal) => (
              <tr key={deal.id}>
                <td><Link href={`/deals/${deal.id}`}>{deal.title}</Link></td>
                <td>{deal.stage}</td>
                <td className="num">{money.format(deal.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
