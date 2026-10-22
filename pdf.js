// Generazione del PDF del verbale con pdfmake (caricato al primo utilizzo).
import { db, getImpostazioni } from './db.js';
import { CHECKLIST, VOCI, GRAVITA } from './checklist.js';
import { fmtData, blobToDataURL, slug } from './util.js';
import { LOGO_CHIARO } from './logo.js';

export const PDFMAKE_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js'
];

function caricaScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Impossibile caricare ' + src));
    document.head.appendChild(s);
  });
}

async function pdfMake() {
  if (!window.pdfMake?.vfs) {
    for (const u of PDFMAKE_URLS) await caricaScript(u);
  }
  return window.pdfMake;
}

export const ESITO = { c: 'C', nc: 'NC', na: 'N.A.' };
export const TIPI = { affidataria: 'Affidataria', esecutrice: 'Esecutrice', autonomo: 'Lav. autonomo' };
// Tipo della ditta con lo stato del POS in quel cantiere (dati nel legame cantiere–impresa;
// per i dati inseriti in precedenza nella scheda impresa si usano quelli). Lavoratori autonomi: di norma non richiesto.
export const tipoEPos = (i, legame) => {
  if (!i) return '';
  const richiesto = legame?.posRichiesto ?? i.posRichiesto ?? (i.tipo !== 'autonomo');
  const verificato = legame?.posVerificato ?? i.posVerificato;
  const pos = !richiesto ? 'POS non richiesto' : verificato ? `POS verificato il ${fmtData(verificato)}` : 'POS non ancora verificato';
  return `${TIPI[i.tipo] || ''}\n${pos}`;
};
const ACCENTO = '#c2410c';

export const testoNormativo = (s) =>
  `Il sottoscritto ${[s.titolo, s.nome].filter(Boolean).join(' ') || 'Coordinatore'}, in qualità di Coordinatore per la sicurezza in fase di esecuzione, nell'ambito dei compiti di cui all'art. 92, comma 1, lettera a) del D.Lgs. 9 aprile 2008 n. 81 e s.m.i., ha effettuato in data odierna visita in cantiere al fine di verificare, con opportune azioni di coordinamento e controllo, l'applicazione da parte delle imprese esecutrici e dei lavoratori autonomi delle disposizioni loro pertinenti contenute nel Piano di Sicurezza e Coordinamento e la corretta applicazione delle relative procedure di lavoro.`;

export const testoChiusura =
  'Le imprese esecutrici e i lavoratori autonomi sono tenuti ad attuare le prescrizioni sopra riportate entro i termini indicati, dandone riscontro al CSE. ' +
  'L\'impresa affidataria verifica le condizioni di sicurezza dei lavori affidati e l\'applicazione delle disposizioni e prescrizioni del PSC (art. 97 D.Lgs. 81/2008). ' +
  'Il mancato adeguamento potrà essere segnalato al committente o al responsabile dei lavori ai sensi dell\'art. 92, comma 1, lettera e) del D.Lgs. 81/2008.';

export const testoGDPR = (s) =>
  `Informativa privacy: i dati personali e le immagini contenuti nel presente verbale sono trattati da ${[s.titolo, s.nome].filter(Boolean).join(' ') || 'il CSE'}, titolare del trattamento, esclusivamente per l'adempimento degli obblighi di cui al D.Lgs. 81/2008 (art. 6 par. 1 lett. c Reg. UE 2016/679) e conservati per il tempo previsto dalla normativa. Le fotografie documentano le condizioni del cantiere e non sono finalizzate all'identificazione delle persone. Gli interessati possono esercitare i diritti di cui agli artt. 15-22 del Regolamento contattando il titolare.`;

const kv = (rows) => ({
  table: { widths: [130, '*'], body: rows.filter(r => r[1]).map(([k, v]) => [{ text: k, style: 'k' }, { text: String(v) }]) },
  layout: 'lightHorizontalLines', margin: [0, 0, 0, 8]
});

const sezione = (t) => ({ text: t.toUpperCase(), style: 'h2' });

// Solo immagini vere (firme, logo): un dato rovinato non deve bloccare il PDF.
export const immagineValida = s => typeof s === 'string' && /^data:image\/(png|jpe?g);base64,/.test(s);

