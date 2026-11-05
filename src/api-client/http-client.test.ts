import { describe, it, expect } from 'vitest';
import { DryRunError, APIError } from './http-client.js';

describe('DryRunError', () => {
  it('sets method, url, and a descriptive message', () => {
    const err = new DryRunError('PUT', '/experiments/42/stop');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('DryRunError');
    expect(err.method).toBe('PUT');
    expect(err.url).toBe('/experiments/42/stop');
    expect(err.message).toBe('Dry run: PUT /experiments/42/stop — request not sent');
  });

  it('is not an instance of APIError', () => {
    const err = new DryRunError('POST', '/experiments');
    expect(err).not.toBeInstanceOf(APIError);
  });
});
