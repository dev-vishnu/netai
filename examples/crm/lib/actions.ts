'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { requireAdmin } from './session';
import { nextId, store, type Settings, type Stage } from './store';

// The same functions back the forms on the pages and the agent's actions in agent.ts.

export async function createCompany(input: { name: string; industry: string; website?: string }) {
  const company = { id: nextId('co'), ...input };
  store.companies.push(company);
  revalidatePath('/companies');
  return company;
}

export async function updateCompany(companyId: string, patch: { name?: string; industry?: string; website?: string }) {
  const company = store.companies.find((candidate) => candidate.id === companyId);
  if (!company) throw new Error(`No company ${companyId}`);
  Object.assign(company, patch);
  revalidatePath(`/companies/${companyId}`);
  return company;
}

export async function createContact(input: { companyId: string; name: string; email: string; title?: string }) {
  if (!store.companies.some((company) => company.id === input.companyId))
    throw new Error(`No company ${input.companyId}`);
  const contact = { id: nextId('c'), ...input };
  store.contacts.push(contact);
  revalidatePath('/contacts');
  return contact;
}

export async function updateContact(contactId: string, patch: { name?: string; email?: string; title?: string }) {
  const contact = store.contacts.find((candidate) => candidate.id === contactId);
  if (!contact) throw new Error(`No contact ${contactId}`);
  Object.assign(contact, patch);
  revalidatePath(`/contacts/${contactId}`);
  return contact;
}

export async function createDeal(input: { companyId: string; title: string; value: number }) {
  if (!store.companies.some((company) => company.id === input.companyId))
    throw new Error(`No company ${input.companyId}`);
  const stage: Stage = 'lead';
  const deal = { id: nextId('d'), ...input, stage, history: [{ stage, at: new Date().toISOString() }] };
  store.deals.push(deal);
  revalidatePath('/deals');
  return deal;
}

export async function moveDeal(dealId: string, stage: Stage) {
  const deal = store.deals.find((candidate) => candidate.id === dealId);
  if (!deal) throw new Error(`No deal ${dealId}`);
  deal.stage = stage;
  deal.history.push({ stage, at: new Date().toISOString() });
  revalidatePath('/deals');
  return deal;
}

export async function moveDealFromForm(formData: FormData) {
  await moveDeal(String(formData.get('dealId')), String(formData.get('stage')) as Stage);
}

export async function createCompanyFromForm(formData: FormData) {
  await createCompany({ name: String(formData.get('name')), industry: String(formData.get('industry')) });
}

export async function updateSettings(patch: Partial<Settings>) {
  await requireAdmin();
  Object.assign(store.settings, patch);
  revalidatePath('/settings');
  return store.settings;
}

export async function switchRole() {
  const jar = await cookies();
  jar.set('role', jar.get('role')?.value === 'member' ? 'admin' : 'member');
  revalidatePath('/', 'layout');
}
