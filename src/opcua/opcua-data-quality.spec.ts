import { opcUaDataQuality } from './opcua-data-quality';

describe('opcUaDataQuality', () => {
  it('treats a missing OPC UA status as uncertain', () => {
    expect(opcUaDataQuality(undefined)).toBe('uncertain');
  });

  it('uses the OPC UA status methods when available', () => {
    expect(
      opcUaDataQuality({
        isGood: () => true,
      }),
    ).toBe('good');
    expect(
      opcUaDataQuality({
        isGood: () => false,
        isUncertain: () => true,
      }),
    ).toBe('uncertain');
  });

  it('maps bad OPC UA severity to bad quality', () => {
    expect(
      opcUaDataQuality({
        isGood: () => false,
        value: 0x80000000,
      }),
    ).toBe('bad');
  });
});
