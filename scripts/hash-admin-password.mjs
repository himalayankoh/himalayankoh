// Generate a hashed admin login for ADMIN_LOGIN_ACCOUNTS.
//
//   npm run admin:hash -- "the password" "8002salman@gmail.com" "Salman Bashir"
//
// prints the whole `identifier:hash[:display name]` entry to paste into the
// environment. The display name is what the console header shows; leave it off
// and the console shows the identifier itself.
//
//   npm run admin:hash -- "the password"
//
// prints just the digest, if you would rather assemble the entry yourself.
//
// The password is read from the command line and never written anywhere: only
// the digest goes into your environment file, and the password cannot be read
// back out of it afterwards. Nothing here talks to WordPress — these logins are
// the deployment's own, independent of any WordPress user.

import { createHash } from 'node:crypto';

const MIN_PASSWORD_LENGTH = 8;

const [, , password, identifier, displayName] = process.argv;

if (!password) {
  console.error('Usage: npm run admin:hash -- "the password" [identifier] [display name]');
  console.error('  e.g. npm run admin:hash -- "S3cret-pass" "8002salman@gmail.com" "Salman Bashir"');
  process.exit(1);
}

if (password.length < MIN_PASSWORD_LENGTH) {
  // A nudge, not a rule: this is the password on the owner's admin console.
  console.error(
    `Refusing: that password is ${password.length} characters. Use at least ${MIN_PASSWORD_LENGTH}.`
  );
  process.exit(1);
}

const hash = createHash('sha256').update(password, 'utf8').digest('hex');

console.log('');
if (identifier) {
  const name = (displayName || '').trim();
  const entry = `${identifier.trim().toLowerCase()}:${hash}${name ? `:${name}` : ''}`;
  console.log('Add this entry to ADMIN_LOGIN_ACCOUNTS (comma-separate several):');
  console.log('');
  console.log(`  ${entry}`);
  console.log('');
  console.log('Applying it to a running deployment, e.g.:');
  console.log(`  ADMIN_LOGIN_ACCOUNTS="${entry}"`);
} else {
  console.log('Password digest (SHA-256):');
  console.log('');
  console.log(`  ${hash}`);
}
console.log('');
console.log('The password itself is not stored anywhere, so keep it somewhere you can find it —');
console.log('it cannot be recovered from this digest.');
console.log('');
