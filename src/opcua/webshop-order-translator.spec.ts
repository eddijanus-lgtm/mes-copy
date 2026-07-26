import { translateWebshopOrder } from './webshop-order-translator';

const definitions = [
  {
    key: 'lidColour',
    sourceKey: 'external_lid',
    signalKey: 'parameter-a',
    label: 'Lid colour',
    type: 'number' as const,
    required: true,
  },
  {
    key: 'fillAmount',
    sourceKey: 'external_fill',
    signalKey: 'parameter-b',
    label: 'Fill amount',
    type: 'number' as const,
    required: true,
  },
];

describe('translateWebshopOrder', () => {
  it('maps arbitrary external fields through profile definitions', () => {
    expect(
      translateWebshopOrder(
        {
          order_name: '#WEB-ORDER-123',
          part_no: 'PART-X',
          params: {
            external_lid: true,
            external_fill: 12.5,
          },
        },
        definitions,
      ),
    ).toEqual({
      orderName: '#WEB-ORDER-123',
      partNo: 'PART-X',
      parameters: { lidColour: 1, fillAmount: 12.5 },
      xAuftragAusstehend: undefined,
      uiAnzahlAustehenderAuftraege: undefined,
    });
  });

  it('rejects missing profile-required parameters', () => {
    expect(() =>
      translateWebshopOrder(
        { params: { external_lid: 1 } },
        definitions,
      ),
    ).toThrow('Missing required fields: external_fill');
  });

  it.each([
    ['negative', -1],
    ['non-numeric', 'red'],
  ])('rejects a %s configured value', (_description, external_fill) => {
    expect(() =>
      translateWebshopOrder(
        {
          params: {
            external_lid: 1,
            external_fill,
          },
        },
        definitions,
      ),
    ).toThrow('external_fill must be a non-negative number');
  });

  it('accepts generic parameters when no mapping is configured', () => {
    expect(
      translateWebshopOrder({
        orderName: 'GENERIC-1',
        productId: 'product-1',
        temperature: 21.5,
        pressure: 3,
      }),
    ).toEqual({
      orderName: 'GENERIC-1',
      productId: 'product-1',
      parameters: { temperature: 21.5, pressure: 3 },
      xAuftragAusstehend: undefined,
      uiAnzahlAustehenderAuftraege: undefined,
    });
  });
});
