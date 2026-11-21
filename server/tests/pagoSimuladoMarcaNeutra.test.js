const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluarPagoSimuladoMarcaNeutra } = require('../src/services/pagoSimuladoMarcaNeutra');

const ENV_120 = { PAGO_SIMULADO_MARCA_NEUTRA: '1' };
const HEADERS_120 = {
  host: 'localhost:4003',
  'x-exelixi-marca': 'neutra',
  referer: 'https://cierrelmds.exelixitech.com/pagos/?product=rcv&marca=neutra',
};

test('120 con variable y marca neutra: permite el pago simulado', () => {
  const r = evaluarPagoSimuladoMarcaNeutra({ env: ENV_120, headers: HEADERS_120 });
  assert.deepEqual(r, { permitido: true, motivo: 'ok' });
});

test('marca neutra por query también cuenta', () => {
  const r = evaluarPagoSimuladoMarcaNeutra({
    env: ENV_120,
    headers: { host: 'localhost:4003' },
    query: { marca: 'neutra' },
  });
  assert.equal(r.permitido, true);
});

test('sin marca neutra: nunca simula', () => {
  for (const headers of [{ host: 'localhost:4003' }, { 'x-exelixi-marca': 'lm' }, {}]) {
    const r = evaluarPagoSimuladoMarcaNeutra({ env: ENV_120, headers });
    assert.equal(r.permitido, false);
    assert.equal(r.motivo, 'sin_marca_neutra');
  }
});

test('sin la variable (valor por defecto): nunca simula', () => {
  for (const env of [{}, { PAGO_SIMULADO_MARCA_NEUTRA: '0' }, { PAGO_SIMULADO_MARCA_NEUTRA: '' }, { PAGO_SIMULADO_MARCA_NEUTRA: 'si' }]) {
    const r = evaluarPagoSimuladoMarcaNeutra({ env, headers: HEADERS_120 });
    assert.equal(r.permitido, false);
    assert.equal(r.motivo, 'variable_desactivada');
  }
});

test('producción por host: nunca simula aunque llegue marca=neutra y la variable', () => {
  const casos = [
    { host: 'pagos.exelixitech.com', 'x-exelixi-marca': 'neutra' },
    { host: 'localhost:4003', 'x-forwarded-host': 'pagos.exelixitech.com', 'x-exelixi-marca': 'neutra' },
    { host: 'localhost:4003', origin: 'https://pagos.exelixitech.com', 'x-exelixi-marca': 'neutra' },
    { host: 'localhost:4003', referer: 'https://PAGOS.exelixitech.com/?marca=neutra', 'x-exelixi-marca': 'neutra' },
  ];
  for (const headers of casos) {
    const r = evaluarPagoSimuladoMarcaNeutra({ env: ENV_120, headers });
    assert.equal(r.permitido, false, JSON.stringify(headers));
    assert.equal(r.motivo, 'host_produccion');
  }
});

test('hosts de producción adicionales por PAGOS_HOSTS_PRODUCCION', () => {
  const r = evaluarPagoSimuladoMarcaNeutra({
    env: { ...ENV_120, PAGOS_HOSTS_PRODUCCION: 'marketplace.exelixitech.com, 172.30.149.75' },
    headers: { host: '172.30.149.75:4003', 'x-exelixi-marca': 'neutra' },
  });
  assert.equal(r.permitido, false);
  assert.equal(r.motivo, 'host_produccion');
});

test('producción por ENTORNO/APP_ENV: nunca simula', () => {
  for (const env of [
    { ...ENV_120, ENTORNO: 'produccion' },
    { ...ENV_120, ENTORNO: 'Production' },
    { ...ENV_120, APP_ENV: 'prod' },
  ]) {
    const r = evaluarPagoSimuladoMarcaNeutra({ env, headers: HEADERS_120 });
    assert.equal(r.permitido, false);
    assert.equal(r.motivo, 'entorno_produccion');
  }
});
