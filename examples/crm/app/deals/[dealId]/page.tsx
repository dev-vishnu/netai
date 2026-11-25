import Link from 'next/link';
import { notFound } from 'next/navigation';
import { moveDealFromForm } from '@/lib/actions';
import { companyName, STAGES, store } from '@/lib/store';

export default async function DealPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const deal = store.deals.find((candidate) => candidate.id === dealId);
  if (!deal) notFound();
  return (
    <>
      <h1>{deal.title}</h1>
      <p className="sub"><Link href={`/companies/${deal.companyId}`}>{companyName(deal.companyId)}</Link> · {deal.value} {store.settings.currency}</p>
      <dl className="facts"><dt>Stage</dt><dd><strong>{deal.stage}</strong></dd></dl>
      <form className="inline" action={moveDealFromForm}>
        <input type="hidden" name="dealId" value={deal.id} />
        <select name="stage" defaultValue={deal.stage}>
          {STAGES.map((stage) => <option key={stage}>{stage}</option>)}
        </select>
        <button className="primary" type="submit">Move</button>
      </form>
      <section>
        <h2>History</h2>
        <table>
          <thead><tr><th>Stage</th><th>When</th></tr></thead>
          <tbody>
            {deal.history.map((entry, index) => (
              <tr key={index}><td>{entry.stage}</td><td>{new Date(entry.at).toLocaleString('en')}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