// Tutti i dati di un verbale, usati sia dal PDF sia dal Word.
export async function caricaDati(verbaleId) {
  const v = await db.verbali.get(verbaleId);
  const bozza = v.stato !== 'chiuso';
  const rev = v.revisione ? ' – Rev. ' + v.revisione : '';
  const num = bozza ? '(bozza)' : 'n. ' + v.numero + rev;
  const c = await db.cantieri.get(v.cantiereId);
  const s = await getImpostazioni();
  const imprese = Object.fromEntries((await db.imprese.toArray()).map(i => [i.id, i]));
  const ncVerbale = await db.nonConformita.where('verbaleId').equals(verbaleId).toArray();
  const ncVerificate = (await db.nonConformita.bulkGet(Object.keys(v.verificheNC || {}).map(Number)))
    .filter(n => n && v.verificheNC[n.id]?.esito);
  const verbaliCantiere = Object.fromEntries((await db.verbali.where('cantiereId').equals(c.id).toArray()).map(x => [x.id, x]));

  // Foto: numerazione progressiva nell'ordine checklist → NC → verifiche.
  const tutteFoto = await db.foto.where('verbaleId').equals(verbaleId).toArray();
  const ordineVoci = Object.keys(VOCI);
  tutteFoto.sort((a, b) => {
    const rank = f => f.tipo === 'voce' ? ordineVoci.indexOf(f.voceId) : f.tipo === 'nc' ? 1000 + f.ncId : 100000 + f.ncId;
    return rank(a) - rank(b) || a.id - b.id;
  });
  const fotoN = new Map(tutteFoto.map((f, i) => [f.id, i + 1]));
  const rifFoto = (pred) => {
    const n = tutteFoto.filter(pred).map(f => fotoN.get(f.id));
    return n.length ? `Foto ${n.join(', ')}` : '';
  };

  const cse = [s.titolo, s.nome].filter(Boolean).join(' ');
  const nomeImpresa = id => imprese[id]?.ragioneSociale || '—';
  const legami = Object.fromEntries((await db.cantiereImprese.where('cantiereId').equals(c.id).toArray()).map(l => [l.impresaId, l]));
  const posImpresa = id => tipoEPos(imprese[id], legami[id]);
  // Imprese di una voce della checklist: per le NC quelle delle schede NC, per le voci conformi quelle scelte nella checklist.
  const impreseVoce = voceId => {
    const e = v.esiti[voceId] || {};
    const ids = e.esito === 'nc' ? ncVerbale.filter(n => n.voceId === voceId).map(n => n.impresaId) : (e.imprese || []);
    return [...new Set(ids.filter(Boolean))].map(nomeImpresa).join(', ') || (e.esito === 'nc' ? 'da indicare' : 'tutte');
  };
  return { v, bozza, rev, num, c, s, imprese, ncVerbale, ncVerificate, verbaliCantiere, tutteFoto, fotoN, rifFoto, cse, nomeImpresa, impreseVoce, posImpresa };
}

// Nome dei file del verbale (senza estensione), uguale per PDF e Word.
export const nomeFileVerbale = (v, c) =>
  `Verbale_sopralluogo_${v.stato !== 'chiuso' ? 'BOZZA' : v.numero + (v.revisione ? '_rev' + v.revisione : '')}_${slug(c.denominazione)}_${v.data}`;

