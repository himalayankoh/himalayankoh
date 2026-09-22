import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  areAdminAccountsConfigured,
  hashAdminPassword,
  listAdminAccounts,
  verifyAdminAccount,
} from './adminAccounts';

// A real digest, so the test exercises the same value the environment would hold.
const PASSWORD = 'S3cret-pass';
let passwordHash = '';

const originalAccounts = process.env.ADMIN_LOGIN_ACCOUNTS;

beforeEach(async () => {
  passwordHash = await hashAdminPassword(PASSWORD);
  process.env.ADMIN_LOGIN_ACCOUNTS = `8002salman@gmail.com:${passwordHash}`;
});

afterEach(() => {
  if (originalAccounts === undefined) delete process.env.ADMIN_LOGIN_ACCOUNTS;
  else process.env.ADMIN_LOGIN_ACCOUNTS = originalAccounts;
});

describe('hashAdminPassword', () => {
  it('produces a stable 64-character lowercase hex digest', async () => {
    const first = await hashAdminPassword(PASSWORD);
    const second = await hashAdminPassword(PASSWORD);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    // Cross-checked against Node's own SHA-256: the module uses Web Crypto so the
    // same code runs in the Workers runtime, and this proves the two agree.
    expect(first).toBe(createHash('sha256').update(PASSWORD, 'utf8').digest('hex'));
  });

  it('does not hash two different passwords to the same digest', async () => {
    expect(await hashAdminPassword('one-password')).not.toBe(await hashAdminPassword('another-one'));
  });
});

describe('listAdminAccounts', () => {
  it('parses an identifier and digest pair', () => {
    const accounts = listAdminAccounts(`you@example.com:${'a'.repeat(64)}`);

    expect(accounts).toEqual([{ identifier: 'you@example.com', passwordHash: 'a'.repeat(64) }]);
  });

  it('parses an identifier, digest and display name', () => {
    const accounts = listAdminAccounts(
      `admin@himalayankoh.com:${'a'.repeat(64)}:Salman Bashir`
    );

    expect(accounts).toEqual([
      { identifier: 'admin@himalayankoh.com', passwordHash: 'a'.repeat(64), name: 'Salman Bashir' },
    ]);
  });

  it('keeps a display name verbatim and lets it contain colons', () => {
    const accounts = listAdminAccounts(`urn:admin:me:${'c'.repeat(64)}:Ops: night shift`);

    expect(accounts[0]).toMatchObject({ identifier: 'urn:admin:me', name: 'Ops: night shift' });
  });

  it('omits the name entirely when the entry has no third field', () => {
    const accounts = listAdminAccounts(`you@example.com:${'a'.repeat(64)}`);

    expect(accounts[0]).not.toHaveProperty('name');
  });

  it('still parses an identifier that is itself a digest-shaped string', () => {
    const accounts = listAdminAccounts(`${'f'.repeat(64)}:${'a'.repeat(64)}:Owner`);

    expect(accounts[0]).toMatchObject({ identifier: 'f'.repeat(64), name: 'Owner' });
  });

  it('parses several accounts and lower-cases identifiers', () => {
    const accounts = listAdminAccounts(
      `ONE@Example.com:${'a'.repeat(64)}, two@example.com:${'b'.repeat(64)}`
    );

    expect(accounts.map((account) => account.identifier)).toEqual([
      'one@example.com',
      'two@example.com',
    ]);
  });

  it('splits at the last colon so an identifier may contain one', () => {
    const accounts = listAdminAccounts(`urn:admin:me:${'c'.repeat(64)}`);

    expect(accounts[0].identifier).toBe('urn:admin:me');
    expect(accounts[0].passwordHash).toBe('c'.repeat(64));
  });

  it('skips malformed entries without discarding the good ones', () => {
    const accounts = listAdminAccounts(
      `not-a-pair, , you@example.com:${'a'.repeat(64)}, other@example.com:short-hash, :${'d'.repeat(64)}`
    );

    expect(accounts.map((account) => account.identifier)).toEqual(['you@example.com']);
  });

  it('returns nothing when unset or empty', () => {
    expect(listAdminAccounts('')).toEqual([]);
    expect(listAdminAccounts('   ')).toEqual([]);
  });
});

describe('verifyAdminAccount', () => {
  it('accepts the configured identifier and password', async () => {
    await expect(verifyAdminAccount('8002salman@gmail.com', PASSWORD)).resolves.toMatchObject({
      identifier: '8002salman@gmail.com',
    });
  });

  it('returns the display name configured beside the account', async () => {
    process.env.ADMIN_LOGIN_ACCOUNTS = `admin@himalayankoh.com:${passwordHash}:Salman Bashir`;

    await expect(verifyAdminAccount('admin@himalayankoh.com', PASSWORD)).resolves.toMatchObject({
      identifier: 'admin@himalayankoh.com',
      name: 'Salman Bashir',
    });
  });

  it('accepts the identifier case-insensitively', async () => {
    await expect(verifyAdminAccount('8002SALMAN@GMAIL.com', PASSWORD)).resolves.toMatchObject({
      identifier: '8002salman@gmail.com',
    });
  });

  it('rejects a wrong password, and never treats it as case-insensitive', async () => {
    await expect(verifyAdminAccount('8002salman@gmail.com', 'wrong-password')).resolves.toBeNull();
    await expect(verifyAdminAccount('8002salman@gmail.com', PASSWORD.toUpperCase())).resolves.toBeNull();
  });

  it('rejects an unknown identifier even with the right password', async () => {
    await expect(verifyAdminAccount('someone@else.com', PASSWORD)).resolves.toBeNull();
  });

  it('rejects a blank identifier or password', async () => {
    await expect(verifyAdminAccount('', PASSWORD)).resolves.toBeNull();
    await expect(verifyAdminAccount('8002salman@gmail.com', '')).resolves.toBeNull();
  });

  it('accepts a login name that is not an email address', async () => {
    process.env.ADMIN_LOGIN_ACCOUNTS = `salman:${passwordHash}`;

    await expect(verifyAdminAccount('salman', PASSWORD)).resolves.toMatchObject({
      identifier: 'salman',
    });
  });

  it('matches whichever of several accounts was configured', async () => {
    const second = await hashAdminPassword('another-password');
    process.env.ADMIN_LOGIN_ACCOUNTS = `one@example.com:${passwordHash},two@example.com:${second}`;

    await expect(verifyAdminAccount('two@example.com', 'another-password')).resolves.toMatchObject({
      identifier: 'two@example.com',
    });
    // The first account's password must not open the second account.
    await expect(verifyAdminAccount('two@example.com', PASSWORD)).resolves.toBeNull();
  });

  it('accepts nothing when no account is configured', async () => {
    delete process.env.ADMIN_LOGIN_ACCOUNTS;

    expect(areAdminAccountsConfigured()).toBe(false);
    await expect(verifyAdminAccount('8002salman@gmail.com', PASSWORD)).resolves.toBeNull();
  });

  it('reports itself configured once a valid account exists', () => {
    expect(areAdminAccountsConfigured()).toBe(true);
  });
});
