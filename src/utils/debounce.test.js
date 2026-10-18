import { debounce } from './debounce';

describe('debounce (B-84)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('uma rajada vira uma chamada só, no fim', () => {
    const fn = jest.fn();
    const d = debounce(fn, 500);

    d(); d(); d();
    jest.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel descarta a chamada pendente', () => {
    const fn = jest.fn();
    const d = debounce(fn, 500);

    d();
    d.cancel();
    jest.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
