#!/usr/bin/env node
import path from 'node:path';
import { generateManifest } from './scan';

const [command = 'generate', root = '.'] = process.argv.slice(2);

if (command !== 'generate') {
  console.error('usage: netai generate [project-root]');
  process.exit(1);
}

const { file, routes } = generateManifest(path.resolve(root));
console.log(`[netai] wrote ${path.relative(process.cwd(), file)} (${routes} routes)`);
