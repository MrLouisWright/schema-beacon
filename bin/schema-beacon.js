#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, SITE_OPTIONS, SITE_HELP } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'schema-beacon', version: pkg.version, configKey: 'schemaBeacon', rules: RULES,
  tagline: 'JSON-LD and microdata vs schema.org and Google rich-result requirements',
  usage: 'Usage: schema-beacon [site-dir] [options]',
  help: `${SITE_HELP}Checks
      --no-recommended        Only report required properties, not recommended ones
`,
  options: { ...SITE_OPTIONS, 'no-recommended': { type: 'boolean' } },
  run: async ({ dir, values: o, config, configFile }) => check(dir, { cli: o, recommended: o['no-recommended'] ? false : undefined, toolVersion: pkg.version }, config, configFile),
});
