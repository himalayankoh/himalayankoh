import { describe, expect, it } from 'vitest';
import { generateMetadata } from './page';

describe('blog index metadata', () => {
  it('describes the guides currently published without advertising unavailable products', () => {
    const metadata = generateMetadata();

    expect(metadata.description).toContain('cooking');
    expect(metadata.description).toContain('livestock salt-block management');
    expect(metadata.description).not.toMatch(/lamps|buying in bulk/i);
  });
});
