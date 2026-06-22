import { describe, expect, it } from 'vitest';
import { uniqueSourceNameForType } from './source-utils';

describe('uniqueSourceNameForType', () => {
  it('keeps the name when an existing source has the requested type', () => {
    expect(
      uniqueSourceNameForType('Iphone', 'camera', [
        { sources: [{ name: 'Iphone', type: 'camera' }] },
      ])
    ).toBe('Iphone');
  });

  it('creates a unique name when the same name belongs to a different source type', () => {
    expect(
      uniqueSourceNameForType('Iphone', 'camera', [
        { sources: [{ name: 'Iphone', type: 'image' }] },
      ])
    ).toBe('Iphone 2');
  });

  it('skips existing suffixed names when resolving a collision', () => {
    expect(
      uniqueSourceNameForType('Iphone', 'camera', [
        {
          sources: [
            { name: 'Iphone', type: 'image' },
            { name: 'Iphone 2', type: 'browser' },
          ],
        },
      ])
    ).toBe('Iphone 3');
  });

  it('creates a unique name for same-type file sources when reuse is disabled', () => {
    expect(
      uniqueSourceNameForType('starting-soon', 'image', [
        { sources: [{ name: 'starting-soon', type: 'image' }] },
      ], { reuseSameType: false })
    ).toBe('starting-soon 2');
  });
});
