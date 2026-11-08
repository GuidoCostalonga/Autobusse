/*
 * Autobusse: tavolozza.
 * Ogni colore ha un nome e un simbolo, così il gioco non si affida al solo
 * colore. L'ordine conta: i livelli con meno colori usano i primi.
 */
(function (radice, fabbrica) {
  'use strict';
  var modulo = fabbrica();
  if (typeof module === 'object' && module.exports) module.exports = modulo;
  else radice.AutobusseColori = modulo;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var COLORI = [
    { id: 'rosso', nome: 'Rosso', simbolo: 'cuore', nomeSimbolo: 'cuore', fondo: '#e0393e', scuro: '#a3202a', testo: '#ffffff' },
    { id: 'blu', nome: 'Blu', simbolo: 'rombo', nomeSimbolo: 'rombo', fondo: '#2463d6', scuro: '#163f8f', testo: '#ffffff' },
    { id: 'giallo', nome: 'Giallo', simbolo: 'stella', nomeSimbolo: 'stella', fondo: '#f7c325', scuro: '#b98a00', testo: '#2b2100' },
    { id: 'verde', nome: 'Verde', simbolo: 'triangolo', nomeSimbolo: 'triangolo', fondo: '#2f9e4f', scuro: '#1c6b33', testo: '#ffffff' },
    { id: 'viola', nome: 'Viola', simbolo: 'esagono', nomeSimbolo: 'esagono', fondo: '#8a4bc2', scuro: '#5d2e8a', testo: '#ffffff' },
    { id: 'arancione', nome: 'Arancione', simbolo: 'cerchio', nomeSimbolo: 'cerchio', fondo: '#f27a1a', scuro: '#b25300', testo: '#2b1400' },
    { id: 'azzurro', nome: 'Azzurro', simbolo: 'quadrato', nomeSimbolo: 'quadrato', fondo: '#36bfe0', scuro: '#1a87a3', testo: '#06262f' },
    { id: 'rosa', nome: 'Rosa', simbolo: 'croce', nomeSimbolo: 'croce', fondo: '#ef6fb4', scuro: '#b23d7c', testo: '#33061d' }
  ];
  var PER_ID = {};
  COLORI.forEach(function (c) { PER_ID[c.id] = c; });
  return {
    COLORI: COLORI,
    ID: COLORI.map(function (c) { return c.id; }),
    trova: function (id) { return PER_ID[id] || null; }
  };
});
