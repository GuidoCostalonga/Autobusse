/*
 * Autobusse: fabbrica dei livelli.
 *
 * I livelli da 1 a 12 sono disegnati a mano (js/livelli.js). Dal 13 al 1012
 * il parcheggio è costruito da questo generatore, che è deterministico: il
 * livello N è sempre identico per tutti, perché nasce da un seme ricavato dal
 * suo numero. Ogni livello è accettato solo se:
 *   - la geometria è valida e il parcheggio si può svuotare;
 *   - il motore riesce a creare partite risolvibili senza potenziamenti.
 * Le prove (test/livelli.test.js) controllano tutti i 1012 livelli.
 *
 * La difficoltà cresce a scaglioni: parcheggi più grandi e più pieni, più
 * colori, stalli che si riducono, colori nascosti, garage, catene, sbarre,
 * passeggeri in coppia, fila coperta. Ogni decimo livello è «difficile».
 */
(function (radice, fabbrica) {
  'use strict';
  var modulo;
  if (typeof module === 'object' && module.exports) {
    modulo = fabbrica(require('./motore.js'), require('./livelli.js'), require('./colori.js'));
    module.exports = modulo;
  } else {
    radice.AutobusseFabbrica = fabbrica(radice.AutobusseMotore, radice.AutobusseLivelli, radice.AutobusseColori);
  }
})(typeof self !== 'undefined' ? self : this, function (M, MANO, C) {
  'use strict';

  var TOTALE = 1012;
  var VERSIONE = 1;
  var LETTERE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var DIRS = ['N', 'S', 'E', 'O'];

  /* Nomi dei capitoli (50 livelli ciascuno). Luoghi immaginari, nessun riferimento reale. */
  var CAPITOLI = [
    'Piazzale della stazione', 'Viale dei tigli', 'Porto vecchio', 'Quartiere fiera', 'Colle dei venti',
    'Borgo del mulino', 'Lungofiume', 'Rotonda grande', 'Città alta', 'Zona artigiana',
    'Capolinea nord', 'Piazza del mercato', 'Strada dei ponti', 'Valle dei pioppi', 'Lungolago',
    'Corso maggiore', 'Rione delle torri', 'Deposito centrale', 'Passo del lupo', 'Gran piazzale',
    'Ultima corsa'
  ];

  /* Prima comparsa di ogni meccanica nei livelli generati. */
  var DEBUTTI = {
    catene: 13,
    sbarre: 22,
    coppie: 33,
    filaCoperta: 44,
    stalliRidotti: 55
  };

  var NOVITA = {
    catene: 'Autobus incatenati: il lucchetto con il numero esce solo dopo l’autobus con la chiave dello stesso numero.',
    sbarre: 'Sbarre: chiudono una corsia e si alzano dopo il numero di partenze scritto sopra.',
    coppie: 'Passeggeri in coppia: salgono insieme e occupano due posti. Serve un autobus con almeno due posti liberi.',
    filaCoperta: 'Fila coperta: vedi solo i primi passeggeri, gli altri si scoprono man mano che la fila avanza.',
    stalliRidotti: 'Zona di attesa ridotta: solo quattro stalli. Ogni scelta pesa di più.'
  };

  var cache = {};

  function hash(n) {
    var h = 2166136261 ^ (n * 2654435761);
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function intero(c, a, b) { return a + Math.floor(c() * (b - a + 1)); }
  function limita(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* Parametri di difficoltà del livello n (13..TOTALE). */
  function parametri(n, c) {
    var t = (n - 13) / (TOTALE - 13);           // da 0 a 1
    var difficile = n % 10 === 0;
    var p = {};
    p.larghezza = limita(7 + Math.floor(t * 4.6) + (c() < 0.3 ? 1 : 0), 7, 11);
    p.altezza = limita(8 + Math.floor(t * 5.6) + (c() < 0.3 ? 1 : 0), 8, 13);
    p.densita = limita(0.5 + t * 0.24 + (c() - 0.5) * 0.06 + (difficile ? 0.04 : 0), 0.45, 0.8);
    p.colori = limita(4 + Math.floor(t * 4.4) + (difficile ? 1 : 0), 4, 8);
    p.attesa = 5;
    if (n >= DEBUTTI.stalliRidotti) {
      if (n === DEBUTTI.stalliRidotti || (difficile && n > 60) || c() < 0.15 + t * 0.5) p.attesa = 4;
      if (n > 400 && difficile && c() < 0.5) p.attesa = 3;
      if (n > 700 && c() < 0.15) p.attesa = 3;
    }
    p.margine = (n < 120 && !difficile) ? 1 : (c() < 0.75 - t * 0.6 && !difficile ? 1 : 0);
    if (p.attesa - p.margine < 2) p.margine = Math.max(0, p.attesa - 2);
    p.intreccio = limita(0.35 + t * 0.4 + (difficile ? 0.12 : 0), 0.3, 0.85);
    p.nascosti = limita(0.12 + t * 0.35 + (difficile ? 0.1 : 0), 0, 0.6);
    p.garage = n < 15 ? 0 : intero(c, 0, t < 0.2 ? 1 : t < 0.5 ? 2 : 3);
    p.catene = n < DEBUTTI.catene ? 0 : intero(c, n < 22 ? 1 : 0, 1 + Math.floor(t * 4) + (difficile ? 1 : 0));
    if (n === DEBUTTI.catene) p.catene = 2;
    p.sbarre = n < DEBUTTI.sbarre ? 0 : intero(c, n === DEBUTTI.sbarre ? 1 : 0, 1 + Math.floor(t * 3));
    p.coppie = n < DEBUTTI.coppie ? 0 : limita(0.12 + t * 0.3 + (c() - 0.5) * 0.1, 0.08, 0.45);
    if (n === DEBUTTI.coppie) p.coppie = 0.3;
    p.filaVisibile = null;
    if (n >= DEBUTTI.filaCoperta && (n === DEBUTTI.filaCoperta || difficile || c() < 0.25 + t * 0.5)) {
      p.filaVisibile = limita(Math.round(8 - t * 5) - (difficile ? 1 : 0), 3, 8);
    }
    var aiuti = n < 100 ? 2 : 1;
    p.potenziamenti = { slot: aiuti, riordina: aiuti, rimescola: aiuti };
    if (difficile && n >= 100) p.potenziamenti = { slot: 1, riordina: 1, rimescola: 1 };
    p.difficile = difficile;
    return p;
  }

  /* ------------------------------------------------------------------ */
  /* Costruzione della geometria                                         */
  /* ------------------------------------------------------------------ */

  function lunghezzaCasuale(c, t) {
    var r = c();
    if (r < 0.3) return 2;
    if (r < 0.66) return 3;
    if (r < 0.86) return 4;
    if (r < 0.97 - t * 0.02) return 5;
    return 6;
  }

  function versoMappa(stato) {
    var W = stato.W, H = stato.H;
    var g = [];
    for (var y = 0; y < H; y++) g.push(new Array(W).fill('.'));
    stato.mezzi.forEach(function (m) { M.celleMezzo(m).forEach(function (k) { g[k.y][k.x] = m.id; }); });
    stato.garage.forEach(function (ga, i) { g[ga.y][ga.x] = String(i + 1); });
    stato.sbarre.forEach(function (s) { g[s.y][s.x] = '*'; });
    return g.map(function (r) { return r.join(''); });
  }

  function definizioneDa(stato, p, n) {
    var mezzi = {};
    stato.mezzi.forEach(function (m) {
      var s = m.dir + (m.nascosto ? '?' : '') + (m.posti !== M.POSTI_PREDEFINITI[m.lun] ? ':' + m.posti : '') + (m.dopo ? '>' + m.dopo : '');
      mezzi[m.id] = s;
    });
    var garage = {};
    stato.garage.forEach(function (ga, i) { garage[i + 1] = { dir: ga.dir, mezzi: ga.mezzi.slice() }; });
    // soglie in ordine di lettura
    var sbarre = stato.sbarre.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; }).map(function (s) { return s.soglia; });
    return {
      id: n,
      mappa: versoMappa(stato),
      mezzi: mezzi,
      garage: garage,
      sbarre: sbarre,
      colori: p.colori,
      attesa: p.attesa,
      margine: p.margine,
      intreccio: p.intreccio,
      coppie: p.coppie,
      filaVisibile: p.filaVisibile,
      difficile: p.difficile,
      potenziamenti: p.potenziamenti
    };
  }

  function svuotabile(stato, p, n) {
    var def = definizioneDa(stato, p, n);
    def.colori = 1; // durante la costruzione conta solo la geometria
    var v = M.validaLivello(def, C.COLORI.length);
    return v.ok ? v : null;
  }

  /* Ordine in cui i mezzi possono lasciare il parcheggio (togliendo via via
     un mezzo libero): serve per legare catene che non creano circoli. */
  function ordineDiUscita(L) {
    var stato = statoVuoto(L);
    var ordine = [];
    var avanzato = true;
    while (avanzato) {
      avanzato = false;
      stato.partiti = ordine.length;
      var occ = M.occupazione(stato);
      for (var i = 0; i < stato.ordine.length; i++) {
        var id = stato.ordine[i];
        if (M.puoUscire(stato, id, occ)) {
          // stesso effetto di togliDalPiazzale, ricostruito qui
          var m = stato.mezzi[id];
          m.stato = 'partito';
          if (m.garage) {
            var g = stato.garage.filter(function (x) { return x.id === m.garage; })[0];
            g.coda.shift();
            if (g.coda.length) stato.mezzi[g.coda[0]].stato = 'piazzale';
          }
          ordine.push(id);
          avanzato = true;
          break;
        }
      }
    }
    return ordine;
  }

  function statoVuoto(L) {
    var mezzi = {};
    var ordine = [];
    L.mezzi.forEach(function (m) {
      mezzi[m.id] = { id: m.id, x: m.x, y: m.y, dir: m.dir, lun: m.lun, garage: m.garage, dopo: m.dopo, stato: m.garage ? 'garage' : 'piazzale' };
      ordine.push(m.id);
    });
    var garage = L.garage.map(function (g) { return { id: g.id, x: g.x, y: g.y, dir: g.dir, baia: g.baia, coda: g.coda.slice() }; });
    garage.forEach(function (g) { if (g.coda.length) mezzi[g.coda[0]].stato = 'piazzale'; });
    return { livello: L, mezzi: mezzi, ordine: ordine, garage: garage, sbarre: L.sbarre, partiti: 0 };
  }

  function costruisci(n, c, p) {
    var W = p.larghezza, H = p.altezza;
    var t = (n - 13) / (TOTALE - 13);
    var occupata = [];
    for (var y = 0; y < H; y++) occupata.push(new Array(W).fill(false));
    var stato = { W: W, H: H, mezzi: [], garage: [], sbarre: [] };
    function libera(x, y) { return x >= 0 && y >= 0 && x < W && y < H && !occupata[y][x]; }

    // 1. garage: cella con la porta verso l'interno e baia libera
    for (var gi = 0; gi < p.garage; gi++) {
      for (var tent = 0; tent < 40; tent++) {
        var dir = DIRS[intero(c, 0, 3)];
        var d = M.DIREZIONI[dir];
        var baia = intero(c, 2, 3);
        var gx = intero(c, 0, W - 1), gy = intero(c, 0, H - 1);
        var celle = [{ x: gx, y: gy }];
        for (var b = 1; b <= baia; b++) celle.push({ x: gx + d.dx * b, y: gy + d.dy * b });
        if (!celle.every(function (k) { return libera(k.x, k.y); })) continue;
        // davanti alla baia deve esserci ancora strada fino al bordo
        var ex = gx + d.dx * (baia + 1), ey = gy + d.dy * (baia + 1);
        if (ex < 0 || ey < 0 || ex >= W || ey >= H) continue;
        celle.forEach(function (k) { occupata[k.y][k.x] = true; });
        var quanti = intero(c, 2, 2 + Math.floor(t * 3));
        var voci = [];
        for (var q = 0; q < quanti; q++) {
          var lun = intero(c, 2, baia);
          voci.push(String(lun) + (lun === 2 && c() < 0.3 ? ':3' : ''));
        }
        // la baia deve contenere il mezzo più lungo: la si accorcia se serve
        var massimo = Math.max.apply(null, voci.map(function (v) { return Number(v[0]); }));
        if (massimo < baia) { occupata[gy + d.dy * baia][gx + d.dx * baia] = false; }
        stato.garage.push({ x: gx, y: gy, dir: dir, mezzi: voci });
        break;
      }
    }

    // 2. autobus, finché il parcheggio raggiunge la densità voluta
    var celleTotali = W * H;
    var piene = 0;
    stato.garage.forEach(function () { piene += 3; });
    var tentativi = 0;
    var MAXM = 48;
    while (piene / celleTotali < p.densita && tentativi < 500 && stato.mezzi.length < MAXM) {
      tentativi++;
      var lun2 = lunghezzaCasuale(c, t);
      var orizz = c() < 0.5;
      var x0 = intero(c, 0, orizz ? W - lun2 : W - 1);
      var y0 = intero(c, 0, orizz ? H - 1 : H - lun2);
      if (x0 < 0 || y0 < 0) continue;
      var m = { id: LETTERE[stato.mezzi.length], x: x0, y: y0, lun: lun2, dir: null, posti: M.POSTI_PREDEFINITI[lun2], nascosto: false, dopo: null };
      var cm = [];
      for (var i = 0; i < lun2; i++) cm.push(orizz ? { x: x0 + i, y: y0 } : { x: x0, y: y0 + i });
      if (!cm.every(function (k) { return libera(k.x, k.y); })) continue;
      var direzioni = orizz ? ['E', 'O'] : ['N', 'S'];
      if (c() < 0.5) direzioni.reverse();
      var messo = false;
      for (var di = 0; di < 2 && !messo; di++) {
        m.dir = direzioni[di];
        stato.mezzi.push(m);
        if (svuotabile(stato, p, n)) messo = true;
        else stato.mezzi.pop();
      }
      if (!messo) continue;
      cm.forEach(function (k) { occupata[k.y][k.x] = true; });
      piene += lun2;
      if (lun2 === 2 && c() < 0.25) m.posti = 3;
      if (lun2 === 6 && c() < 0.25) m.posti = 40;
    }

    // 3. sbarre su caselle libere che stanno sulla strada di qualche mezzo
    var strade = {};
    stato.mezzi.forEach(function (m) {
      M.percorso(m, W, H).forEach(function (k) { if (libera(k.x, k.y)) strade[k.x + ',' + k.y] = (strade[k.x + ',' + k.y] || 0) + 1; });
    });
    var candidate = Object.keys(strade).filter(function (k) { return strade[k] >= 1; });
    M.mescola(candidate, c);
    for (var si = 0; si < p.sbarre && candidate.length; si++) {
      var k = candidate.pop().split(',').map(Number);
      var s = { x: k[0], y: k[1], soglia: intero(c, 1, 2 + Math.floor(t * 4)) };
      stato.sbarre.push(s);
      if (!svuotabile(stato, p, n)) { stato.sbarre.pop(); si--; continue; }
      occupata[s.y][s.x] = true;
    }

    var v = svuotabile(stato, p, n);
    if (!v) return null;

    // 4. catene coerenti con un ordine di uscita possibile
    var ordine = ordineDiUscita(v.livello).filter(function (id) { return id.indexOf('-') < 0; });
    var posizione = {};
    ordine.forEach(function (id, i) { posizione[id] = i; });
    var perId = {};
    stato.mezzi.forEach(function (m) { perId[m.id] = m; });
    var catene = 0;
    for (var ct = 0; ct < 40 && catene < p.catene && ordine.length > 3; ct++) {
      var ia = intero(c, 1, ordine.length - 1);
      var ib = intero(c, Math.max(0, ia - 6), ia - 1);
      var a = perId[ordine[ia]], bb = perId[ordine[ib]];
      if (!a || !bb || a.dopo) continue;
      // un mezzo fa da chiave per una sola catena, per leggibilità
      if (stato.mezzi.some(function (x) { return x.dopo === bb.id; }) || bb.dopo) continue;
      a.dopo = bb.id;
      catene++;
    }

    // 5. colori nascosti: solo mezzi che all'inizio hanno la strada chiusa
    var v2 = svuotabile(stato, p, n);
    if (!v2) return null;
    var st0 = statoVuoto(v2.livello);
    var occ0 = M.occupazione(st0);
    var bloccati = stato.mezzi.filter(function (m) { return !M.esaminaUscita(st0, m.id, occ0).libero; });
    M.mescola(bloccati, c);
    var quantiNascosti = Math.round(bloccati.length * p.nascosti);
    for (var h = 0; h < quantiNascosti; h++) bloccati[h].nascosto = true;

    return definizioneDa(stato, p, n);
  }

  function nomeLivello(n) {
    var cap = Math.floor((n - 1) / 50);
    return CAPITOLI[cap % CAPITOLI.length] + ' ' + ((n - 1) % 50 + 1);
  }

  function testoNovita(n, def, p) {
    var testi = [];
    Object.keys(DEBUTTI).forEach(function (k) { if (DEBUTTI[k] === n) testi.push(NOVITA[k]); });
    if (testi.length) return testi.join(' ');
    var cose = [];
    var L = M.interpretaLivello(def);
    if (L.mezzi.some(function (m) { return m.dopo; })) cose.push('catene');
    if (L.sbarre.length) cose.push('sbarre');
    if (L.garage.length) cose.push(L.garage.length === 1 ? 'un garage' : L.garage.length + ' garage');
    if (L.mezzi.some(function (m) { return m.nascosto; })) cose.push('colori nascosti');
    if (p.coppie) cose.push('coppie');
    if (p.filaVisibile) cose.push('fila coperta (' + p.filaVisibile + ' visibili)');
    var base = p.difficile ? 'Livello difficile. ' : '';
    var stalli = p.attesa < 5 ? ' Solo ' + p.attesa + ' stalli.' : '';
    return base + (cose.length ? 'In questo parcheggio: ' + cose.join(', ') + '.' : 'Parcheggio affollato: pianifica le uscite.') + stalli;
  }

  /* Definizione del livello n (1..TOTALE). */
  function definizione(n) {
    if (n < 1 || n > TOTALE) return null;
    if (n <= MANO.length) return MANO[n - 1];
    if (cache[n]) return cache[n];
    var seme = hash(n * 7919 + VERSIONE);
    for (var tentativo = 0; tentativo < 200; tentativo++) {
      var c = M.creaCasuale(seme + tentativo * 104729);
      var p = parametri(n, c);
      var def = costruisci(n, c, p);
      if (!def) continue;
      var v = M.validaLivello(def, C.COLORI.length);
      if (!v.ok || v.avvisi.length) continue;
      if (v.livello.mezzi.length < p.colori + 2) continue;
      // il motore deve saper creare partite risolvibili: si provano tre semi
      var L = v.livello;
      var buone = 0;
      for (var s = 1; s <= 3; s++) if (M.provaPartita(def, C.ID, seme + s, L)) buone++;
      if (buone < 3) continue;
      def.nome = nomeLivello(n);
      def.novita = testoNovita(n, def, p);
      cache[n] = def;
      return def;
    }
    throw new Error('Livello ' + n + ': generazione non riuscita');
  }

  function capitolo(n) { return Math.floor((n - 1) / 50); }

  return {
    TOTALE: TOTALE,
    VERSIONE: VERSIONE,
    MANO: MANO.length,
    CAPITOLI: CAPITOLI,
    DEBUTTI: DEBUTTI,
    definizione: definizione,
    capitolo: capitolo,
    nomeCapitolo: function (i) { return CAPITOLI[i % CAPITOLI.length]; },
    difficile: function (n) { return n > MANO.length && n % 10 === 0; }
  };
});
