import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, loadProfile, loadAccounts } from '../src/loader.js';
import { resolve } from 'node:path';

describe('Profile & Data Loader', () => {
  it('parses CSV data with various field types and quoted values', () => {
    const csv = `account_id,company_name,revenue,is_active,tags\nacc-1,"Acme, Inc.",5000000,true,"React;Node.js"\nacc-2,"Beta Corp",1200000,false,"Python"`;
    const rows = parseCSV(csv);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].account_id, 'acc-1');
    assert.equal(rows[0].company_name, 'Acme, Inc.');
    assert.equal(rows[0].revenue, 5000000);
    assert.equal(rows[0].is_active, true);
    assert.equal(rows[0].tags, 'React;Node.js');

    assert.equal(rows[1].account_id, 'acc-2');
    assert.equal(rows[1].is_active, false);
  });

  it('loads YAML profiles from disk', async () => {
    const profilePath = resolve('examples/b2b-saas.yaml');
    const profile = await loadProfile(profilePath);

    assert.ok(profile);
    assert.equal(profile.metadata.name, 'B2B SaaS Mid-Market');
    assert.ok(profile.scoring.firmographics);
    assert.ok(profile.scoring.technographics);
  });

  it('loads JSON accounts from disk', async () => {
    const accountsPath = resolve('examples/accounts.json');
    const accounts = await loadAccounts(accountsPath);

    assert.ok(Array.isArray(accounts));
    assert.ok(accounts.length >= 20);
    assert.equal(accounts[0].account_id, 'acme-corp');
  });

  it('loads CSV accounts from disk', async () => {
    const accountsPath = resolve('examples/accounts.csv');
    const accounts = await loadAccounts(accountsPath);

    assert.ok(Array.isArray(accounts));
    assert.ok(accounts.length >= 20);
    assert.equal(accounts[0].account_id, 'acme-corp');
  });
});
