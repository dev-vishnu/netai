import type { User } from './lib/session';

declare module '@netai/core' {
  interface NetaiContext {
    user: User;
  }
}
