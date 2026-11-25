import Link from 'next/link';
import { companyName, STAGES, store } from '@/lib/store';

export default function Deals() {
  return (
    <>
      <h1>Deals</h1>
      <p className="sub">The pipeline, by stage.</p>
      <div className="board">
        {STAGES.map((stage) => (
          <div className="column" key={stage}>
            <h2>{stage}</h2>
            {store.deals.filter((deal) => deal.stage === stage).map((deal) => (
              <div className="card" key={deal.id}>
                <Link href={`/deals/${deal.id}`}>{deal.title}</Link>
                <div className="label">{companyName(deal.companyId)} · {deal.value}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
