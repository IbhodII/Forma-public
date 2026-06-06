import {TimeoutError, withTimeout} from '../asyncTimeout';

describe('withTimeout', () => {
  it('resolves when promise completes in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'test')).resolves.toBe(42);
  });

  it('rejects with TimeoutError when promise is slow', async () => {
    await expect(
      withTimeout(
        new Promise(resolve => setTimeout(() => resolve(1), 200)),
        50,
        'slow-op',
      ),
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});
