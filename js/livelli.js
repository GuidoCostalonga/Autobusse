/*
 * Autobusse: livelli.
 *
 * La geometria di ogni parcheggio è disegnata a mano. A ogni partita cambiano
 * soltanto i colori dei mezzi e la fila dei passeggeri, generata dal motore
 * in modo che esista sempre una soluzione.
 *
 * Legenda della mappa (un carattere per casella):
 *   .        casella libera
 *   lettera  un autobus: le caselle con la stessa lettera formano il mezzo
 *   cifra    un garage
 *
 * mezzi:   direzione di uscita N (su), S (giù), E (destra), O (sinistra);
 *          «?» colore nascosto; «:n» numero di posti (da 3 a 40).
 *          Posti predefiniti: 2 caselle 4, 3 caselle 6, 4 caselle 10,
 *          5 caselle 16, 6 caselle 24.
 * garage:  direzione della porta e mezzi in fila (lunghezza, «:n» posti).
 *          Le caselle davanti alla porta restano libere: lì si affaccia il
 *          primo mezzo della fila.
 * colori:     quanti colori diversi usa il livello.
 * attesa:     stalli della zona di attesa.
 * margine:    stalli che la soluzione garantita lascia liberi (più è alto,
 *             più il livello perdona).
 * intreccio:  da 0 a 1, quanto si mescolano nella fila i passeggeri di
 *             mezzi diversi (più è alto, più serve pianificare).
 */
