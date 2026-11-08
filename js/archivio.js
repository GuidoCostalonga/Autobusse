/*
 * Autobusse: salvataggio locale.
 * Conserva nel navigatore (localStorage) solo il livello sbloccato, i livelli
 * completati e le impostazioni di audio e animazioni. Nessun dato lascia
 * il dispositivo. Se l'archivio non è disponibile (navigazione privata,
 * archiviazione bloccata) il gioco funziona lo stesso, senza ricordare nulla.
 */
(function (radice) {
  'use strict';
  var CHIAVE = 'autobusse.v1';

  function vuoto() {
    return { versione: 1, sbloccato: 1, completati: {}, impostazioni: { audio: true, animazioni: null } };
  }

  function leggi() {
    var dati = vuoto();
    try {
      var grezzo = radice.localStorage.getItem(CHIAVE);
      if (!grezzo) return dati;
      var o = JSON.parse(grezzo);
      if (o && typeof o === 'object') {
        if (Number.isInteger(o.sbloccato) && o.sbloccato >= 1) dati.sbloccato = o.sbloccato;
        if (o.completati && typeof o.completati === 'object') {
          Object.keys(o.completati).forEach(function (k) {
            var v = o.completati[k];
            if (v && typeof v === 'object') dati.completati[k] = { senzaAiuti: !!v.senzaAiuti };
          });
        }
        if (o.impostazioni && typeof o.impostazioni === 'object') {
          if (typeof o.impostazioni.audio === 'boolean') dati.impostazioni.audio = o.impostazioni.audio;
          if (typeof o.impostazioni.animazioni === 'boolean') dati.impostazioni.animazioni = o.impostazioni.animazioni;
        }
      }
    } catch (e) { /* archivio non disponibile o danneggiato: si riparte da zero */ }
    return dati;
  }

  var dati = leggi();

  function scrivi() {
    try { radice.localStorage.setItem(CHIAVE, JSON.stringify(dati)); return true; }
    catch (e) { return false; }
  }

  radice.AutobusseArchivio = {
    sbloccato: function () { return dati.sbloccato; },
    completato: function (id) { return dati.completati[id] || null; },
    completa: function (id, usati, totaleLivelli) {
      var prec = dati.completati[id];
      dati.completati[id] = { senzaAiuti: (prec && prec.senzaAiuti) || usati === 0 };
      dati.sbloccato = Math.min(totaleLivelli, Math.max(dati.sbloccato, id + 1));
      scrivi();
    },
    impostazioni: function () { return { audio: dati.impostazioni.audio, animazioni: dati.impostazioni.animazioni }; },
    salvaImpostazioni: function (imp) {
      if (typeof imp.audio === 'boolean') dati.impostazioni.audio = imp.audio;
      if (imp.animazioni === null || typeof imp.animazioni === 'boolean') dati.impostazioni.animazioni = imp.animazioni;
      scrivi();
    },
    azzera: function () {
      var imp = dati.impostazioni;
      dati = vuoto();
      dati.impostazioni = imp;
      scrivi();
    }
  };
})(typeof self !== 'undefined' ? self : this);