export async function generaPdf(verbaleId) {
  const pm = await pdfMake();
  const { v, bozza, rev, num, c, s, imprese, ncVerbale, ncVerificate, verbaliCantiere, tutteFoto, fotoN, rifFoto, cse, nomeImpresa, impreseVoce, posImpresa } = await caricaDati(verbaleId);
  const content = [];

  // Intestazione
  content.push({
    columns: [
      // Logo caricato nelle Impostazioni, altrimenti il logo dello studio (versione bicolore).
      immagineValida(s.logo) ? { image: s.logo, fit: [110, 60], width: 120 } : { svg: LOGO_CHIARO, width: 62, height: 62 },
      { stack: [
        { text: cse || 'Coordinatore per la sicurezza', bold: true, fontSize: 11 },
        { text: 'Coordinatore per la sicurezza in fase di esecuzione', fontSize: 9 },
        { text: [s.ordine, s.iscrizione && 'n. ' + s.iscrizione].filter(Boolean).join(' '), fontSize: 8, color: '#555' },
        { text: [s.indirizzo, s.telefono, s.email, s.pec && 'PEC ' + s.pec].filter(Boolean).join(' · '), fontSize: 8, color: '#555' }
      ], alignment: 'right' }
    ],
    margin: [0, 0, 0, 10]
  });
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: ACCENTO }] });
  content.push({ text: bozza ? 'BOZZA DI VERBALE DI SOPRALLUOGO' : `VERBALE DI SOPRALLUOGO N. ${v.numero}${rev.toUpperCase()}`, style: 'h1' });
  content.push({ text: 'Verifica in cantiere del Coordinatore per la sicurezza in fase di esecuzione – art. 92 D.Lgs. 81/2008', alignment: 'center', fontSize: 9, color: '#555', margin: [0, 0, 0, 12] });

  // Cantiere
  content.push(sezione('Dati del cantiere'));
  content.push(kv([
    ['Cantiere', c.denominazione],
    ['Indirizzo', [c.indirizzo, c.comune].filter(Boolean).join(', ')],
    ['Coordinate GPS', c.coordinate],
    ['Committente', c.committente],
    ['Responsabile dei lavori', c.rl],
    ['Direttore dei lavori', c.dl],
    ['CSP', c.csp],
    ['CSE', c.cse || cse],
    ['Notifica preliminare', [c.notificaNumero && 'n. ' + c.notificaNumero, c.notificaData && 'del ' + fmtData(c.notificaData)].filter(Boolean).join(' ')],
    ['Titolo abilitativo', c.titoloAbilitativo]
  ]));

  content.push(sezione('Sopralluogo'));
  content.push(kv([
    ['Data', fmtData(v.data)],
    ['Orario', [v.oraInizio, v.oraFine].filter(Boolean).join(' – ')],
    ['Condizioni meteo', v.meteo],
    ['Fasi lavorative in corso', v.fase]
  ]));
  content.push({ text: testoNormativo(s), style: 'small', margin: [0, 0, 0, 8] });

  // Presenze
  const presenti = v.presenze.filter(p => p.presente);
  content.push(sezione('Imprese e lavoratori autonomi presenti'));
  content.push(presenti.length ? {
    table: { headerRows: 1, widths: ['*', 130, 50], body: [
      [{ text: 'Impresa', style: 'th' }, { text: 'Tipo / POS', style: 'th' }, { text: 'Addetti', style: 'th', alignment: 'center' }],
      ...presenti.map(p => [
        p.operai?.length
          ? { text: [nomeImpresa(p.impresaId), { text: '\nOperai: ' + p.operai.join(', '), fontSize: 8, color: '#555' }] }
          : nomeImpresa(p.impresaId),
        posImpresa(p.impresaId), { text: p.addetti || '—', alignment: 'center' }])
    ] }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 6]
  } : { text: 'Nessuna impresa presente.', italics: true, margin: [0, 0, 0, 6] });
  if (v.persone.length) {
    content.push({ text: 'Persone presenti alla visita: ' + v.persone.map(p =>
      [p.nome, p.ruolo && `(${p.ruolo}${p.impresaId ? ', ' + nomeImpresa(p.impresaId) : ''})`].filter(Boolean).join(' ')).join('; '), margin: [0, 0, 0, 8] });
  }

  // Verifica NC precedenti
  if (ncVerificate.length) {
    content.push(sezione('Verifica delle non conformità precedenti'));
    content.push({
      table: { headerRows: 1, widths: [70, '*', 80, '*'], body: [
        ['Verbale', 'Non conformità / impresa', 'Esito', 'Note'].map(t => ({ text: t, style: 'th' })),
        ...ncVerificate.map(n => {
          const ver = v.verificheNC[n.id];
          const orig = verbaliCantiere[n.verbaleId];
          return [
            `n. ${orig?.numero ?? '?'} del ${fmtData(orig?.data)}`,
            { text: [{ text: n.descrizione + '\n' }, { text: nomeImpresa(n.impresaId), color: '#555' }] },
            { text: ver.esito === 'risolta' ? 'RISOLTA' : 'ANCORA NON CONFORME', bold: true, color: ver.esito === 'risolta' ? '#15803d' : '#b91c1c' },
            [ver.nota || '', rifFoto(f => f.tipo === 'verifica' && f.ncId === n.id)].filter(Boolean).join('\n')
          ];
        })
      ] }, layout: 'lightHorizontalLines', fontSize: 9, margin: [0, 0, 0, 8]
    });
  }

  // Checklist
  content.push(sezione('Esito delle verifiche'));
  content.push({
    text: [
      { text: 'Legenda: ', bold: true },
      { text: 'C', bold: true, color: '#15803d' }, ' = conforme;  ',
      { text: 'NC', bold: true, color: '#b91c1c' }, ' = non conforme;  ',
      { text: 'N.A.', bold: true }, ' = non applicabile;  ',
      { text: 'non verificata', italics: true }, ' = voce non controllata in questo sopralluogo.  ',
      { text: 'Gravità NC: ', bold: true }, 'lieve · grave · pericolo grave e imminente (art. 92 c.1 lett. f).'
    ],
    fontSize: 8, color: '#444', margin: [0, 0, 0, 6]
  });
  const body = [['Voce', 'Esito', 'Impresa', 'Note'].map(t => ({ text: t, style: 'th' }))];
  const naPerArea = [];
  for (const area of CHECKLIST) {
    const voci = area.voci.filter(x => ['c', 'nc'].includes(v.esiti[x.id]?.esito));
    const na = area.voci.filter(x => v.esiti[x.id]?.esito === 'na').length;
    const nv = area.voci.filter(x => !v.esiti[x.id]?.esito).length;
    if (na || nv) naPerArea.push(`${area.titolo}: ${[na && na + ' N.A.', nv && nv + ' non verificate'].filter(Boolean).join(', ')}`);
    if (!voci.length) continue;
    body.push([{ text: area.titolo, colSpan: 4, bold: true, fillColor: '#f3f1ee' }, {}, {}, {}]);
    for (const voce of voci) {
      const e = v.esiti[voce.id];
      body.push([
        { text: [voce.testo, { text: `  (${voce.rif})`, color: '#777', fontSize: 7 }] },
        { text: ESITO[e.esito], bold: true, alignment: 'center', color: e.esito === 'nc' ? '#b91c1c' : '#15803d' },
        { text: impreseVoce(voce.id), fontSize: 8 },
        [e.nota, rifFoto(f => f.tipo === 'voce' && f.voceId === voce.id)].filter(Boolean).join('\n')
      ]);
    }
  }
  content.push(body.length > 1 ? { table: { headerRows: 1, widths: ['*', 32, 95, 115], body }, layout: 'lightHorizontalLines', fontSize: 9 }
    : { text: 'Nessuna voce verificata.', italics: true });
  if (naPerArea.length) content.push({ text: 'Voci non applicabili o non verificate — ' + naPerArea.join('; ') + '.', style: 'small', margin: [0, 4, 0, 8] });

  // Non conformità
  content.push(sezione('Non conformità rilevate e prescrizioni'));
  if (ncVerbale.length) {
    content.push({
      table: { headerRows: 1, widths: [16, '*', 80, '*', 52], body: [
        ['N.', 'Non conformità', 'Impresa', 'Prescrizione', 'Termine'].map(t => ({ text: t, style: 'th' })),
        ...ncVerbale.map((n, i) => [
          String(i + 1),
          { text: [
            { text: n.descrizione + '\n' },
            { text: GRAVITA[n.gravita], bold: true, color: n.gravita === 'pgi' ? '#b91c1c' : n.gravita === 'grave' ? '#b45309' : '#1d4ed8', fontSize: 8 },
            { text: rifFoto(f => f.tipo === 'nc' && f.ncId === n.id) ? '  ' + rifFoto(f => f.tipo === 'nc' && f.ncId === n.id) : '', fontSize: 8, color: '#555' }
          ] },
          nomeImpresa(n.impresaId),
          n.prescrizione,
          { text: fmtData(n.termine), bold: true }
        ])
      ] }, layout: 'lightHorizontalLines', fontSize: 9, margin: [0, 0, 0, 8]
    });
  } else {
    content.push({ text: 'Nel corso del sopralluogo non sono state rilevate non conformità.', margin: [0, 0, 0, 8] });
  }

  if (v.sospensione) {
    content.push(sezione('Sospensione delle lavorazioni – art. 92 c.1 lett. f'));
    content.push({ text: v.sospensione, margin: [0, 0, 0, 8] });
  }

  if (v.osservazioni) {
    content.push(sezione('Osservazioni e disposizioni del CSE'));
    content.push({ text: v.osservazioni, margin: [0, 0, 0, 8] });
  }

  content.push({ text: testoChiusura, style: 'small', margin: [0, 6, 0, 8] });

  // Foto
  if (tutteFoto.length) {
    content.push({ ...sezione('Documentazione fotografica'), pageBreak: 'before' });
    const celle = [];
    for (const f of tutteFoto) {
      const didascalia = f.didascalia || (f.tipo === 'voce' ? VOCI[f.voceId]?.testo : f.tipo === 'nc' ? 'Non conformità' : 'Verifica NC precedente');
      celle.push({ stack: [
        { image: await blobToDataURL(f.blob), fit: [245, 185], alignment: 'center' },
        { text: `Foto ${fotoN.get(f.id)} – ${didascalia}`, fontSize: 8, margin: [0, 3, 0, 10] }
      ], unbreakable: true });
    }
    const righe = [];
    for (let i = 0; i < celle.length; i += 2) righe.push([celle[i], celle[i + 1] || { text: '' }]);
    content.push({ table: { widths: ['*', '*'], body: righe, dontBreakRows: true }, layout: 'noBorders' });
  }

  // Firme
  const firme = [];
  firme.push({ stack: [
    { text: 'Il Coordinatore per la sicurezza in fase di esecuzione', fontSize: 8, color: '#555' },
    { text: cse, bold: true },
    immagineValida(v.firmaCSE) ? { image: v.firmaCSE, fit: [160, 60] } : { text: '\n\n' }
  ], unbreakable: true, margin: [0, 0, 0, 12] });
  for (const p of v.persone) {
    firme.push({ stack: [
      { text: [p.ruolo, p.impresaId && nomeImpresa(p.impresaId)].filter(Boolean).join(' – ') || 'Presente', fontSize: 8, color: '#555' },
      { text: p.nome || '', bold: true },
      p.rifiuto ? { text: 'Non firma', italics: true, margin: [0, 10, 0, 10] }
        : immagineValida(p.firma) ? { image: p.firma, fit: [160, 60] } : { text: '\n\n_____________________' }
    ], unbreakable: true, margin: [0, 0, 0, 12] });
  }
  const righeFirme = [];
  for (let i = 0; i < firme.length; i += 2) righeFirme.push([firme[i], firme[i + 1] || { text: '' }]);
  content.push({ stack: [
    sezione('Firme'),
    { text: `Letto, confermato e sottoscritto. ${c.comune || ''}${c.comune ? ', ' : ''}${fmtData(v.data)}`, margin: [0, 0, 0, 10] },
    { table: { widths: ['*', '*'], body: righeFirme }, layout: 'noBorders' },
    { table: { widths: ['*'], body: [[{ text: 'Spazio per la firma digitale del CSE (PAdES)', color: '#999', fontSize: 8, margin: [6, 6, 6, 40] }]] },
      layout: { hLineColor: () => '#bbb', vLineColor: () => '#bbb' }, margin: [0, 6, 0, 10] }
  ], unbreakable: false });

  content.push({ text: testoGDPR(s), fontSize: 7, color: '#666', margin: [0, 10, 0, 0] });

  const titolo = `Verbale di sopralluogo ${num} – ${c.denominazione} – ${fmtData(v.data)}`;
  const dd = {
    pageSize: 'A4',
    ...(bozza ? { watermark: { text: 'BOZZA', color: '#c2410c', opacity: 0.08, bold: true } } : {}),
    pageMargins: [40, 40, 40, 50],
    info: { title: titolo, author: cse, subject: 'Verbale di sopralluogo CSE – D.Lgs. 81/2008' },
    defaultStyle: { fontSize: 10, lineHeight: 1.15 },
    styles: {
      h1: { fontSize: 15, bold: true, alignment: 'center', margin: [0, 12, 0, 2], color: '#222' },
      h2: { fontSize: 9, bold: true, color: ACCENTO, margin: [0, 10, 0, 4], characterSpacing: 0.5 },
      th: { bold: true, fontSize: 8, color: '#555' },
      k: { color: '#555', fontSize: 9 },
      small: { fontSize: 8.5, color: '#333' }
    },
    footer: (pag, tot) => ({
      columns: [
        { text: `Verbale ${num} – ${c.denominazione}`, fontSize: 7, color: '#777' },
        { text: `pag. ${pag} di ${tot}`, alignment: 'right', fontSize: 7, color: '#777' }
      ], margin: [40, 15, 40, 0]
    }),
    content
  };

  // Se la creazione non termina (dato rovinato), si segnala l'errore invece di restare in attesa.
  const blob = await new Promise((res, rej) => {
    const limite = setTimeout(() => rej(new Error('creazione del PDF non riuscita: controlla firme e logo')), 60000);
    try { pm.createPdf(dd).getBlob(b => { clearTimeout(limite); res(b); }); } catch (e) { clearTimeout(limite); rej(e); }
  });
  const nome = nomeFileVerbale(v, c) + '.pdf';
  return new File([blob], nome, { type: 'application/pdf' });
}
