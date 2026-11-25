import { cookies } from 'next/headers';

export interface User {
  name: string;
  role: 'admin' | 'member';
}

/** A stand-in for real auth: the `role` cookie picks who you are, so the demo can show gated routes. */
export async function currentUser(): Promise<User> {
  const role = (await cookies()).get('role')?.value === 'member' ? 'member' : 'admin';
  return { name: role === 'admin' ? 'Ada (admin)' : 'Max (member)', role };
}

export async function requireAdmin(): Promise<User> {
  const user = await currentUser();
  if (user.role !== 'admin') throw new Error('Only admins can do that.');
  return user;
}
