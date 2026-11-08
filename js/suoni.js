/*
 * Autobusse: effetti sonori sintetizzati con Web Audio.
 * Nessun file audio da scaricare. Il contesto audio nasce al primo gesto
 * del giocatore, come chiedono i navigatori.
 */
(function (radice) {
  'use strict';
  var ctx = null;
  var attivo = true;
  var ultimoSali = 0;

  function contesto() {
    if (!attivo) return null;
    if (!ctx) {
      var AC = radice.AudioContext || radice.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    return ctx;
  }

  function tono(freq, durata, tipo, volume, ritardo, freqFinale) {
    var c = contesto();
    if (!c) return;
    var t0 = c.currentTime + (ritardo || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = tipo || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (freqFinale) osc.frequency.exponentialRampToValueAtTime(freqFinale, t0 + durata);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(volume || 0.1, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durata);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + durata + 0.02);
  }

  var SUONI = {
    clic: function () { tono(660, 0.05, 'triangle', 0.05); },
    uscita: function () { tono(260, 0.22, 'triangle', 0.1, 0, 520); },
    sali: function () {
      var ora = Date.now();
      if (ora - ultimoSali < 45) return;
      ultimoSali = ora;
      tono(880 + Math.random() * 120, 0.06, 'sine', 0.05);
    },
    partenza: function () { tono(392, 0.14, 'square', 0.04); tono(523, 0.22, 'square', 0.04, 0.15); },
    blocco: function () { tono(150, 0.2, 'sawtooth', 0.06, 0, 110); },
    potere: function () { tono(660, 0.1, 'sine', 0.07); tono(990, 0.12, 'sine', 0.07, 0.08); tono(1320, 0.16, 'sine', 0.06, 0.16); },
    rivela: function () { tono(740, 0.1, 'triangle', 0.06); tono(1100, 0.12, 'triangle', 0.05, 0.08); },
    vittoria: function () { [523, 659, 784, 1046].forEach(function (f, i) { tono(f, 0.22, 'triangle', 0.08, i * 0.12); }); },
    stallo: function () { [392, 330, 262].forEach(function (f, i) { tono(f, 0.25, 'sine', 0.08, i * 0.16); }); }
  };

  radice.AutobusseSuoni = {
    suona: function (nome) { if (attivo && SUONI[nome]) { try { SUONI[nome](); } catch (e) { /* audio non essenziale */ } } },
    imposta: function (v) { attivo = !!v; if (!attivo && ctx && ctx.suspend) ctx.suspend(); },
    attivo: function () { return attivo; }
  };
})(typeof self !== 'undefined' ? self : this);
