/*
 * Autobusse: interfaccia.
 *
 * Il modello (AutobusseMotore) è l'unica fonte di verità: ogni azione è una
 * operazione atomica sul modello, poi la vista si ridisegna. Le animazioni
 * usano copie temporanee («fantasmi») degli elementi, quindi non possono
 * mai disallineare la vista dal modello.
 *
 * Regole contro gli input incoerenti:
 *   - mentre un autobus esce dal parcheggio (stato.occupato) non si può
 *     farne uscire un altro né usare potenziamenti;
 *   - il ciclo di imbarco è uno solo (stato.imbarcoAttivo) e ogni passo
 *     fa salire un passeggero alla volta;
 *   - ogni partita ha un gettone (stato.gettone): riavvio o uscita al menu
 *     lo cambiano, e i cicli della partita precedente si fermano da soli.
 */
(function () {
  'use strict';

  var M = window.AutobusseMotore;
  var C = window.AutobusseColori;
  var F = window.AutobusseFabbrica;
  var TOTALE = F.TOTALE;
  var PER_CAPITOLO = 50;
  function defLivello(i) { return F.definizione(i + 1); }
  var A = window.AutobusseArchivio;
  var S = window.AutobusseSuoni;

  var $ = function (id) { return document.getElementById(id); };
  var NS = 'http://www.w3.org/2000/svg';

  var stato = {
    indice: 0,
    p: null,
    gettone: 0,
    occupato: false,
    imbarcoAttivo: false,
    inPausa: false,
    elementi: {},      // id mezzo -> elemento nel parcheggio
    elGarage: {},      // id garage -> elemento
    timerMessaggio: 0,
    ultimoFocus: null,
    mostraNovita: true
  };

  var preferenzaRidotta = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ------------------------------------------------------------------ */
  /* Utilità                                                             */
  /* ------------------------------------------------------------------ */

  function animazioniAttive() {
    var imp = A.impostazioni();
    if (imp.animazioni === null) return !preferenzaRidotta.matches;
    return imp.animazioni;
  }

  function applicaImpostazioni() {
    var imp = A.impostazioni();
    S.imposta(imp.audio);
    document.documentElement.classList.toggle('anim-ridotte', !animazioniAttive());
    var b = $('b-audio');
    b.setAttribute('aria-pressed', String(imp.audio));
    b.setAttribute('aria-label', imp.audio ? 'Audio attivo: tocca per disattivarlo' : 'Audio spento: tocca per attivarlo');
    b.querySelector('use').setAttribute('href', imp.audio ? '#i-audio' : '#i-muto');
    $('imp-audio').checked = imp.audio;
    $('imp-animazioni').checked = animazioniAttive();
    var nota;
    if (imp.animazioni === null) {
      nota = preferenzaRidotta.matches
        ? 'Il dispositivo chiede di ridurre il movimento: le animazioni sono ridotte.'
        : 'Le animazioni seguono le preferenze del dispositivo.';
    } else {
      nota = imp.animazioni ? 'Animazioni attive per tua scelta.' : 'Animazioni ridotte per tua scelta.';
    }
    $('nota-animazioni').textContent = nota;
    $('b-auto-animazioni').hidden = imp.animazioni === null;
  }

  function attesa(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* Attende rispettando la pausa; restituisce false se la partita è cambiata. */
  async function aspetta(ms, gettone) {
    if (ms > 0) await attesa(ms);
    else await new Promise(function (r) { requestAnimationFrame(function () { r(); }); });
    while (stato.inPausa && gettone === stato.gettone) await attesa(120);
    return gettone === stato.gettone;
  }

  function anima(el, fotogrammi, opzioni) {
    if (!animazioniAttive() || !el || !el.animate) return Promise.resolve();
    try {
      var a = el.animate(fotogrammi, opzioni);
      return a.finished.catch(function () {});
    } catch (e) { return Promise.resolve(); }
  }

  function simbolo(nome, classe) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (classe) svg.setAttribute('class', classe);
    var u = document.createElementNS(NS, 'use');
    u.setAttribute('href', '#s-' + nome);
    svg.appendChild(u);
    return svg;
  }

  function coloreDi(id) { return C.trova(id); }
  function nomeColore(id) { var c = coloreDi(id); return c ? c.nome + ' (' + c.nomeSimbolo + ')' : ''; }

  function impostaColori(el, idColore) {
    var c = coloreDi(idColore);
    if (!c) return;
    el.style.setProperty('--fondo', c.fondo);
    el.style.setProperty('--scuro', c.scuro);
    el.style.setProperty('--testo', c.testo);
  }

  function descriviMezzo(m) {
    var tipo = M.TIPI[m.lun] || 'Autobus';
    var colore = m.nascosto ? 'a colore nascosto' : nomeColore(m.colore);
    return tipo + ' ' + colore;
  }

  /* «dall'autobus Rosso (cuore)», «dal minibus a colore nascosto» */
  function daMezzo(m) {
    var tipo = (M.TIPI[m.lun] || 'Autobus').toLowerCase();
    var colore = m.nascosto ? 'a colore nascosto' : nomeColore(m.colore);
    return (/^[aeiou]/.test(tipo) ? 'dall\u2019' : 'dal ') + tipo + ' ' + colore;
  }

  function messaggio(testo, tipo, durata) {
    var el = $('g-messaggio');
    clearTimeout(stato.timerMessaggio);
    el.textContent = testo;
    el.classList.toggle('avviso', tipo === 'avviso');
    el.classList.add('visibile');
    stato.timerMessaggio = setTimeout(function () { el.classList.remove('visibile'); }, durata || 3200);
  }

  /* ------------------------------------------------------------------ */
  /* Schermata iniziale                                                  */
  /* ------------------------------------------------------------------ */

  function prossimoLivello() {
    var sbl = Math.min(A.sbloccato(), TOTALE);
    for (var i = 0; i < sbl; i++) if (!A.completato(i + 1)) return i;
    return sbl - 1;
  }

  function contaCompletati() {
    var n = 0;
    for (var i = 1; i <= TOTALE; i++) if (A.completato(i)) n++;
    return n;
  }

  var capitoliCostruiti = false;
  function preparaCapitoli() {
    if (capitoliCostruiti) return;
    capitoliCostruiti = true;
    var sel = $('sel-capitolo');
    var quanti = Math.ceil(TOTALE / PER_CAPITOLO);
    for (var k = 0; k < quanti; k++) {
      var o = document.createElement('option');
      o.value = k;
      var da = k * PER_CAPITOLO + 1, a = Math.min(TOTALE, (k + 1) * PER_CAPITOLO);
      o.textContent = 'Capitolo ' + (k + 1) + ': ' + (k === 0 ? 'Primi passi' : F.nomeCapitolo(k)) + ' (' + da + '\u2013' + a + ')';
      sel.appendChild(o);
    }
    sel.addEventListener('change', function () { stato.capitolo = Number(sel.value); disegnaHome(); });
    $('b-cap-prec').addEventListener('click', function () { if (stato.capitolo > 0) { stato.capitolo--; disegnaHome(); } });
    $('b-cap-succ').addEventListener('click', function () { if (stato.capitolo < quanti - 1) { stato.capitolo++; disegnaHome(); } });
  }

  function disegnaHome() {
    preparaCapitoli();
    var sbl = A.sbloccato();
    var prossimo = prossimoLivello();
    if (stato.capitolo == null) stato.capitolo = Math.floor(prossimo / PER_CAPITOLO);
    var quanti = Math.ceil(TOTALE / PER_CAPITOLO);
    $('sel-capitolo').value = String(stato.capitolo);
    $('b-cap-prec').disabled = stato.capitolo === 0;
    $('b-cap-succ').disabled = stato.capitolo >= quanti - 1;
    var ol = $('elenco-livelli');
    ol.textContent = '';
    var da = stato.capitolo * PER_CAPITOLO;
    var a = Math.min(TOTALE, da + PER_CAPITOLO);
    for (var i = da; i < a; i++) {
      (function (i) {
        var n = i + 1;
        var li = document.createElement('li');
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'livello-tasto';
        var fatto = A.completato(n);
        var bloccato = n > sbl;
        var difficile = F.difficile(n);
        var num = document.createElement('span'); num.className = 'num'; num.textContent = n;
        b.appendChild(num);
        var etichettaStato;
        if (bloccato) {
          b.disabled = true;
          b.appendChild(iconaUi('i-lucchetto'));
          etichettaStato = 'bloccato';
        } else if (fatto) {
          b.classList.add('fatto');
          b.appendChild(iconaUi('i-spunta'));
          etichettaStato = fatto.senzaAiuti ? 'completato senza aiuti' : 'completato';
        } else {
          etichettaStato = 'da giocare';
        }
        if (difficile) { b.classList.add('difficile'); var d = document.createElement('span'); d.className = 'segno-difficile'; d.textContent = '!'; d.setAttribute('aria-hidden', 'true'); b.appendChild(d); }
        if (i === prossimo && !fatto) b.classList.add('prossimo');
        b.setAttribute('aria-label', 'Livello ' + n + (difficile ? ', difficile' : '') + ', ' + etichettaStato);
        b.title = 'Livello ' + n + (difficile ? ' (difficile)' : '');
        b.addEventListener('click', function () { S.suona('clic'); avviaLivello(i); });
        li.appendChild(b);
        ol.appendChild(li);
      })(i);
    }
    var fatti = contaCompletati();
    $('home-conta').textContent = 'Completati ' + fatti + ' di ' + TOTALE + ' livelli · sbloccati ' + Math.min(sbl, TOTALE);
    var def = defLivello(prossimo);
    $('home-prossimo').textContent = fatti >= TOTALE
      ? 'Hai completato tutti i livelli: rigiocali quando vuoi, colori e file cambiano ogni volta.'
      : 'Si riparte dal livello ' + def.id + ': ' + def.nome + '.';
  }

  function iconaUi(id) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS(NS, 'use');
    u.setAttribute('href', '#' + id);
    svg.appendChild(u);
    return svg;
  }

  function mostraHome() {
    stato.gettone++;
    stato.occupato = false;
    stato.inPausa = false;
    chiudiFinestre();
    $('gioco').hidden = true;
    $('home').hidden = false;
    disegnaHome();
    $('b-gioca').focus();
  }

  function disegnaLegenda() {
    var ul = $('legenda-colori');
    ul.textContent = '';
    C.COLORI.forEach(function (c) {
      var li = document.createElement('li');
      var cam = document.createElement('span');
      cam.className = 'campione';
      impostaColori(cam, c.id);
      cam.appendChild(simbolo(c.simbolo));
      li.appendChild(cam);
      li.appendChild(document.createTextNode(c.nome + ', ' + c.nomeSimbolo));
      ul.appendChild(li);
    });
    var li = document.createElement('li');
    var cam = document.createElement('span');
    cam.className = 'campione';
    cam.style.setProperty('--fondo', '#9aa2b3'); cam.style.setProperty('--scuro', '#5d6578'); cam.style.setProperty('--testo', '#1d2333');
    cam.appendChild(simbolo('ignoto'));
    li.appendChild(cam);
    li.appendChild(document.createTextNode('Nascosto'));
    ul.appendChild(li);
  }

  /* ------------------------------------------------------------------ */
  /* Avvio di un livello                                                 */
  /* ------------------------------------------------------------------ */

  function avviaLivello(indice) {
    stato.gettone++;
    stato.occupato = false;
    stato.imbarcoAttivo = false;
    stato.inPausa = false;
    stato.indice = indice;
    chiudiFinestre();
    var def = defLivello(indice);
    stato.p = M.nuovaPartita(def, C.ID);
    $('home').hidden = true;
    $('gioco').hidden = false;
    $('g-numero').textContent = 'Livello ' + def.id + ' di ' + TOTALE + (stato.p.livello.difficile ? ' \u00b7 difficile' : '');
    $('g-nome').textContent = def.nome;
    costruisciPiazzale();
    disegnaTutto();
    adattaPiazzale();
    $('inizio-numero').textContent = 'Livello ' + def.id + ' di ' + TOTALE + (stato.p.livello.difficile ? ' \u00b7 difficile' : '');
    $('t-inizio').textContent = def.nome;
    $('inizio-novita').textContent = def.novita || '';
    var ul = $('inizio-dati');
    ul.textContent = '';
    [[stato.p.ordine.length, 'autobus'], [stato.p.totale, 'passeggeri'], [stato.p.livello.colori, 'colori'], [stato.p.slot.length, 'stalli']].forEach(function (v) {
      var li = document.createElement('li');
      var st = document.createElement('strong'); st.textContent = v[0];
      li.appendChild(st); li.appendChild(document.createTextNode(v[1]));
      ul.appendChild(li);
    });
    apriFinestra('d-inizio');
  }

  function focusPrimoMezzo() {
    var primo = $('g-piazzale').querySelector('.mezzo.libero') || $('g-piazzale').querySelector('.mezzo');
    if (primo) primo.focus({ preventScroll: true });
  }

  function costruisciPiazzale() {
    var pz = $('g-piazzale');
    var L = stato.p.livello;
    pz.textContent = '';
    stato.elementi = {};
    stato.elGarage = {};
    pz.style.setProperty('--cols', L.larghezza);
    pz.style.setProperty('--righe', L.altezza);
    stato.p.garage.forEach(function (g) {
      g.baia.forEach(function (c) {
        var b = document.createElement('div');
        b.className = 'baia';
        b.dataset.garage = g.id;
        b.style.setProperty('--x', c.x); b.style.setProperty('--y', c.y);
        pz.appendChild(b);
      });
      var el = document.createElement('div');
      el.className = 'garage';
      el.style.setProperty('--x', g.x); el.style.setProperty('--y', g.y);
      el.setAttribute('role', 'img');
      el.appendChild(iconaUi('i-garage'));
      var conta = document.createElement('span');
      conta.className = 'conta-garage';
      el.appendChild(conta);
      pz.appendChild(el);
      stato.elGarage[g.id] = el;
    });
    stato.elSbarre = {};
    stato.p.sbarre.forEach(function (sb) {
      var el = document.createElement('div');
      el.className = 'sbarra';
      el.style.setProperty('--x', sb.x); el.style.setProperty('--y', sb.y);
      el.setAttribute('role', 'img');
      var n = document.createElement('span'); n.className = 'conta-sbarra';
      el.appendChild(n);
      pz.appendChild(el);
      stato.elSbarre[sb.id] = el;
    });
    // numeri delle catene: la chiave e il lucchetto hanno lo stesso numero
    stato.catene = {};
    var k = 0;
    stato.p.ordine.forEach(function (id) {
      var m = stato.p.mezzi[id];
      if (m.dopo) { k++; stato.catene[id] = { numero: k, ruolo: 'lucchetto', con: m.dopo }; stato.catene[m.dopo] = { numero: k, ruolo: 'chiave', con: id }; }
    });
  }

  function creaElementoMezzo(m) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'mezzo';
    b.dataset.id = m.id;
    var orizz = m.dir === 'E' || m.dir === 'O';
    b.classList.add(orizz ? 'orizz' : 'vert', 'dir-' + m.dir);
    b.style.setProperty('--x', m.x);
    b.style.setProperty('--y', m.y);
    b.style.setProperty('--w', orizz ? m.lun : 1);
    b.style.setProperty('--h', orizz ? 1 : m.lun);
    var vetri = document.createElement('span'); vetri.className = 'vetri';
    var muso = document.createElement('span'); muso.className = 'muso';
    muso.appendChild(simbolo('freccia'));
    var et = document.createElement('span'); et.className = 'etichetta';
    var n = document.createElement('span'); n.className = 'posti-n';
    et.appendChild(simbolo('ignoto'));
    et.appendChild(n);
    b.appendChild(vetri); b.appendChild(muso); b.appendChild(et);
    var ct = stato.catene && stato.catene[m.id];
    if (ct) {
      var tag = document.createElement('span');
      tag.className = 'catena ' + ct.ruolo;
      tag.appendChild(iconaUi(ct.ruolo === 'chiave' ? 'i-chiave' : 'i-lucchetto'));
      var nn = document.createElement('span'); nn.textContent = ct.numero;
      tag.appendChild(nn);
      b.appendChild(tag);
    }
    b.addEventListener('click', function () { tocca(m.id); });
    return b;
  }

  /* ------------------------------------------------------------------ */
  /* Disegno                                                             */
  /* ------------------------------------------------------------------ */

  function disegnaTutto() {
    disegnaPiazzale();
    disegnaFila();
    disegnaAttesa();
    disegnaProgresso();
    disegnaPotenziamenti();
  }

  function disegnaPiazzale() {
    var p = stato.p;
    var pz = $('g-piazzale');
    var occ = M.occupazione(p);
    var presenti = {};
    p.ordine.forEach(function (id) {
      var m = p.mezzi[id];
      if (m.stato !== 'piazzale') return;
      presenti[id] = true;
      var el = stato.elementi[id];
      if (!el) { el = creaElementoMezzo(m); stato.elementi[id] = el; pz.appendChild(el); }
      var strada = M.esaminaUscita(p, id, occ).libero;
      var sciolta = M.catenaSciolta(p, id);
      var libero = strada && sciolta;
      el.classList.toggle('libero', libero);
      var tag = el.querySelector('.catena.lucchetto');
      if (tag) tag.classList.toggle('sciolta', sciolta);
      var eraNascosto = el.classList.contains('nascosto');
      el.classList.toggle('nascosto', m.nascosto);
      if (eraNascosto && !m.nascosto) {
        el.classList.remove('rivelato'); void el.offsetWidth; el.classList.add('rivelato');
      }
      var use = el.querySelector('.etichetta use');
      if (m.nascosto) {
        el.style.removeProperty('--fondo'); el.style.removeProperty('--scuro'); el.style.removeProperty('--testo');
        use.setAttribute('href', '#s-ignoto');
      } else {
        impostaColori(el, m.colore);
        use.setAttribute('href', '#s-' + coloreDi(m.colore).simbolo);
      }
      el.querySelector('.posti-n').textContent = m.posti;
      var dir = M.DIREZIONI[m.dir].nome;
      el.setAttribute('aria-label',
        descriviMezzo(m) + ', ' + m.posti + ' posti, esce ' + dir + ', ' +
        (strada ? 'strada libera' : 'strada bloccata') +
        (stato.catene[id] ? (stato.catene[id].ruolo === 'chiave' ? ', chiave della catena ' + stato.catene[id].numero : (sciolta ? ', catena ' + stato.catene[id].numero + ' sciolta' : ', legato alla catena ' + stato.catene[id].numero + ': esce dopo la sua chiave')) : '') +
        (m.garage ? ', sulla porta del garage' : ''));
    });
    Object.keys(stato.elementi).forEach(function (id) {
      if (!presenti[id]) { stato.elementi[id].remove(); delete stato.elementi[id]; }
    });
    p.garage.forEach(function (g) {
      var el = stato.elGarage[g.id];
      var dentro = Math.max(0, g.coda.length - 1);
      el.classList.toggle('vuoto', g.coda.length === 0);
      el.querySelector('.conta-garage').textContent = dentro ? '+' + dentro : '';
      el.setAttribute('aria-label', g.coda.length === 0
        ? 'Garage vuoto'
        : (dentro ? 'Garage: ancora ' + dentro + (dentro === 1 ? ' mezzo coperto' : ' mezzi coperti') + ' dentro' : 'Garage: nessun altro mezzo dentro'));
      pz.querySelectorAll('.baia[data-garage="' + g.id + '"]').forEach(function (b) { b.hidden = g.coda.length === 0; });
    });
    p.sbarre.forEach(function (sb) {
      var el = stato.elSbarre[sb.id];
      var mancano = sb.soglia - p.partiti;
      el.classList.toggle('alzata', mancano <= 0);
      el.querySelector('.conta-sbarra').textContent = mancano > 0 ? mancano : '';
      el.setAttribute('aria-label', mancano > 0 ? 'Sbarra: si alza dopo ' + (mancano === 1 ? 'un\u2019altra partenza' : 'altre ' + mancano + ' partenze') : 'Sbarra alzata');
    });
  }

  function disegnaFila() {
    var p = stato.p;
    var ol = $('g-fila');
    ol.textContent = '';
    var resto = p.fila.length - p.testa;
    var persone = M.passeggeriInFila(p);
    $('g-fila-conta').textContent = persone === 1 ? '1 in fila' : persone + ' in fila';
    var testaEl = $('g-testa');
    testaEl.textContent = '';
    if (!resto) {
      var v = document.createElement('li'); v.className = 'vuota'; v.textContent = 'Tutti a bordo!';
      ol.appendChild(v);
      ol.setAttribute('aria-label', 'Fila vuota');
      return;
    }
    // quanti gruppi entrano senza essere tagliati
    var stile = getComputedStyle(ol);
    var pp = parseFloat(stile.getPropertyValue('--p')) || 30;
    var spazio = ol.clientWidth - 8;
    var largTesta = pp * 1.25 + 5;
    var largUno = pp + 5;
    var massimo = Math.max(1, 1 + Math.floor((spazio - largTesta - 44) / largUno));
    if (resto <= massimo + 1) massimo = Math.max(1, 1 + Math.floor((spazio - largTesta) / largUno));
    var mostrati = Math.min(resto, massimo);
    var visibili = p.livello.filaVisibile || Infinity;
    var nomi = [];
    for (var i = 0; i < mostrati; i++) {
      var col = p.fila[p.testa + i];
      var quanti = p.gruppi[p.testa + i] || 1;
      var li = document.createElement('li');
      li.className = 'passeggero' + (i === 0 ? ' testa' : '');
      li.setAttribute('aria-hidden', 'true');
      var corpo = document.createElement('span');
      corpo.className = 'corpo';
      if (i >= visibili) {
        li.classList.add('coperto');
        corpo.appendChild(simbolo('ignoto'));
      } else {
        impostaColori(li, col);
        corpo.appendChild(simbolo(coloreDi(col).simbolo));
        if (quanti > 1) {
          li.classList.add('coppia');
          var due = document.createElement('span'); due.className = 'per-due'; due.textContent = '\u00d72';
          li.appendChild(due);
        }
        if (i < 6) nomi.push(coloreDi(col).nome + (quanti > 1 ? ' in coppia' : ''));
      }
      li.appendChild(corpo);
      ol.appendChild(li);
    }
    if (resto > mostrati) {
      var altri = document.createElement('li');
      altri.className = 'altri';
      altri.textContent = '+' + (resto - mostrati);
      altri.setAttribute('aria-hidden', 'true');
      ol.appendChild(altri);
    }
    var c0 = coloreDi(p.fila[p.testa]);
    var q0 = p.gruppi[p.testa] || 1;
    var chip = document.createElement('span');
    chip.className = 'chip';
    impostaColori(chip, c0.id);
    chip.appendChild(simbolo(c0.simbolo));
    chip.appendChild(document.createTextNode(c0.nome + (q0 > 1 ? ' \u00d72' : '')));
    var t = document.createElement('span'); t.className = 'testo-testa'; t.textContent = 'In testa:';
    testaEl.appendChild(t);
    testaEl.appendChild(chip);
    ol.setAttribute('aria-label', 'Fila: in testa ' + nomeColore(c0.id) + (q0 > 1 ? ', una coppia' : '') +
      (nomi.length > 1 ? '. Poi ' + nomi.slice(1).join(', ') : '') +
      (visibili < Infinity ? '. Fila coperta: si vedono solo i primi ' + visibili : '') +
      '. In tutto ' + persone + ' passeggeri.');
  }

  function disegnaAttesa() {
    var p = stato.p;
    var ol = $('g-attesa');
    ol.textContent = '';
    ol.style.setProperty('--n', p.slot.length);
    var occupati = 0;
    p.slot.forEach(function (s, i) {
      var li = document.createElement('li');
      li.className = 'stallo' + (s.extra ? ' extra' : '');
      li.dataset.indice = i;
      if (s.mezzo) {
        occupati++;
        var m = p.mezzi[s.mezzo];
        li.classList.add('pieno');
        var b = document.createElement('div');
        b.className = 'bus-attesa' + (m.pronto ? '' : ' in-arrivo');
        impostaColori(b, m.colore);
        b.appendChild(simbolo(coloreDi(m.colore).simbolo));
        var r = document.createElement('span'); r.className = 'rimasti'; r.textContent = m.rimasti;
        var di = document.createElement('span'); di.className = 'di'; di.textContent = 'di ' + m.posti;
        var car = document.createElement('span'); car.className = 'carico';
        car.style.setProperty('--carico', Math.round(100 * (m.posti - m.rimasti) / m.posti) + '%');
        b.appendChild(r); b.appendChild(di); b.appendChild(car);
        li.appendChild(b);
        li.setAttribute('aria-label', 'Stallo ' + (i + 1) + (s.extra ? ' extra' : '') + ': ' + (M.TIPI[m.lun] || 'Autobus') + ' ' + nomeColore(m.colore) + ', ' + m.rimasti + ' posti liberi su ' + m.posti);
      } else {
        li.textContent = s.extra ? '' : 'libero';
        li.setAttribute('aria-label', 'Stallo ' + (i + 1) + (s.extra ? ' extra' : '') + ' libero');
      }
      ol.appendChild(li);
    });
    $('g-attesa-conta').textContent = occupati + ' di ' + p.slot.length + ' stalli occupati';
  }

  function disegnaProgresso() {
    var p = stato.p;
    var b = $('g-progresso');
    b.setAttribute('aria-valuemax', String(p.totale));
    b.setAttribute('aria-valuenow', String(p.imbarcati));
    b.setAttribute('aria-valuetext', p.imbarcati + ' passeggeri a bordo su ' + p.totale);
    $('g-barra').style.width = (100 * p.imbarcati / p.totale) + '%';
    var restano = M.restantiNelParcheggio(p);
    $('g-progresso-testo').textContent = p.imbarcati + ' di ' + p.totale + ' a bordo · ' + restano + (restano === 1 ? ' mezzo' : ' mezzi') + ' da far uscire';
  }

  function motivoPotenziamento(tipo) {
    if (stato.occupato) return { ok: false, motivo: 'Attendi che l’autobus arrivi nella zona di attesa.' };
    return M.puoUsare(stato.p, tipo);
  }

  function disegnaPotenziamenti() {
    var p = stato.p;
    document.querySelectorAll('.pot').forEach(function (b) {
      var tipo = b.dataset.pot;
      var v = motivoPotenziamento(tipo);
      b.querySelector('.pot-conta').textContent = p.potenziamenti[tipo];
      b.setAttribute('aria-disabled', v.ok ? 'false' : 'true');
      var nome = b.querySelector('.pot-nome').textContent;
      b.setAttribute('aria-label', nome + ', ' + p.potenziamenti[tipo] + ' disponibili' + (v.ok ? '' : '. Non utilizzabile: ' + v.motivo));
      b.title = v.ok ? b.querySelector('.pot-effetto').textContent : v.motivo;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Dimensioni del parcheggio                                           */
  /* ------------------------------------------------------------------ */

  function adattaPiazzale() {
    if (!stato.p) return;
    var box = $('g-piazzale-box');
    var L = stato.p.livello;
    var w = box.clientWidth - 18;
    var h = box.clientHeight - 18;
    if (w <= 0 || h <= 0) return;
    var c = Math.floor(Math.min(w / L.larghezza, h / L.altezza, 78));
    c = Math.max(c, 14);
    $('g-piazzale').style.setProperty('--c', c + 'px');
    $('g-piazzale').classList.toggle('piccolo', c < 34);
  }

  var osservatore = window.ResizeObserver ? new ResizeObserver(function () {
    adattaPiazzale();
    if (stato.p && !$('gioco').hidden) disegnaFila();
  }) : null;

  /* ------------------------------------------------------------------ */
  /* Uscita di un autobus                                                */
  /* ------------------------------------------------------------------ */

  function mostraTraccia(celle, urto) {
    var pz = $('g-piazzale');
    celle.forEach(function (c, i) {
      var t = document.createElement('div');
      t.className = 'traccia' + (urto && i === celle.length - 1 ? ' urto' : '');
      t.style.setProperty('--x', c.x); t.style.setProperty('--y', c.y);
      pz.appendChild(t);
      setTimeout(function () { t.remove(); }, 1700);
    });
  }

  function ripetiClasse(el, classe) {
    if (!el) return;
    el.classList.remove(classe); void el.offsetWidth; el.classList.add(classe);
    setTimeout(function () { el.classList.remove(classe); }, 1600);
  }

  function spiegaOstacolo(id, r) {
    var p = stato.p;
    var m = p.mezzi[id];
    var el = stato.elementi[id];
    ripetiClasse(el, 'scuoti');
    S.suona('blocco');
    var dir = M.DIREZIONI[m.dir].nome;
    var chi;
    if (r.ostacolo.tipo === 'garage') {
      chi = 'davanti alla porta di un garage che ha ancora mezzi dentro';
      ripetiClasse(stato.elGarage[r.ostacolo.id], 'scuoti');
    } else if (r.ostacolo.tipo === 'sbarra') {
      var sb = p.sbarre.filter(function (x) { return x.id === r.ostacolo.id; })[0];
      var mancano = sb.soglia - p.partiti;
      ripetiClasse(stato.elSbarre[sb.id], 'scuoti');
      mostraTraccia(r.celle, true);
      messaggio('Non può uscire ' + dir + ': c\u2019è una sbarra che si alza dopo ' + (mancano === 1 ? 'un\u2019altra partenza' : 'altre ' + mancano + ' partenze') + '.', 'avviso', 3600);
      return;
    } else {
      var o = p.mezzi[r.ostacolo.id];
      chi = daMezzo(o);
      ripetiClasse(stato.elementi[r.ostacolo.id], 'ostacolo');
    }
    mostraTraccia(r.celle, true);
    var testo = r.ostacolo.tipo === 'garage'
      ? 'Non può uscire ' + dir + ': la strada passa ' + chi + '.'
      : 'Non può uscire ' + dir + ': la strada è bloccata ' + chi + '.';
    messaggio(testo, 'avviso', 3600);
  }

  function fantasmaDa(el) {
    var r = el.getBoundingClientRect();
    var f = el.cloneNode(true);
    f.removeAttribute('id');
    f.classList.add('fantasma');
    f.classList.remove('libero', 'scuoti', 'ostacolo', 'rivelato', 'in-uscita');
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.style.left = r.left + 'px';
    f.style.top = r.top + 'px';
    f.style.width = r.width + 'px';
    f.style.height = r.height + 'px';
    var c = getComputedStyle(el).getPropertyValue('--c');
    if (c) f.style.setProperty('--c', c);
    document.body.appendChild(f);
    return { el: f, rett: r };
  }

  async function tocca(id) {
    var p = stato.p;
    if (!p || stato.inPausa || finestraAperta()) return;
    if (p.esito === 'vinta') return;
    if (stato.occupato) { messaggio('Un autobus è già in movimento: aspetta un attimo.', 'info', 1600); return; }
    var m = p.mezzi[id];
    var elPrima = stato.elementi[id];
    if (!m || m.stato !== 'piazzale' || !elPrima) return;
    var r = M.estrai(p, id);
    if (!r.ok) {
      if (r.motivo === 'ostruito') spiegaOstacolo(id, r);
      else if (r.motivo === 'catena') {
        S.suona('blocco');
        ripetiClasse(elPrima, 'scuoti');
        ripetiClasse(stato.elementi[r.legato], 'ostacolo');
        var ct = stato.catene[id];
        messaggio('Catena ' + ct.numero + ': questo autobus esce solo dopo ' + daMezzo(p.mezzi[r.legato]).replace(/^dal(l\u2019)? ?/, function (x) { return x === 'dal ' ? 'il ' : 'l\u2019'; }) + ' con la chiave ' + ct.numero + '.', 'avviso', 3600);
      }
      else if (r.motivo === 'attesa-piena') {
        S.suona('blocco');
        ripetiClasse(elPrima, 'scuoti');
        document.querySelectorAll('.stallo').forEach(function (s) { ripetiClasse(s, 'lampeggia'); });
        messaggio('La zona di attesa è piena: aspetta che parta un autobus.', 'avviso', 3000);
      }
      return;
    }
    // Da qui il modello è già aggiornato: l'autobus è nella zona di attesa,
    // ma non accoglie passeggeri finché non è arrivato.
    var gettone = stato.gettone;
    stato.occupato = true;
    S.suona('uscita');
    var f = animazioniAttive() ? fantasmaDa(elPrima) : null;
    var posPrima = elPrima.getBoundingClientRect();
    disegnaTutto();
    if (f) await animaUscita(f, m, r);
    if (gettone !== stato.gettone) return;
    M.segnaArrivato(p, id);
    stato.occupato = false;
    disegnaTutto();
    if (r.rivelati.length) {
      S.suona('rivela');
      messaggio(r.rivelati.length === 1
        ? 'Colore scoperto: ' + nomeColore(p.mezzi[r.rivelati[0]].colore) + '.'
        : 'Scoperti ' + r.rivelati.length + ' colori nascosti.', 'info', 2400);
    } else if (r.successivoGarage) {
      messaggio('Dal garage si affaccia un nuovo mezzo.', 'info', 2000);
    }
    rimettiFocus(posPrima, r.successivoGarage);
    avviaImbarco();
  }

  async function animaUscita(f, m, r) {
    var d = M.DIREZIONI[m.dir];
    var pz = $('g-piazzale').getBoundingClientRect();
    var rr = f.rett;
    // distanza fino a uscire dal bordo del parcheggio
    var dist;
    if (d.dx > 0) dist = pz.right - rr.left;
    else if (d.dx < 0) dist = rr.right - pz.left;
    else if (d.dy > 0) dist = pz.bottom - rr.top;
    else dist = rr.bottom - pz.top;
    var dx = d.dx * dist, dy = d.dy * dist;
    var tempo = Math.min(520, 180 + dist * 0.9);
    await anima(f.el, [
      { transform: 'translate(0,0)', opacity: 1 },
      { transform: 'translate(' + dx * 0.85 + 'px,' + dy * 0.85 + 'px)', opacity: 1, offset: 0.8 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px)', opacity: 0 }
    ], { duration: tempo, easing: 'cubic-bezier(.5,0,.75,0)' });
    f.el.remove();
    var slotEl = document.querySelector('.stallo[data-indice="' + r.slot + '"] .bus-attesa');
    if (slotEl) await anima(slotEl, [
      { transform: 'scale(.4)', opacity: 0 },
      { transform: 'scale(1.08)', opacity: 1, offset: 0.7 },
      { transform: 'scale(1)', opacity: 1 }
    ], { duration: 220, easing: 'ease-out' });
  }

  /* Dopo l'uscita il tasto premuto sparisce: il focus passa al mezzo appena
     affacciato dal garage oppure al mezzo libero più vicino. */
  function rimettiFocus(posPrima, successivo) {
    var attivo = document.activeElement;
    var inPiazzale = !attivo || attivo === document.body || $('g-piazzale').contains(attivo) || !document.contains(attivo);
    if (!inPiazzale) return;
    if (successivo && stato.elementi[successivo]) { stato.elementi[successivo].focus({ preventScroll: true }); return; }
    var cx = posPrima.left + posPrima.width / 2, cy = posPrima.top + posPrima.height / 2;
    var migliore = null, dmin = Infinity;
    Object.keys(stato.elementi).forEach(function (id) {
      var el = stato.elementi[id];
      var rr = el.getBoundingClientRect();
      var dd = Math.hypot(rr.left + rr.width / 2 - cx, rr.top + rr.height / 2 - cy) * (el.classList.contains('libero') ? 1 : 1.6);
      if (dd < dmin) { dmin = dd; migliore = el; }
    });
    if (migliore) migliore.focus({ preventScroll: true });
    else $('b-pausa').focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------ */
  /* Imbarco                                                             */
  /* ------------------------------------------------------------------ */

  function ritmo() {
    if (!animazioniAttive()) return 25;
    var t = stato.p ? stato.p.totale : 50;
    return t > 180 ? 55 : t > 110 ? 75 : 105;
  }

  async function avviaImbarco() {
    if (stato.imbarcoAttivo) return;
    stato.imbarcoAttivo = true;
    var gettone = stato.gettone;
    var p = stato.p;
    try {
      while (true) {
        if (!(await aspetta(0, gettone))) return;
        var e = M.imbarcaUno(p);
        if (!e) break;
        S.suona('sali');
        var anim = animazioniAttive();
        var fp = null, fb = null, dest = null;
        if (anim) {
          var testaEl = document.querySelector('#g-fila .passeggero.testa');
          var stalloEl = document.querySelector('.stallo[data-indice="' + e.slot + '"]');
          if (testaEl && stalloEl) { fp = fantasmaDa(testaEl); dest = stalloEl.getBoundingClientRect(); }
          if (e.partito && stalloEl && stalloEl.querySelector('.bus-attesa')) fb = fantasmaDa(stalloEl.querySelector('.bus-attesa'));
        }
        disegnaFila(); disegnaAttesa(); disegnaProgresso(); disegnaPotenziamenti();
        if (fp) volaPasseggero(fp, dest);
        if (e.partito) {
          S.suona('partenza');
          if (fb) partenza(fb);
          disegnaPiazzale();
          if (e.sbarreAlzate.length) {
            S.suona('rivela');
            messaggio(e.sbarreAlzate.length === 1 ? 'Una sbarra si è alzata: la corsia è libera.' : e.sbarreAlzate.length + ' sbarre si sono alzate.', 'info', 2400);
          }
        }
        if (p.esito === 'vinta') break;
        if (!(await aspetta(ritmo(), gettone))) return;
      }
    } finally {
      if (gettone === stato.gettone) stato.imbarcoAttivo = false;
    }
    if (gettone !== stato.gettone) return;
    if (p.esito === 'vinta') {
      if (!(await aspetta(animazioniAttive() ? 650 : 100, gettone))) return;
      vittoria();
      return;
    }
    if (!stato.occupato) controllaBlocco();
  }

  function volaPasseggero(f, dest) {
    var rr = f.rett;
    var dx = dest.left + dest.width / 2 - (rr.left + rr.width / 2);
    var dy = dest.top + dest.height / 2 - (rr.top + rr.height / 2);
    anima(f.el, [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.5)', opacity: .2 }
    ], { duration: 260, easing: 'ease-in' }).then(function () { f.el.remove(); });
    if (!animazioniAttive()) f.el.remove();
  }

  function partenza(f) {
    anima(f.el, [
      { transform: 'translateX(0)', opacity: 1 },
      { transform: 'translateX(-6px)', opacity: 1, offset: 0.15 },
      { transform: 'translateX(160%)', opacity: 0 }
    ], { duration: 480, easing: 'ease-in' }).then(function () { f.el.remove(); });
  }

  function controllaBlocco() {
    var p = stato.p;
    if (M.controllaBlocco(p) !== 'bloccata') return;
    S.suona('stallo');
    var c = coloreDi(M.coloreInTesta(p));
    var coppia = M.gruppoInTesta(p) > 1;
    var chi = coppia ? 'la coppia in testa (' + c.nome + ', ' + c.nomeSimbolo + ')' : 'il passeggero in testa (' + c.nome + ', ' + c.nomeSimbolo + ')';
    $('blocco-testo').textContent = M.motivoBlocco(p) === 'stalli'
      ? 'Tutti gli stalli sono occupati e nessun autobus in attesa ha posto per ' + chi + '.'
      : 'Nessun autobus del parcheggio può uscire adesso e nessuno in attesa ha posto per ' + chi + '.';
    var aiuti = ['slot', 'rimescola', 'riordina'].filter(function (t) { return M.puoUsare(p, t).ok; });
    var b = $('b-blocco-aiuti');
    b.hidden = !aiuti.length;
    apriFinestra('d-blocco');
  }

  /* ------------------------------------------------------------------ */
  /* Potenziamenti                                                       */
  /* ------------------------------------------------------------------ */

  function usaPotenziamento(tipo) {
    var p = stato.p;
    if (!p || stato.inPausa || finestraAperta()) return;
    var v = motivoPotenziamento(tipo);
    if (!v.ok) { S.suona('blocco'); messaggio(v.motivo, 'avviso', 2600); return; }
    var r;
    if (tipo === 'slot') r = M.usaSlotExtra(p);
    else if (tipo === 'riordina') r = M.usaRiordina(p);
    else r = M.usaRimescola(p, Math.random);
    if (!r.ok) { S.suona('blocco'); messaggio(r.motivo, 'avviso', 3000); disegnaPotenziamenti(); return; }
    S.suona('potere');
    disegnaTutto();
    var testi = {
      slot: 'Stallo extra aperto: si chiude quando parte il mezzo che lo occupa.',
      riordina: 'Fila riordinata: i prossimi passeggeri sono raggruppati per colore.',
      rimescola: 'Fila rimescolata: c’è sempre almeno una soluzione.'
    };
    messaggio(testi[tipo], 'info', 2800);
    if (tipo === 'slot') {
      var nuovo = document.querySelector('.stallo.extra');
      anima(nuovo, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: 'ease-out' });
    } else {
      anima($('g-fila'), [{ opacity: .2, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'ease-out' });
    }
    avviaImbarco();
  }

  /* ------------------------------------------------------------------ */
  /* Finestre                                                            */
  /* ------------------------------------------------------------------ */

  var pila = [];

  function finestraAperta() { return !!document.querySelector('dialog[open]'); }

  function apriFinestra(id) {
    var d = $(id);
    if (d.open) return;
    stato.ultimoFocus = document.activeElement;
    pila.push({ id: id, focus: document.activeElement });
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    var primo = d.querySelector('.tasto-primario, button, input');
    if (primo) primo.focus();
  }

  function chiudiFinestra(id) {
    var d = $(id);
    if (!d.open) return;
    if (d.close) d.close(); else d.removeAttribute('open');
  }

  function chiudiFinestre() {
    ['d-inizio', 'd-pausa', 'd-vittoria', 'd-blocco', 'd-impostazioni', 'd-aiuto', 'd-conferma'].forEach(chiudiFinestra);
    pila = [];
  }

  function alChiudere(id, fn) {
    $(id).addEventListener('close', function () {
      var voce = null;
      for (var i = pila.length - 1; i >= 0; i--) if (pila[i].id === id) { voce = pila.splice(i, 1)[0]; break; }
      if (fn) fn();
      if (voce && voce.focus && document.contains(voce.focus) && !voce.focus.closest('[hidden]')) {
        try { voce.focus.focus({ preventScroll: true }); } catch (e) { /* niente */ }
      }
    });
  }

  function pausa() {
    if (!stato.p || $('gioco').hidden || stato.p.esito === 'vinta') return;
    if ($('d-blocco').open) return;
    stato.inPausa = true;
    var def = defLivello(stato.indice);
    $('pausa-livello').textContent = 'Livello ' + def.id + ': ' + def.nome + '. ' + stato.p.imbarcati + ' passeggeri a bordo su ' + stato.p.totale + '.';
    apriFinestra('d-pausa');
  }

  function riprendi() {
    chiudiFinestra('d-pausa');
  }

  function vittoria() {
    var p = stato.p;
    var def = defLivello(stato.indice);
    A.completa(def.id, p.usati, TOTALE);
    S.suona('vittoria');
    var ultimo = stato.indice >= TOTALE - 1;
    $('t-vittoria').textContent = ultimo ? 'Capolinea raggiunto!' : 'Livello completato!';
    $('vittoria-testo').textContent = ultimo
      ? 'Hai completato tutti i livelli di Autobusse. Puoi rigiocarli: colori e file cambiano ogni volta.'
      : 'Parcheggio vuoto e tutti a bordo. ' + (p.usati === 0 ? 'E senza potenziamenti!' : 'Prova anche senza potenziamenti.');
    var ul = $('vittoria-dati');
    ul.textContent = '';
    [[p.totale, 'passeggeri'], [p.ordine.length, 'autobus'], [p.usati, 'potenziamenti']].forEach(function (v) {
      var li = document.createElement('li');
      var s = document.createElement('strong'); s.textContent = v[0];
      li.appendChild(s); li.appendChild(document.createTextNode(v[1]));
      ul.appendChild(li);
    });
    $('b-successivo').hidden = ultimo;
    coriandoli();
    apriFinestra('d-vittoria');
  }

  function coriandoli() {
    var f = document.querySelector('#d-vittoria .festa');
    f.textContent = '';
    if (!animazioniAttive()) return;
    for (var i = 0; i < 36; i++) {
      var c = document.createElement('i');
      c.style.left = (Math.random() * 100) + '%';
      c.style.background = C.COLORI[i % C.COLORI.length].fondo;
      c.style.animationDelay = (Math.random() * 0.6) + 's';
      f.appendChild(c);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Tastiera                                                            */
  /* ------------------------------------------------------------------ */

  function spostaFocus(dir) {
    var attivo = document.activeElement;
    var tutti = Object.keys(stato.elementi).map(function (k) { return stato.elementi[k]; });
    if (!tutti.length) return;
    if (!attivo || !attivo.classList || !attivo.classList.contains('mezzo')) { tutti[0].focus(); return; }
    var a = attivo.getBoundingClientRect();
    var ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    var migliore = null, punteggio = Infinity;
    tutti.forEach(function (el) {
      if (el === attivo) return;
      var r = el.getBoundingClientRect();
      var x = r.left + r.width / 2 - ax, y = r.top + r.height / 2 - ay;
      var avanti = dir === 'E' ? x : dir === 'O' ? -x : dir === 'S' ? y : -y;
      var lato = dir === 'E' || dir === 'O' ? Math.abs(y) : Math.abs(x);
      if (avanti <= 2) return;
      var s = avanti + lato * 2;
      if (s < punteggio) { punteggio = s; migliore = el; }
    });
    if (migliore) migliore.focus();
  }

  function tastiera(ev) {
    if ($('gioco').hidden) return;
    var finestraAperta = document.querySelector('dialog[open]');
    if (finestraAperta) return;
    var k = ev.key;
    if (k === 'Escape' || k === 'p' || k === 'P') { ev.preventDefault(); pausa(); return; }
    if (k === '1') { usaPotenziamento('slot'); return; }
    if (k === '2') { usaPotenziamento('riordina'); return; }
    if (k === '3') { usaPotenziamento('rimescola'); return; }
    var mappa = { ArrowRight: 'E', ArrowLeft: 'O', ArrowDown: 'S', ArrowUp: 'N' };
    if (mappa[k] && $('g-piazzale').contains(document.activeElement)) { ev.preventDefault(); spostaFocus(mappa[k]); }
  }

  /* ------------------------------------------------------------------ */
  /* Collegamenti                                                        */
  /* ------------------------------------------------------------------ */

  function collega() {
    $('b-gioca').addEventListener('click', function () { S.suona('clic'); avviaLivello(prossimoLivello()); });
    $('b-home-aiuto').addEventListener('click', function () { apriFinestra('d-aiuto'); });
    $('b-home-impostazioni').addEventListener('click', function () { applicaImpostazioni(); apriFinestra('d-impostazioni'); });
    $('b-pausa').addEventListener('click', pausa);
    $('b-audio').addEventListener('click', function () {
      var imp = A.impostazioni();
      A.salvaImpostazioni({ audio: !imp.audio });
      applicaImpostazioni();
      S.suona('clic');
    });

    document.querySelectorAll('.pot').forEach(function (b) {
      b.addEventListener('click', function () { usaPotenziamento(b.dataset.pot); });
    });

    // Inizio livello
    $('d-inizio').addEventListener('click', function (ev) {
      if (ev.target.closest('[data-azione="inizia"]')) { S.suona('clic'); chiudiFinestra('d-inizio'); }
    });
    $('d-inizio').addEventListener('close', function () { pila = pila.filter(function (v) { return v.id !== 'd-inizio'; }); focusPrimoMezzo(); });

    // Pausa
    $('d-pausa').addEventListener('click', function (ev) {
      var a = ev.target.closest('[data-azione]');
      if (!a) return;
      var az = a.dataset.azione;
      if (az === 'riprendi') riprendi();
      else if (az === 'riavvia') avviaLivello(stato.indice);
      else if (az === 'menu') mostraHome();
      else if (az === 'aiuto') apriFinestra('d-aiuto');
      else if (az === 'impostazioni') { applicaImpostazioni(); apriFinestra('d-impostazioni'); }
    });
    alChiudere('d-pausa', function () { stato.inPausa = false; });

    // Vittoria
    $('d-vittoria').addEventListener('click', function (ev) {
      var a = ev.target.closest('[data-azione]');
      if (!a) return;
      var az = a.dataset.azione;
      if (az === 'successivo') avviaLivello(Math.min(stato.indice + 1, TOTALE - 1));
      else if (az === 'riavvia') avviaLivello(stato.indice);
      else if (az === 'menu') mostraHome();
    });
    $('d-vittoria').addEventListener('cancel', function (ev) { ev.preventDefault(); });
    alChiudere('d-vittoria');

    // Blocco
    $('d-blocco').addEventListener('click', function (ev) {
      var a = ev.target.closest('[data-azione]');
      if (!a) return;
      var az = a.dataset.azione;
      if (az === 'riavvia') avviaLivello(stato.indice);
      else if (az === 'menu') mostraHome();
      else if (az === 'usa-aiuto') {
        chiudiFinestra('d-blocco');
        var primo = null;
        document.querySelectorAll('.pot').forEach(function (b) {
          if (b.getAttribute('aria-disabled') === 'false') { ripetiClasse(b, 'suggerito'); if (!primo) primo = b; }
        });
        if (primo) primo.focus();
        messaggio('Scegli un potenziamento per liberare la fermata.', 'info', 3000);
      }
    });
    $('d-blocco').addEventListener('cancel', function (ev) { ev.preventDefault(); });
    alChiudere('d-blocco');

    // Impostazioni
    $('imp-audio').addEventListener('change', function (ev) { A.salvaImpostazioni({ audio: ev.target.checked }); applicaImpostazioni(); S.suona('clic'); });
    $('imp-animazioni').addEventListener('change', function (ev) { A.salvaImpostazioni({ animazioni: ev.target.checked }); applicaImpostazioni(); });
    $('b-auto-animazioni').addEventListener('click', function () { A.salvaImpostazioni({ animazioni: null }); applicaImpostazioni(); $('imp-animazioni').focus(); });
    $('b-azzera').addEventListener('click', function () { apriFinestra('d-conferma'); });
    $('d-impostazioni').addEventListener('click', function (ev) {
      var a = ev.target.closest('[data-azione="chiudi"]');
      if (a) chiudiFinestra('d-impostazioni');
    });
    alChiudere('d-impostazioni');
    $('d-conferma').addEventListener('click', function (ev) {
      var a = ev.target.closest('[data-azione]');
      if (!a) return;
      if (a.dataset.azione === 'conferma') {
        A.azzera();
        chiudiFinestra('d-conferma');
        chiudiFinestra('d-impostazioni');
        if (!$('home').hidden) disegnaHome();
        else if (stato.p) messaggio('Progressi azzerati.', 'info', 2000);
      } else chiudiFinestra('d-conferma');
    });
    alChiudere('d-conferma');
    $('d-aiuto').addEventListener('click', function (ev) {
      if (ev.target.closest('[data-azione="chiudi"]')) chiudiFinestra('d-aiuto');
    });
    alChiudere('d-aiuto');

    document.addEventListener('keydown', tastiera);
    if (preferenzaRidotta.addEventListener) preferenzaRidotta.addEventListener('change', applicaImpostazioni);
    if (osservatore) {
      osservatore.observe($('g-piazzale-box'));
      osservatore.observe($('g-fila'));
    } else {
      window.addEventListener('resize', function () { adattaPiazzale(); if (stato.p) disegnaFila(); });
    }
    // Se la scheda passa in secondo piano durante la partita, si mette in pausa.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && stato.p && !$('gioco').hidden && !document.querySelector('dialog[open]')) pausa();
    });
  }

  /* Interfaccia di prova: permette ai collaudi automatici di leggere lo stato
     senza toccare la logica. Non espone nulla che cambi le regole. */
  window.AutobusseProva = {
    stato: function () { return stato; },
    livelli: F
  };

  function avvio() {
    applicaImpostazioni();
    disegnaLegenda();
    collega();
    disegnaHome();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
  else avvio();
})();
