export const STAGES = ['lead', 'qualified', 'proposal', 'won', 'lost'] as const;
export type Stage = (typeof STAGES)[number];

export interface Company {
  id: string;
  name: string;
  industry: string;
  website?: string;
}

export interface Contact {
  id: string;
  companyId: string;
  name: string;
  email: string;
  title?: string;
}

export interface Deal {
  id: string;
  companyId: string;
  title: string;
  value: number;
  stage: Stage;
  history: { stage: Stage; at: string }[];
}

export interface Settings {
  workspaceName: string;
  currency: 'USD' | 'EUR' | 'INR';
}

interface Store {
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  settings: Settings;
  sequence: number;
}

const seeded = (): Store => {
  const at = new Date('2026-11-01T09:00:00Z').toISOString();
  return {
    sequence: 100,
    settings: { workspaceName: 'Northwind Sales', currency: 'USD' },
    companies: [
      { id: 'acme', name: 'Acme Corp', industry: 'Manufacturing', website: 'https://acme.example' },
      { id: 'globex', name: 'Globex', industry: 'Energy', website: 'https://globex.example' },
      { id: 'initech', name: 'Initech', industry: 'Software' }
    ],
    contacts: [
      { id: 'c_1', companyId: 'acme', name: 'Wile Coyote', email: 'wile@acme.example', title: 'Head of R&D' },
      { id: 'c_2', companyId: 'globex', name: 'Hank Scorpio', email: 'hank@globex.example', title: 'CEO' },
      { id: 'c_3', companyId: 'initech', name: 'Bill Lumbergh', email: 'bill@initech.example', title: 'VP' }
    ],
    deals: [
      { id: 'd_1', companyId: 'acme', title: 'Rocket skates rollout', value: 42000, stage: 'proposal', history: [{ stage: 'proposal', at }] },
      { id: 'd_2', companyId: 'globex', title: 'Plant monitoring renewal', value: 120000, stage: 'qualified', history: [{ stage: 'qualified', at }] },
      { id: 'd_3', companyId: 'initech', title: 'TPS report automation', value: 18000, stage: 'lead', history: [{ stage: 'lead', at }] }
    ]
  };
};

// Survives dev reloads; a real app would use a database.
const holder = globalThis as typeof globalThis & { netaiCrmStore?: Store };
export const store: Store = (holder.netaiCrmStore ??= seeded());

export const nextId = (prefix: string) => `${prefix}_${++store.sequence}`;

export const companyName = (companyId: string) =>
  store.companies.find((company) => company.id === companyId)?.name ?? companyId;