(function (radice, fabbrica) {
  'use strict';
  var modulo = fabbrica();
  if (typeof module === 'object' && module.exports) module.exports = modulo;
  else radice.AutobusseLivelli = modulo;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return [
    {
      id: 1,
      nome: 'Primo turno',
      novita: 'Tocca un autobus per farlo uscire. I passeggeri salgono da soli sul mezzo del loro colore.',
      mappa: [
        'aa..b.',
        '....b.',
        'ccc...',
        '...dd.',
        'ee....'
      ],
      mezzi: { a: 'O', b: 'N', c: 'O', d: 'E', e: 'O' },
      colori: 2, attesa: 5, margine: 2, intreccio: 0.1,
      potenziamenti: { slot: 1, riordina: 1, rimescola: 1 }
    },
    {
      id: 2,
      nome: 'Ora di punta',
      novita: 'Un autobus esce solo se la strada davanti al muso è libera. Libera prima chi gli sta davanti.',
      mappa: [
        '.aa..b',
        'c....b',
        'c.dd..',
        'c..e..',
        'ff.e.g',
        '.....g'
      ],
      mezzi: { a: 'E', b: 'N', c: 'N', d: 'O', e: 'N', f: 'O', g: 'N' },
      colori: 3, attesa: 5, margine: 2, intreccio: 0.2,
      potenziamenti: { slot: 1, riordina: 1, rimescola: 1 }
    },
    {
      id: 3,
      nome: 'Mezzi di ogni misura',
      novita: 'Minibus, autobus e snodati: più è lungo il mezzo, più posti ha da riempire.',
      mappa: [
        'aaaaa..',
        '.....b.',
        'cc...b.',
        'd..eeb.',
        'd......',
        'd.fff.g',
        '..hh..g'
      ],
      mezzi: { a: 'E', b: 'N', c: 'O:3', d: 'S', e: 'E', f: 'E', g: 'N', h: 'O:3' },
      colori: 3, attesa: 5, margine: 1, intreccio: 0.25,
      potenziamenti: { slot: 1, riordina: 1, rimescola: 1 }
    },
    {
      id: 4,
      nome: 'Ingorgo in centro',
      novita: 'Quattro colori e strade intrecciate: guarda chi blocca chi prima di muoverti.',
      mappa: [
        'abbb.cc',
        'a....d.',
        'aee..d.',
        '.f.ggd.',
        '.f..h..',
        'iii.h.j',
        '....h.j'
      ],
      mezzi: { a: 'S', b: 'E', c: 'E', d: 'N', e: 'O', f: 'S', g: 'E', h: 'N', i: 'O', j: 'N' },
      colori: 4, attesa: 5, margine: 1, intreccio: 0.3,
      potenziamenti: { slot: 1, riordina: 1, rimescola: 1 }
    },
    {
      id: 5,
      nome: 'Colori misteriosi',
      novita: 'I mezzi grigi con il punto di domanda hanno un colore nascosto: si scopre quando la loro strada si libera.',
      mappa: [
        'aaa.bb.',
        'c.....d',
        'c.eee.d',
        'c..f..d',
        'gg.f.hh',
        '...f...',
        'iiii.j.',
        '.....j.'
      ],
      mezzi: { a: 'E', b: 'E', c: 'N?', d: 'N', e: 'E?', f: 'S', g: 'O', h: 'O?', i: 'O', j: 'N' },
      colori: 4, attesa: 5, margine: 1, intreccio: 0.3,
      potenziamenti: { slot: 1, riordina: 1, rimescola: 1 }
    },
    {
      id: 6,
      nome: 'Nebbia in piazzale',
      novita: 'Più mezzi nascosti: tieni libero uno stallo per le sorprese.',
      mappa: [
        'aa.bbb.c',
        'd......c',
        'd.eeff.c',
        'd.g....h',
        '..g.iiih',
        'jj.k...h',
        '...k.ll.',
        'mmmk....'
      ],
      mezzi: { a: 'O', b: 'O?', c: 'S', d: 'N', e: 'O?', f: 'E?', g: 'S?', h: 'S', i: 'E?', j: 'O', k: 'N', l: 'E', m: 'O' },
      colori: 4, attesa: 5, margine: 1, intreccio: 0.35,
      potenziamenti: { slot: 1, riordina: 1, rimescola: 1 }
    },
    {
      id: 7,
      nome: 'Il garage',
      novita: 'Dal garage esce un mezzo alla volta: il successivo si affaccia solo quando il primo è partito.',
      mappa: [
        '1...aa.',
        '....b..',
        'cc..b.d',
        '...ee.d',
        'f.....d',
        'f.ggg..',
        'f...hhh',
        'ii.....'
      ],
      mezzi: { a: 'E', b: 'N', c: 'O', d: 'N', e: 'E', f: 'S', g: 'E', h: 'O', i: 'O' },
      garage: { 1: { dir: 'E', mezzi: ['3', '2', '3'] } },
      colori: 4, attesa: 5, margine: 1, intreccio: 0.35,
      potenziamenti: { slot: 1, riordina: 1, rimescola: 1 }
    },
    {
      id: 8,
      nome: 'Due rimesse',
      novita: 'Due garage e un deposito affollato: alcune strade passano davanti alle porte.',
      mappa: [
        '1..aa..b',
        '.......b',
        'cc.ddd.b',
        'e.....f.',
        'e.gg..f.',
        'e...h.f.',
        '.ii.h...',
        '....h..2',
        'jjj..kk.'
      ],
      mezzi: { a: 'E', b: 'N', c: 'O', d: 'E', e: 'S', f: 'S', g: 'E', h: 'N', i: 'O', j: 'O', k: 'E' },
      garage: { 1: { dir: 'E', mezzi: ['2', '2:3', '2'] }, 2: { dir: 'O', mezzi: ['2', '2', '2'] } },
      colori: 5, attesa: 5, margine: 1, intreccio: 0.4,
      potenziamenti: { slot: 1, riordina: 1, rimescola: 1 }
    },
    {
      id: 9,
      nome: 'Incastri',
      novita: 'Colori nascosti e garage insieme: pianifica qualche mossa in anticipo.',
      mappa: [
        'aaa.b..c',
        '....b..c',
        'd.1.eeec',
        'd.......',
        'd...ffg.',
        '..h...g.',
        '..h.jjji',
        'kk.....i',
        '...lll.i'
      ],
      mezzi: { a: 'O', b: 'N', c: 'S', d: 'N?', e: 'E?', f: 'O?', g: 'N', h: 'S', i: 'S', j: 'O?', k: 'E', l: 'E' },
      garage: { 1: { dir: 'S', mezzi: ['2', '2', '2'] } },
      colori: 5, attesa: 5, margine: 1, intreccio: 0.45,
      potenziamenti: { slot: 1, riordina: 1, rimescola: 1 }
    },
    {
      id: 10,
      nome: 'Gran turismo',
      novita: 'Arriva il pullman da 40 posti: occupa uno stallo a lungo, scegli bene quando farlo uscire.',
      mappa: [
        'aaaaaa..b',
        '.......cb',
        'd.eee..c.',
        'd.....f..',
        'd.gg..f.h',
        '.i....f.h',
        '.i.jjj..h',
        '.i..1....',
        'kkk......'
      ],
      mezzi: { a: 'E:40', b: 'N', c: 'N', d: 'N', e: 'E?', f: 'S', g: 'E?', h: 'N', i: 'S', j: 'O?', k: 'O' },
      garage: { 1: { dir: 'E', mezzi: ['2', '2:3', '2'] } },
      colori: 6, attesa: 5, margine: 1, intreccio: 0.45,
      potenziamenti: { slot: 1, riordina: 2, rimescola: 1 }
    },
    {
      id: 11,
      nome: 'Notte fonda',
      novita: 'Sei colori, tanti mezzi nascosti e due garage: ogni stallo conta.',
      mappa: [
        '1..aaaa.b',
        '.......cb',
        'dd.eee.c.',
        'f......c.',
        'f.gggg..i',
        'f.....h.i',
        '.jj...h.i',
        '......h..',
        'kk..mmm..',
        '........2'
      ],
      mezzi: { a: 'E', b: 'N', c: 'N', d: 'O', e: 'E?', f: 'S', g: 'E?', h: 'N?', i: 'N', j: 'E?', k: 'O', m: 'O?' },
      garage: { 1: { dir: 'E', mezzi: ['2', '2', '2:3'] }, 2: { dir: 'N', mezzi: ['2', '2'] } },
      colori: 6, attesa: 5, margine: 1, intreccio: 0.5,
      potenziamenti: { slot: 1, riordina: 2, rimescola: 2 }
    },
    {
      id: 12,
      nome: 'Capolinea',
      novita: 'Sette colori, garage, sorprese e nessun margine: la fine della prima parte. Dal livello 13 arrivano catene, sbarre, coppie e fila coperta.',
      mappa: [
        'aaa.bbbb.',
        'c.......d',
        'c.eee.f.d',
        'c.....f.d',
        'gg.1..f..',
        '...h....i',
        'jj.h.kk.i',
        '...h....i',
        'llll.mmm.',
        '2..nn....'
      ],
      mezzi: { a: 'O', b: 'O?', c: 'N', d: 'N', e: 'E?', f: 'N?', g: 'O', h: 'S', i: 'N', j: 'O', k: 'E?', l: 'O', m: 'O?', n: 'E' },
      garage: { 1: { dir: 'E', mezzi: ['2', '2', '2'] }, 2: { dir: 'E', mezzi: ['2', '2:3'] } },
      colori: 7, attesa: 5, margine: 0, intreccio: 0.55,
      potenziamenti: { slot: 2, riordina: 2, rimescola: 2 }
    }
  ];
});
