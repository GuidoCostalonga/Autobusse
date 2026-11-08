/*
 * Autobusse: motore di gioco.
 *
 * Nessun accesso al DOM: il modulo funziona identico nel navigatore e in Node,
 * dove le prove lo caricano con require(). Tutte le regole stanno qui:
 * geometria del parcheggio, uscite, zona di attesa, fila dei passeggeri,
 * imbarco, partenza, blocco, vittoria, potenziamenti, generazione delle file
 * risolvibili e risolutore di controllo.
 */
(function (radice, fabbrica) {
  'use strict';
  var modulo = fabbrica();
  if (typeof module === 'object' && module.exports) module.exports = modulo;
  else radice.AutobusseMotore = modulo;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Costanti                                                            */
  /* ------------------------------------------------------------------ */

  var DIREZIONI = {
    N: { dx: 0, dy: -1, nome: 'verso l’alto', breve: 'su' },
    S: { dx: 0, dy: 1, nome: 'verso il basso', breve: 'giù' },
    E: { dx: 1, dy: 0, nome: 'verso destra', breve: 'destra' },
    O: { dx: -1, dy: 0, nome: 'verso sinistra', breve: 'sinistra' }
  };

  /* Posti predefiniti per lunghezza (in caselle). Si possono sostituire
     nella definizione del singolo mezzo, da 3 a 40. */
  var POSTI_PREDEFINITI = { 2: 4, 3: 6, 4: 10, 5: 16, 6: 24 };
  var POSTI_MIN = 3;
  var POSTI_MAX = 40;

  var TIPI = {
    2: 'Minibus',
    3: 'Autobus',
    4: 'Autobus lungo',
    5: 'Autobus snodato',
    6: 'Gran turismo'
  };

  /* Quanti passeggeri considera «Riordina fila». */
  var FINESTRA_RIORDINO = 10;

  /* ------------------------------------------------------------------ */
  /* Numeri casuali con seme (riproducibili nelle prove)                 */
  /* ------------------------------------------------------------------ */

  function creaCasuale(seme) {
    var s = (seme >>> 0) || 0x9e3779b9;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mescola(elenco, casuale) {
    for (var i = elenco.length - 1; i > 0; i--) {
      var j = Math.floor(casuale() * (i + 1));
      var t = elenco[i]; elenco[i] = elenco[j]; elenco[j] = t;
    }
    return elenco;
  }

  /* ------------------------------------------------------------------ */
  /* Lettura della definizione di un livello                             */
  /* ------------------------------------------------------------------ */

  /*
   * Formato della definizione (vedi js/livelli.js):
   *   mappa:  righe di testo, un carattere per casella.
   *           '.' casella libera, una lettera per ogni autobus (le caselle
   *           con la stessa lettera formano il mezzo), una cifra per un garage.
   *   mezzi:  { lettera: 'E' | 'S?' | 'O:3' ... }
   *           direzione di uscita (N, S, E, O), '?' colore nascosto,
   *           ':n' posti diversi da quelli predefiniti.
   *   garage: { cifra: { dir: 'S', mezzi: ['3', '2:4'] } }
   *           i mezzi in fila nel garage, dal primo all'ultimo; ogni voce è
   *           la lunghezza, con ':n' facoltativo per i posti.
   */
  function leggiSpecMezzo(spec, chiave, errori) {
    var m = /^([NSEO])(\?)?(?::(\d+))?$/.exec(String(spec));
    if (!m) { errori.push('Mezzo «' + chiave + '»: specifica non valida «' + spec + '»'); return null; }
    return { dir: m[1], nascosto: !!m[2], posti: m[3] ? Number(m[3]) : null };
  }

  function interpretaLivello(def) {
    var errori = [];
    var righe = (def.mappa || []).map(function (r) { return r.replace(/\s+/g, ''); });
    var alt = righe.length;
    var larg = alt ? righe[0].length : 0;
    righe.forEach(function (r, y) {
      if (r.length !== larg) errori.push('Riga ' + y + ': lunghezza ' + r.length + ' invece di ' + larg);
    });

    var celleLettera = {};
    var garageCelle = {};
    for (var y = 0; y < alt; y++) {
      for (var x = 0; x < larg; x++) {
        var c = righe[y][x] || '.';
        if (c === '.') continue;
        if (/[0-9]/.test(c)) {
          if (garageCelle[c]) errori.push('Garage «' + c + '» ripetuto');
          garageCelle[c] = { x: x, y: y };
        } else if (/[A-Za-z]/.test(c)) {
          (celleLettera[c] = celleLettera[c] || []).push({ x: x, y: y });
        } else {
          errori.push('Carattere non previsto «' + c + '» in ' + x + ',' + y);
        }
      }
    }

    var mezzi = [];
    var specMezzi = def.mezzi || {};
    Object.keys(celleLettera).sort().forEach(function (lettera) {
      var celle = celleLettera[lettera];
      var spec = leggiSpecMezzo(specMezzi[lettera], lettera, errori);
      if (!spec) return;
      var xs = celle.map(function (k) { return k.x; });
      var ys = celle.map(function (k) { return k.y; });
      var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
      var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
      var orizzontale = minY === maxY;
      var verticale = minX === maxX;
      var lun = celle.length;
      if (!orizzontale && !verticale) { errori.push('Mezzo «' + lettera + '» non è dritto'); return; }
      if ((orizzontale && maxX - minX + 1 !== lun) || (verticale && maxY - minY + 1 !== lun)) {
        errori.push('Mezzo «' + lettera + '» spezzato'); return;
      }
      if (lun < 2 || lun > 6) { errori.push('Mezzo «' + lettera + '»: lunghezza ' + lun + ' fuori misura'); return; }
      var dirOrizz = spec.dir === 'E' || spec.dir === 'O';
      if (dirOrizz !== orizzontale || (lun > 1 && dirOrizz === verticale)) {
        errori.push('Mezzo «' + lettera + '»: direzione ' + spec.dir + ' non coerente con la posizione'); return;
      }
      mezzi.push({
        id: lettera,
        x: minX, y: minY, dir: spec.dir, lun: lun,
        posti: spec.posti || POSTI_PREDEFINITI[lun],
        nascosto: spec.nascosto,
        garage: null
      });
    });
    Object.keys(specMezzi).forEach(function (k) {
      if (!celleLettera[k]) errori.push('Mezzo «' + k + '» descritto ma assente dalla mappa');
    });

    var garage = [];
    var specGarage = def.garage || {};
    Object.keys(garageCelle).sort().forEach(function (cifra) {
      var g = specGarage[cifra];
      var pos = garageCelle[cifra];
      if (!g || !DIREZIONI[g.dir] || !Array.isArray(g.mezzi) || !g.mezzi.length) {
        errori.push('Garage «' + cifra + '» senza descrizione valida'); return;
      }
      var d = DIREZIONI[g.dir];
      var voci = g.mezzi.map(function (v, i) {
        var m = /^(\d)(?::(\d+))?$/.exec(String(v));
        if (!m) { errori.push('Garage «' + cifra + '», mezzo ' + i + ': «' + v + '» non valido'); return null; }
        return { lun: Number(m[1]), posti: m[2] ? Number(m[2]) : POSTI_PREDEFINITI[Number(m[1])] };
      }).filter(Boolean);
      var baia = Math.max.apply(null, voci.map(function (v) { return v.lun; }));
      var celleBaia = [];
      for (var i = 1; i <= baia; i++) {
        var bx = pos.x + d.dx * i, by = pos.y + d.dy * i;
        if (bx < 0 || by < 0 || bx >= larg || by >= alt) { errori.push('Garage «' + cifra + '»: la baia esce dalla mappa'); break; }
        if (righe[by][bx] !== '.') errori.push('Garage «' + cifra + '»: la baia in ' + bx + ',' + by + ' deve restare libera');
        celleBaia.push({ x: bx, y: by });
      }
      var idGarage = 'G' + cifra;
      var coda = voci.map(function (v, i) {
        var id = idGarage + '-' + (i + 1);
        var mx, my;
        if (g.dir === 'E') { mx = pos.x + 1; my = pos.y; }
        else if (g.dir === 'O') { mx = pos.x - v.lun; my = pos.y; }
        else if (g.dir === 'S') { mx = pos.x; my = pos.y + 1; }
        else { mx = pos.x; my = pos.y - v.lun; }
        mezzi.push({ id: id, x: mx, y: my, dir: g.dir, lun: v.lun, posti: v.posti, nascosto: false, garage: idGarage });
        return id;
      });
      garage.push({ id: idGarage, cifra: cifra, x: pos.x, y: pos.y, dir: g.dir, baia: celleBaia, coda: coda });
    });

    mezzi.forEach(function (m) {
      if (!(m.posti >= POSTI_MIN && m.posti <= POSTI_MAX)) errori.push('Mezzo «' + m.id + '»: ' + m.posti + ' posti fuori dai limiti');
    });

    return {
      id: def.id,
      nome: def.nome,
      novita: def.novita || '',
      larghezza: larg,
      altezza: alt,
      mezzi: mezzi,
      garage: garage,
      colori: def.colori,
      attesa: def.attesa,
      margine: def.margine == null ? 1 : def.margine,
      intreccio: def.intreccio == null ? 0.3 : def.intreccio,
      potenziamenti: {
        slot: (def.potenziamenti && def.potenziamenti.slot) || 0,
        riordina: (def.potenziamenti && def.potenziamenti.riordina) || 0,
        rimescola: (def.potenziamenti && def.potenziamenti.rimescola) || 0
      },
      errori: errori
    };
  }

  /* ------------------------------------------------------------------ */
  /* Geometria                                                           */
  /* ------------------------------------------------------------------ */

  function celleMezzo(m) {
    var r = [];
    var orizz = m.dir === 'E' || m.dir === 'O';
    for (var i = 0; i < m.lun; i++) r.push(orizz ? { x: m.x + i, y: m.y } : { x: m.x, y: m.y + i });
    return r;
  }

  function testa(m) {
    if (m.dir === 'E') return { x: m.x + m.lun - 1, y: m.y };
    if (m.dir === 'S') return { x: m.x, y: m.y + m.lun - 1 };
    return { x: m.x, y: m.y };
  }

  /* Caselle che il mezzo attraversa per uscire, dalla prima davanti al muso
     fino al bordo del parcheggio. */
  function percorso(m, larg, alt) {
    var d = DIREZIONI[m.dir];
    var t = testa(m);
    var r = [];
    var x = t.x + d.dx, y = t.y + d.dy;
    while (x >= 0 && y >= 0 && x < larg && y < alt) { r.push({ x: x, y: y }); x += d.dx; y += d.dy; }
    return r;
  }

  /* Mappa di occupazione: per ogni casella, che cosa la occupa.
     La cella del garage è sempre un ostacolo; la baia è riservata finché
     il garage contiene mezzi (il mezzo sulla porta la occupa, il resto è
     riservato al garage). */
  function occupazione(p) {
    var L = p.livello;
    var g = new Array(L.larghezza * L.altezza).fill(null);
    function metti(x, y, cosa) { g[y * L.larghezza + x] = cosa; }
    p.garage.forEach(function (ga) {
      metti(ga.x, ga.y, { tipo: 'garage', id: ga.id });
      if (ga.coda.length) ga.baia.forEach(function (c) { metti(c.x, c.y, { tipo: 'garage', id: ga.id }); });
    });
    p.ordine.forEach(function (id) {
      var m = p.mezzi[id];
      if (m.stato !== 'piazzale') return;
      celleMezzo(m).forEach(function (c) { metti(c.x, c.y, { tipo: 'mezzo', id: id }); });
    });
    return function (x, y) { return g[y * L.larghezza + x]; };
  }

  /* Controlla la strada di un mezzo. Restituisce l'esito, il primo ostacolo
     e le caselle del percorso (utili per evidenziarle). */
  function esaminaUscita(p, id, occ) {
    var m = p.mezzi[id];
    var L = p.livello;
    occ = occ || occupazione(p);
    var celle = percorso(m, L.larghezza, L.altezza);
    for (var i = 0; i < celle.length; i++) {
      var o = occ(celle[i].x, celle[i].y);
      if (o && !(o.tipo === 'mezzo' && o.id === id) && !(o.tipo === 'garage' && o.id === m.garage)) {
        return { libero: false, ostacolo: o, cella: celle[i], celle: celle.slice(0, i + 1) };
      }
    }
    return { libero: true, ostacolo: null, cella: null, celle: celle };
  }

  /* ------------------------------------------------------------------ */
  /* Controllo di un livello                                             */
  /* ------------------------------------------------------------------ */

  function validaLivello(def, numColoriDisponibili) {
    var L = interpretaLivello(def);
    var errori = L.errori.slice();
    var avvisi = [];
    if (errori.length) return { ok: false, errori: errori, avvisi: avvisi, livello: L };

    // Sovrapposizioni (comprese le baie dei garage e le celle dei garage)
    var occ = {};
    function prendi(x, y, chi) {
      if (x < 0 || y < 0 || x >= L.larghezza || y >= L.altezza) { errori.push(chi + ' fuori mappa'); return; }
      var k = x + ',' + y;
      if (occ[k] && occ[k] !== chi) errori.push('Sovrapposizione in ' + k + ' tra ' + occ[k] + ' e ' + chi);
      occ[k] = chi;
    }
    L.mezzi.forEach(function (m) { if (!m.garage) celleMezzo(m).forEach(function (c) { prendi(c.x, c.y, m.id); }); });
    L.garage.forEach(function (g) {
      prendi(g.x, g.y, g.id);
      g.baia.forEach(function (c) { prendi(c.x, c.y, g.id); });
    });
    if (!(L.colori >= 1 && L.colori <= numColoriDisponibili)) errori.push('Numero di colori non valido');
    if (!(L.attesa >= 2 && L.attesa <= 7)) errori.push('Zona di attesa non valida');
    if (L.attesa - L.margine < 1) errori.push('Margine troppo ampio');
    var totMezzi = L.mezzi.length;
    if (totMezzi < L.colori) errori.push('Meno mezzi che colori');
    if (errori.length) return { ok: false, errori: errori, avvisi: avvisi, livello: L };

    // Il parcheggio deve potersi svuotare: si tolgono via via i mezzi liberi.
    // L'occupazione è monotona (togliere un mezzo non chiude mai una strada),
    // quindi se questo procedimento si ferma il parcheggio è bloccato davvero.
    var p = creaStatoGrezzo(L);
    var tolti = 0;
    var avanzato = true;
    while (avanzato) {
      avanzato = false;
      var occF = occupazione(p);
      for (var i = 0; i < p.ordine.length; i++) {
        var id = p.ordine[i];
        if (p.mezzi[id].stato !== 'piazzale') continue;
        if (esaminaUscita(p, id, occF).libero) {
          togliDalPiazzale(p, id);
          p.mezzi[id].stato = 'partito';
          tolti++; avanzato = true;
          break;
        }
      }
    }
    if (tolti !== totMezzi) errori.push('Il parcheggio non si può svuotare: ' + (totMezzi - tolti) + ' mezzi restano incastrati');

    // I mezzi nascosti dovrebbero partire coperti
    var p0 = creaStatoGrezzo(L);
    var occ0 = occupazione(p0);
    L.mezzi.forEach(function (m) {
      if (m.nascosto && esaminaUscita(p0, m.id, occ0).libero) avvisi.push('Il mezzo nascosto «' + m.id + '» parte già libero');
    });
    // Nessun percorso deve passare sopra un garage: sarebbe un blocco perpetuo
    // (già escluso dal controllo di svuotamento, qui solo per un messaggio chiaro).
    return { ok: errori.length === 0, errori: errori, avvisi: avvisi, livello: L };
  }

  /* ------------------------------------------------------------------ */
  /* Stato della partita                                                 */
  /* ------------------------------------------------------------------ */

  function creaStatoGrezzo(L) {
    var mezzi = {};
    var ordine = [];
    L.mezzi.forEach(function (m) {
      mezzi[m.id] = {
        id: m.id, x: m.x, y: m.y, dir: m.dir, lun: m.lun, posti: m.posti,
        rimasti: m.posti, nascosto: m.nascosto, garage: m.garage,
        colore: null, stato: m.garage ? 'garage' : 'piazzale', pronto: false, arrivo: 0
      };
      ordine.push(m.id);
    });
    var garage = L.garage.map(function (g) {
      return { id: g.id, x: g.x, y: g.y, dir: g.dir, baia: g.baia, coda: g.coda.slice() };
    });
    garage.forEach(function (g) { if (g.coda.length) mezzi[g.coda[0]].stato = 'piazzale'; });
    var slot = [];
    for (var i = 0; i < L.attesa; i++) slot.push({ mezzo: null, extra: false });
    return {
      livello: L,
      mezzi: mezzi,
      ordine: ordine,
      garage: garage,
      slot: slot,
      fila: [],
      testa: 0,
      imbarcati: 0,
      totale: 0,
      contatoreArrivi: 0,
      esito: null,
      potenziamenti: { slot: L.potenziamenti.slot, riordina: L.potenziamenti.riordina, rimescola: L.potenziamenti.rimescola },
      usati: 0,
      soluzione: []
    };
  }

  function togliDalPiazzale(p, id) {
    var m = p.mezzi[id];
    if (m.garage) {
      var g = p.garage.filter(function (x) { return x.id === m.garage; })[0];
      if (g.coda[0] === id) {
        g.coda.shift();
        if (g.coda.length) {
          p.mezzi[g.coda[0]].stato = 'piazzale';
          return g.coda[0];
        }
      }
    }
    return null;
  }

  function clona(p) {
    var mezzi = {};
    Object.keys(p.mezzi).forEach(function (k) {
      var m = p.mezzi[k];
      mezzi[k] = {
        id: m.id, x: m.x, y: m.y, dir: m.dir, lun: m.lun, posti: m.posti, rimasti: m.rimasti,
        nascosto: m.nascosto, garage: m.garage, colore: m.colore, stato: m.stato, pronto: m.pronto, arrivo: m.arrivo
      };
    });
    return {
      livello: p.livello,
      mezzi: mezzi,
      ordine: p.ordine,
      garage: p.garage.map(function (g) { return { id: g.id, x: g.x, y: g.y, dir: g.dir, baia: g.baia, coda: g.coda.slice() }; }),
      slot: p.slot.map(function (s) { return { mezzo: s.mezzo, extra: s.extra }; }),
      fila: p.fila.slice(),
      testa: p.testa,
      imbarcati: p.imbarcati,
      totale: p.totale,
      contatoreArrivi: p.contatoreArrivi,
      esito: p.esito,
      potenziamenti: { slot: p.potenziamenti.slot, riordina: p.potenziamenti.riordina, rimescola: p.potenziamenti.rimescola },
      usati: p.usati,
      soluzione: p.soluzione.slice()
    };
  }

  /* Rivela i mezzi nascosti la cui strada è diventata libera. */
  function aggiornaRivelati(p) {
    var rivelati = [];
    var occ = occupazione(p);
    p.ordine.forEach(function (id) {
      var m = p.mezzi[id];
      if (m.stato === 'piazzale' && m.nascosto && esaminaUscita(p, id, occ).libero) {
        m.nascosto = false;
        rivelati.push(id);
      }
    });
    return rivelati;
  }

  function slotLiberi(p) {
    var n = 0;
    p.slot.forEach(function (s) { if (!s.mezzo) n++; });
    return n;
  }

  function mezziInAttesa(p) {
    return p.slot.filter(function (s) { return s.mezzo; }).map(function (s) { return p.mezzi[s.mezzo]; });
  }

  function restantiNelParcheggio(p) {
    var n = 0;
    p.ordine.forEach(function (id) { var s = p.mezzi[id].stato; if (s === 'piazzale' || s === 'garage') n++; });
    return n;
  }

  function coloreInTesta(p) {
    return p.testa < p.fila.length ? p.fila[p.testa] : null;
  }

  /* ------------------------------------------------------------------ */
  /* Azioni                                                              */
  /* ------------------------------------------------------------------ */

  /*
   * Fa uscire un mezzo dal parcheggio verso la zona di attesa.
   * opzioni.pronto: true per le simulazioni (il mezzo è subito disponibile);
   * nell'interfaccia il mezzo diventa disponibile quando l'animazione
   * finisce (segnaArrivato).
   */
  function estrai(p, id, opzioni) {
    var m = p.mezzi[id];
    if (p.esito === 'vinta') return { ok: false, motivo: 'finita' };
    if (!m || m.stato !== 'piazzale') return { ok: false, motivo: 'non-disponibile' };
    var esame = esaminaUscita(p, id);
    if (!esame.libero) return { ok: false, motivo: 'ostruito', ostacolo: esame.ostacolo, cella: esame.cella, celle: esame.celle };
    var indice = -1;
    for (var i = 0; i < p.slot.length; i++) { if (!p.slot[i].mezzo) { indice = i; break; } }
    if (indice < 0) return { ok: false, motivo: 'attesa-piena', celle: esame.celle };

    var posizione = { x: m.x, y: m.y };
    m.stato = 'attesa';
    m.pronto = !!(opzioni && opzioni.pronto);
    m.arrivo = ++p.contatoreArrivi;
    p.slot[indice].mezzo = id;
    var successivo = togliDalPiazzale(p, id);
    var rivelati = aggiornaRivelati(p);
    if (p.esito === 'bloccata') p.esito = null;
    return { ok: true, slot: indice, posizione: posizione, celle: esame.celle, successivoGarage: successivo, rivelati: rivelati };
  }

  function segnaArrivato(p, id) {
    var m = p.mezzi[id];
    if (m && m.stato === 'attesa') m.pronto = true;
  }

  /* Sceglie il mezzo che accoglie il passeggero in testa: tra quelli pronti
     del suo colore, quello con meno posti rimasti (parte prima), a parità
     il più a sinistra. */
  function scegliMezzoPer(p, colore) {
    var scelto = -1, minimo = Infinity;
    for (var i = 0; i < p.slot.length; i++) {
      var id = p.slot[i].mezzo;
      if (!id) continue;
      var m = p.mezzi[id];
      if (m.pronto && m.colore === colore && m.rimasti > 0 && m.rimasti < minimo) { minimo = m.rimasti; scelto = i; }
    }
    return scelto;
  }

  /* Fa salire un solo passeggero, se possibile. Restituisce null se nessuno
     può salire. */
  function imbarcaUno(p) {
    if (p.esito === 'vinta') return null;
    var colore = coloreInTesta(p);
    if (colore == null) return null;
    var i = scegliMezzoPer(p, colore);
    if (i < 0) return null;
    var id = p.slot[i].mezzo;
    var m = p.mezzi[id];
    m.rimasti--;
    p.testa++;
    p.imbarcati++;
    var esito = { mezzo: id, slot: i, colore: colore, partito: false, slotRimosso: false };
    if (m.rimasti === 0) {
      m.stato = 'partito';
      m.pronto = false;
      esito.partito = true;
      if (p.slot[i].extra) { p.slot.splice(i, 1); esito.slotRimosso = true; }
      else p.slot[i].mezzo = null;
    }
    if (p.imbarcati >= p.totale && restantiNelParcheggio(p) === 0 && mezziInAttesa(p).length === 0) p.esito = 'vinta';
    if (p.esito === 'bloccata') p.esito = null;
    return esito;
  }

  function imbarcaTutti(p) {
    var n = 0;
    while (imbarcaUno(p)) n++;
    return n;
  }

  /* Da chiamare quando non c'è nulla in movimento: segna il blocco se tutti
     gli stalli sono pieni e nessun mezzo in attesa accoglie il passeggero
     in testa. */
  function controllaBlocco(p) {
    if (p.esito === 'vinta') return p.esito;
    var colore = coloreInTesta(p);
    if (colore == null) return p.esito;
    if (slotLiberi(p) > 0) { if (p.esito === 'bloccata') p.esito = null; return p.esito; }
    var serve = mezziInAttesa(p).some(function (m) { return m.colore === colore && m.rimasti > 0; });
    p.esito = serve ? null : 'bloccata';
    return p.esito;
  }

  /* ------------------------------------------------------------------ */
  /* Generazione di una fila risolvibile                                 */
  /* ------------------------------------------------------------------ */

  /*
   * A partire dallo stato p (mezzi già in attesa compresi), costruisce una
   * fila che si risolve con questa strategia: tenere al massimo «limite»
   * mezzi in attesa, facendo uscire i mezzi nell'ordine «ordine».
   * La fila nasce simulando proprio quella strategia con le regole vere,
   * quindi la soluzione esiste per costruzione; poi viene ricontrollata.
   */
  function costruisciFila(p, casuale, limite, intreccio) {
    var s = clona(p);
    s.fila = s.fila.slice(0, s.testa);
    s.esito = null;
    Object.keys(s.mezzi).forEach(function (k) { if (s.mezzi[k].stato === 'attesa') s.mezzi[k].pronto = true; });
    var nuova = [];
    var ordine = [];
    var sicurezza = 100000;
    while (sicurezza-- > 0) {
      // riempie la zona di attesa fino al limite
      while (mezziInAttesa(s).length < limite && slotLiberi(s) > 0) {
        var occ = occupazione(s);
        var liberi = s.ordine.filter(function (id) { return s.mezzi[id].stato === 'piazzale' && esaminaUscita(s, id, occ).libero; });
        if (!liberi.length) break;
        var scelto = liberi[Math.floor(casuale() * liberi.length)];
        estrai(s, scelto, { pronto: true });
        ordine.push(scelto);
      }
      var inAttesa = mezziInAttesa(s).filter(function (m) { return m.rimasti > 0; });
      if (!inAttesa.length) {
        if (restantiNelParcheggio(s) === 0) break;
        return null; // parcheggio incastrato: non dovrebbe mai accadere
      }
      inAttesa.sort(function (a, b) { return a.arrivo - b.arrivo; });
      var mezzo = casuale() < intreccio ? inAttesa[Math.floor(casuale() * inAttesa.length)] : inAttesa[0];
      nuova.push(mezzo.colore);
      s.fila.push(mezzo.colore);
      if (!imbarcaUno(s)) return null;
    }
    return { fila: nuova, ordine: ordine };
  }

  /* Ripete la strategia di riferimento sullo stato vero e conferma la vittoria. */
  function verificaStrategia(p, ordine, limite) {
    var s = clona(p);
    Object.keys(s.mezzi).forEach(function (k) { if (s.mezzi[k].stato === 'attesa') s.mezzi[k].pronto = true; });
    var k = 0;
    var passi = 0;
    while (s.esito !== 'vinta' && passi++ < 100000) {
      imbarcaTutti(s);
      if (s.esito === 'vinta') break;
      if (k < ordine.length && mezziInAttesa(s).length < limite) {
        var r = estrai(s, ordine[k], { pronto: true });
        if (!r.ok) return false;
        k++;
        continue;
      }
      return false;
    }
    return s.esito === 'vinta';
  }

  function contaColori(fila, da) {
    var c = {};
    for (var i = da || 0; i < fila.length; i++) c[fila[i]] = (c[fila[i]] || 0) + 1;
    return c;
  }

  function stessiConteggi(a, b) {
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(function (k) { return a[k] === b[k]; });
  }

  /* Distribuisce i colori sui mezzi in modo che ogni colore compaia. */
  function assegnaColori(p, colori, casuale) {
    var ids = mescola(p.ordine.slice(), casuale);
    var tavolozza = mescola(colori.slice(), casuale);
    ids.forEach(function (id, i) { p.mezzi[id].colore = tavolozza[i % tavolozza.length]; });
  }

  /*
   * Crea una partita nuova e risolvibile.
   *   livelloDef: definizione da js/livelli.js
   *   colori: elenco degli identificativi di colore disponibili (in ordine)
   *   seme: numero per la riproducibilità
   */
  function nuovaPartita(livelloDef, colori, seme) {
    var L = interpretaLivello(livelloDef);
    if (L.errori.length) throw new Error('Livello ' + livelloDef.id + ': ' + L.errori.join('; '));
    var casuale = creaCasuale(seme == null ? Math.floor(Math.random() * 4294967296) : seme);
    var usati = colori.slice(0, L.colori);
    var limite = Math.max(1, L.attesa - L.margine);
    for (var tentativo = 0; tentativo < 60; tentativo++) {
      var p = creaStatoGrezzo(L);
      assegnaColori(p, usati, casuale);
      p.totale = L.mezzi.reduce(function (a, m) { return a + m.posti; }, 0);
      var gen = costruisciFila(p, casuale, limite, L.intreccio);
      if (!gen) continue;
      p.fila = gen.fila;
      p.testa = 0;
      if (gen.fila.length !== p.totale) continue;
      if (!verificaStrategia(p, gen.ordine, limite)) continue;
      p.soluzione = gen.ordine;
      p.seme = seme;
      aggiornaRivelati(p);
      return p;
    }
    throw new Error('Impossibile generare una partita risolvibile per il livello ' + livelloDef.id);
  }

  /* ------------------------------------------------------------------ */
  /* Risolutore di controllo (ricerca in profondità con memoria)          */
  /* ------------------------------------------------------------------ */

  function chiaveStato(s) {
    var parti = [s.testa];
    s.ordine.forEach(function (id) { var m = s.mezzi[id]; parti.push(m.stato[0] + m.rimasti); });
    parti.push(s.slot.length);
    return parti.join('|');
  }

  /*
   * Restituisce true (risolvibile), false (sicuramente no) o null (non
   * deciso entro il limite di nodi). Considera le scelte reali del
   * giocatore: quale mezzo libero far uscire quando c'è uno stallo libero.
   * opzioni.ignoraNascosti: true per ragionare con i colori veri (default).
   */
  function risolvibile(p, limiteNodi) {
    var budget = { nodi: limiteNodi || 20000 };
    var visti = {};
    var s0 = clona(p);
    Object.keys(s0.mezzi).forEach(function (k) { if (s0.mezzi[k].stato === 'attesa') s0.mezzi[k].pronto = true; });
    s0.esito = null;
    var sconosciuto = false;

    function cerca(s) {
      if (--budget.nodi < 0) { sconosciuto = true; return false; }
      imbarcaTutti(s);
      if (s.esito === 'vinta') return true;
      var k = chiaveStato(s);
      if (visti[k]) return false;
      visti[k] = true;
      if (slotLiberi(s) === 0) return false;
      var occ = occupazione(s);
      var liberi = s.ordine.filter(function (id) { return s.mezzi[id].stato === 'piazzale' && esaminaUscita(s, id, occ).libero; });
      if (!liberi.length) return false;
      // prima i colori che compaiono prima nella fila
      var prima = {};
      for (var i = s.fila.length - 1; i >= s.testa; i--) prima[s.fila[i]] = i;
      liberi.sort(function (a, b) {
        var pa = prima[s.mezzi[a].colore], pb = prima[s.mezzi[b].colore];
        return (pa == null ? 1e9 : pa) - (pb == null ? 1e9 : pb);
      });
      for (var j = 0; j < liberi.length; j++) {
        var f = clona(s);
        estrai(f, liberi[j], { pronto: true });
        if (cerca(f)) return true;
        if (sconosciuto) return false;
      }
      return false;
    }
    var esito = cerca(s0);
    if (esito) return true;
    return sconosciuto ? null : false;
  }

  /* ------------------------------------------------------------------ */
  /* Potenziamenti                                                       */
  /* ------------------------------------------------------------------ */

  function slotExtraAttivo(p) {
    return p.slot.some(function (s) { return s.extra; });
  }

  /* Raggruppa per colore i prossimi passeggeri (finestra), nell'ordine in
     cui i colori compaiono. Non cambia quanti sono né di che colore. */
  function filaRaggruppata(p, finestra) {
    var fine = Math.min(p.fila.length, p.testa + finestra);
    var tratto = p.fila.slice(p.testa, fine);
    var ordineColori = [];
    var gruppi = {};
    tratto.forEach(function (c) {
      if (!gruppi[c]) { gruppi[c] = []; ordineColori.push(c); }
      gruppi[c].push(c);
    });
    var nuovo = [];
    ordineColori.forEach(function (c) { nuovo = nuovo.concat(gruppi[c]); });
    return p.fila.slice(0, p.testa).concat(nuovo, p.fila.slice(fine));
  }

  function filaGiaRaggruppata(p, finestra) {
    var nuova = filaRaggruppata(p, finestra);
    for (var i = p.testa; i < nuova.length; i++) if (nuova[i] !== p.fila[i]) return false;
    return true;
  }

  function coloriInFila(p) {
    return Object.keys(contaColori(p.fila, p.testa)).length;
  }

  /*
   * Dice se un potenziamento si può usare adesso e, se no, perché.
   * Restituisce { ok, motivo }.
   */
  function puoUsare(p, tipo) {
    if (p.esito === 'vinta') return { ok: false, motivo: 'La partita è finita.' };
    if (!p.potenziamenti[tipo]) return { ok: false, motivo: 'Esaurito per questo livello.' };
    if (tipo === 'slot') {
      if (slotExtraAttivo(p)) return { ok: false, motivo: 'Lo stallo extra è già aperto.' };
      return { ok: true };
    }
    if (p.testa >= p.fila.length) return { ok: false, motivo: 'Non c’è più nessuno in fila.' };
    if (tipo === 'riordina') {
      if (filaGiaRaggruppata(p, FINESTRA_RIORDINO)) return { ok: false, motivo: 'I prossimi passeggeri sono già raggruppati per colore.' };
      return { ok: true };
    }
    if (tipo === 'rimescola') {
      if (coloriInFila(p) < 2) return { ok: false, motivo: 'In fila è rimasto un solo colore: non c’è niente da rimescolare.' };
      return { ok: true };
    }
    return { ok: false, motivo: 'Potenziamento sconosciuto.' };
  }

  function usaSlotExtra(p) {
    var v = puoUsare(p, 'slot');
    if (!v.ok) return v;
    p.slot.push({ mezzo: null, extra: true });
    p.potenziamenti.slot--;
    p.usati++;
    if (p.esito === 'bloccata') p.esito = null;
    return { ok: true, slot: p.slot.length - 1 };
  }

  function usaRiordina(p) {
    var v = puoUsare(p, 'riordina');
    if (!v.ok) return v;
    var prima = contaColori(p.fila, p.testa);
    var primaRisolvibile = null;
    var scelta = null;
    // finestre via via più corte, finché il raggruppamento lascia la partita aperta
    for (var w = FINESTRA_RIORDINO; w >= 3; w--) {
      if (filaGiaRaggruppata(p, w)) continue;
      var prova = clona(p);
      prova.fila = filaRaggruppata(p, w);
      var esito = risolvibile(prova, 6000);
      if (esito !== false) { scelta = prova.fila; break; }
      if (primaRisolvibile === null) primaRisolvibile = risolvibile(p, 6000);
      if (primaRisolvibile === false) { scelta = prova.fila; break; } // era già compromessa
    }
    if (!scelta) return { ok: false, motivo: 'Riordinare adesso chiuderebbe ogni via d’uscita: prova un altro potenziamento.' };
    if (!stessiConteggi(prima, contaColori(scelta, p.testa)) || scelta.length !== p.fila.length) {
      return { ok: false, motivo: 'Riordino non riuscito.' };
    }
    p.fila = scelta;
    p.potenziamenti.riordina--;
    p.usati++;
    if (p.esito === 'bloccata') p.esito = null;
    return { ok: true };
  }

  /* Rigenera la fila dei passeggeri ancora a terra con lo stesso metodo che
     crea le partite: la nuova fila ha gli stessi passeggeri e una soluzione
     garantita a partire dallo stato attuale. */
  function usaRimescola(p, casuale) {
    var v = puoUsare(p, 'rimescola');
    if (!v.ok) return v;
    casuale = casuale || Math.random;
    var prima = contaColori(p.fila, p.testa);
    var limite = Math.max(1, p.livello.attesa);
    var vecchia = p.fila.slice(p.testa);
    for (var t = 0; t < 30; t++) {
      var gen = costruisciFila(p, casuale, limite, Math.max(0.35, p.livello.intreccio));
      if (!gen) continue;
      if (!stessiConteggi(prima, contaColori(gen.fila))) continue;
      var prova = clona(p);
      prova.fila = p.fila.slice(0, p.testa).concat(gen.fila);
      if (!verificaStrategia(prova, gen.ordine, limite)) continue;
      // si preferisce una fila davvero diversa dalla precedente
      var uguale = gen.fila.length === vecchia.length && gen.fila.every(function (c, i) { return c === vecchia[i]; });
      if (uguale && t < 29) continue;
      p.fila = prova.fila;
      p.soluzione = gen.ordine;
      p.potenziamenti.rimescola--;
      p.usati++;
      if (p.esito === 'bloccata') p.esito = null;
      return { ok: true };
    }
    return { ok: false, motivo: 'Non è stato possibile rimescolare in modo sicuro.' };
  }

  /* ------------------------------------------------------------------ */
  /* Esportazione                                                        */
  /* ------------------------------------------------------------------ */

  return {
    DIREZIONI: DIREZIONI,
    POSTI_PREDEFINITI: POSTI_PREDEFINITI,
    POSTI_MIN: POSTI_MIN,
    POSTI_MAX: POSTI_MAX,
    TIPI: TIPI,
    FINESTRA_RIORDINO: FINESTRA_RIORDINO,
    creaCasuale: creaCasuale,
    interpretaLivello: interpretaLivello,
    validaLivello: validaLivello,
    nuovaPartita: nuovaPartita,
    clona: clona,
    celleMezzo: celleMezzo,
    percorso: percorso,
    occupazione: occupazione,
    esaminaUscita: esaminaUscita,
    estrai: estrai,
    segnaArrivato: segnaArrivato,
    imbarcaUno: imbarcaUno,
    imbarcaTutti: imbarcaTutti,
    controllaBlocco: controllaBlocco,
    verificaStrategia: verificaStrategia,
    risolvibile: risolvibile,
    puoUsare: puoUsare,
    usaSlotExtra: usaSlotExtra,
    usaRiordina: usaRiordina,
    usaRimescola: usaRimescola,
    slotLiberi: slotLiberi,
    mezziInAttesa: mezziInAttesa,
    restantiNelParcheggio: restantiNelParcheggio,
    coloreInTesta: coloreInTesta,
    contaColori: contaColori
  };
});
