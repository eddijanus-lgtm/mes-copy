import { translateWebshopOrder } from './webshop-order-translator';

describe('translateWebshopOrder', () => {
  it('translates the documented nested webshop payload', () => {
    expect(
      translateWebshopOrder({
        order_name: '#WEB-ORDER-123',
        params: {
          bDeckelfarbe: true,
          uiKugelRot: 10,
          uiKugelGruen: 20,
          uiKugelBlau: 30,
        },
      }),
    ).toEqual({
      orderName: '#WEB-ORDER-123',
      bDeckelfarbe: 1,
      uiKugelRot: 10,
      uiKugelGruen: 20,
      uiKugelBlau: 30,
      xAuftragAusstehend: false,
      uiAnzahlAustehenderAuftraege: 0,
    });
  });

  it('translates a false lid color to zero', () => {
    expect(
      translateWebshopOrder({
        order_name: '#WEB-ORDER-124',
        params: {
          bDeckelfarbe: false,
          uiKugelRot: 1,
          uiKugelGruen: 2,
          uiKugelBlau: 3,
        },
      }).bDeckelfarbe,
    ).toBe(0);
  });

  it.each([
    [
      'order_name',
      {
        params: {
          bDeckelfarbe: true,
          uiKugelRot: 1,
          uiKugelGruen: 2,
          uiKugelBlau: 3,
        },
      },
    ],
    ['params', { order_name: '#WEB-ORDER-125' }],
    [
      'uiKugelBlau',
      {
        order_name: '#WEB-ORDER-126',
        params: {
          bDeckelfarbe: true,
          uiKugelRot: 1,
          uiKugelGruen: 2,
        },
      },
    ],
  ])('rejects a documented payload without %s', (_field, payload) => {
    expect(() => translateWebshopOrder(payload)).toThrow();
  });

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['non-numeric', 'red'],
  ])('rejects a %s ball count', (_description, uiKugelRot) => {
    expect(() =>
      translateWebshopOrder({
        order_name: '#WEB-ORDER-127',
        params: {
          bDeckelfarbe: true,
          uiKugelRot,
          uiKugelGruen: 2,
          uiKugelBlau: 3,
        },
      }),
    ).toThrow('uiKugelRot must be a non-negative integer');
  });

  it('keeps accepting the legacy flat payload', () => {
    expect(
      translateWebshopOrder({
        bDeckelfarbe: 1,
        uiKugelRot: 10,
        uiKugelGruen: 20,
        uiKugelBlau: 30,
      }),
    ).toEqual({
      bDeckelfarbe: 1,
      uiKugelRot: 10,
      uiKugelGruen: 20,
      uiKugelBlau: 30,
      xAuftragAusstehend: false,
      uiAnzahlAustehenderAuftraege: 0,
    });
  });
});
