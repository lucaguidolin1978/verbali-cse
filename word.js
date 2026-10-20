// Generazione del verbale in formato Word (.docx) con la libreria "docx", caricata al primo utilizzo.
// Stessi contenuti e stesso ordine del PDF, così i due file restano equivalenti.
import { CHECKLIST, GRAVITA } from './checklist.js';
import { fmtData, blobToDataURL } from './util.js';
import { LOGO_CHIARO } from './logo.js';
import { caricaDati, nomeFileVerbale, ESITO, TIPI, testoNormativo, testoChiusura, testoGDPR } from './pdf.js';

export const DOCX_URL = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';

async function libreria() {
  if (!window.docx) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = DOCX_URL; s.onload = res; s.onerror = () => rej(new Error('Impossibile caricare la libreria Word'));
      document.head.appendChild(s);
    });
  }
  return window.docx;
}

// Immagine (data URL o Blob) → byte PNG/JPEG e dimensioni adattate a una larghezza massima in pixel.
async function immagine(sorgente, maxW, maxH) {
  const blob = typeof sorgente === 'string' ? await (await fetch(sorgente)).blob() : sorgente;
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxW / bmp.width, maxH / bmp.height);
  const dim = { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) };
  bmp.close?.();
  return { data: new Uint8Array(await blob.arrayBuffer()), ...dim };
}

// Il logo SVG dello studio convertito in PNG (Word non legge bene gli SVG).
async function logoPng() {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(LOGO_CHIARO);
  await img.decode();
  const c = document.createElement('canvas'); c.width = 400; c.height = 400;
  c.getContext('2d').drawImage(img, 0, 0, 400, 400);
  return new Promise(res => c.toBlob(res, 'image/png'));
}

export async function generaWord(verbaleId) {
  const D = await libreria();
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun,
    AlignmentType, BorderStyle, Footer, PageNumber, ShadingType
  } = D;
  const { v, bozza, rev, num, c, s, ncVerbale, ncVerificate, verbaliCantiere, tutteFoto, fotoN, rifFoto, cse, nomeImpresa, imprese } = await caricaDati(verbaleId);

  const ARANCIO = 'C2410C', GRIGIO = '555555';
  const p = (testo, opz = {}) => new Paragraph({ spacing: { after: 80 }, ...opz, children: [new TextRun({ text: testo ?? '', ...(opz.run || {}) })] });
  const sezione = t => new Paragraph({ spacing: { before: 240, after: 80 }, children: [new TextRun({ text: t.toUpperCase(), bold: true, color: ARANCIO, size: 18 })] });
  const piccolo = (t, extra = {}) => p(t, { run: { size: 16, color: '333333', ...extra } });
  const bordi = {
    top: { style: BorderStyle.SINGLE, size: 2, color: 'DDDDDD' }, bottom: { style: BorderStyle.SINGLE, size: 2, color: 'DDDDDD' },
    left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL }
  };
  const cella = (contenuto, opz = {}) => new TableCell({
    borders: bordi, margins: { top: 60, bottom: 60, left: 80, right: 80 },
    width: opz.w ? { size: opz.w, type: WidthType.PERCENTAGE } : undefined,
    shading: opz.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: opz.fill } : undefined,
    columnSpan: opz.span,
    children: Array.isArray(contenuto) ? contenuto : [contenuto instanceof Paragraph ? contenuto : p(String(contenuto ?? ''), { run: opz.run })]
  });
  const tabella = (righe) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: righe });
  const intestazione = (titoli, larghezze) => new TableRow({
    tableHeader: true,
    children: titoli.map((t, i) => cella(t, { w: larghezze[i], fill: 'F3F1EE', run: { bold: true, size: 16, color: GRIGIO } }))
  });
  const kv = righe => tabella(righe.filter(r => r[1]).map(([k, val]) => new TableRow({
    children: [cella(k, { w: 30, run: { color: GRIGIO, size: 18 } }), cella(String(val), { w: 70 })]
  })));

  const children = [];

  // Intestazione con logo e dati del CSE
  const logo = await immagine(s.logo || await logoPng(), 90, 70);
  const nessunBordo = { top: { style: BorderStyle.NIL }, bottom: { style: BorderStyle.NIL }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } };
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      children: [
        new TableCell({ borders: nessunBordo, width: { size: 25, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new ImageRun({ data: logo.data, transformation: { width: logo.width, height: logo.height } })] })] }),
        new TableCell({
          borders: nessunBordo, width: { size: 75, type: WidthType.PERCENTAGE },
          children: [
            p(cse || 'Coordinatore per la sicurezza', { alignment: AlignmentType.RIGHT, run: { bold: true, size: 22 } }),
            p('Coordinatore per la sicurezza in fase di esecuzione', { alignment: AlignmentType.RIGHT, run: { size: 18 } }),
            p([s.ordine, s.iscrizione && 'n. ' + s.iscrizione].filter(Boolean).join(' '), { alignment: AlignmentType.RIGHT, run: { size: 16, color: GRIGIO } }),
            p([s.indirizzo, s.telefono, s.email, s.pec && 'PEC ' + s.pec].filter(Boolean).join(' · '), { alignment: AlignmentType.RIGHT, run: { size: 16, color: GRIGIO } })
          ]
        })
      ]
    })]
  }));
  children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ARANCIO } }, spacing: { after: 160 } }));
  children.push(p(bozza ? 'BOZZA DI VERBALE DI SOPRALLUOGO' : `VERBALE DI SOPRALLUOGO N. ${v.numero}${rev.toUpperCase()}`,
    { alignment: AlignmentType.CENTER, run: { bold: true, size: 30 } }));
  children.push(p('Verifica in cantiere del Coordinatore per la sicurezza in fase di esecuzione – art. 92 D.Lgs. 81/2008',
    { alignment: AlignmentType.CENTER, run: { size: 18, color: GRIGIO } }));

  children.push(sezione('Dati del cantiere'));
  children.push(kv([
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

  children.push(sezione('Sopralluogo'));
  children.push(kv([
    ['Data', fmtData(v.data)],
    ['Orario', [v.oraInizio, v.oraFine].filter(Boolean).join(' – ')],
    ['Condizioni meteo', v.meteo],
    ['Fasi lavorative in corso', v.fase]
  ]));
  children.push(piccolo(testoNormativo(s)));

  // Presenze
  const presenti = v.presenze.filter(x => x.presente);
  children.push(sezione('Imprese e lavoratori autonomi presenti'));
  if (presenti.length) {
    children.push(tabella([
      intestazione(['Impresa', 'Tipo', 'Addetti'], [60, 25, 15]),
      ...presenti.map(x => new TableRow({ children: [cella(nomeImpresa(x.impresaId), { w: 60 }), cella(TIPI[imprese[x.impresaId]?.tipo] || '', { w: 25 }), cella(x.addetti || '—', { w: 15 })] }))
    ]));
  } else children.push(p('Nessuna impresa presente.', { run: { italics: true } }));
  if (v.persone.length) {
    children.push(p('Persone presenti alla visita: ' + v.persone.map(x =>
      [x.nome, x.ruolo && `(${x.ruolo}${x.impresaId ? ', ' + nomeImpresa(x.impresaId) : ''})`].filter(Boolean).join(' ')).join('; ')));
  }

  // Verifica NC precedenti
  if (ncVerificate.length) {
    children.push(sezione('Verifica delle non conformità precedenti'));
    children.push(tabella([
      intestazione(['Verbale', 'Non conformità / impresa', 'Esito', 'Note'], [18, 37, 20, 25]),
      ...ncVerificate.map(n => {
        const ver = v.verificheNC[n.id]; const orig = verbaliCantiere[n.verbaleId];
        return new TableRow({ children: [
          cella(`n. ${orig?.numero ?? '?'} del ${fmtData(orig?.data)}`, { w: 18 }),
          cella(`${n.descrizione} – ${nomeImpresa(n.impresaId)}`, { w: 37 }),
          cella(ver.esito === 'risolta' ? 'RISOLTA' : 'ANCORA NON CONFORME', { w: 20, run: { bold: true, color: ver.esito === 'risolta' ? '15803D' : 'B91C1C' } }),
          cella([ver.nota || '', rifFoto(f => f.tipo === 'verifica' && f.ncId === n.id)].filter(Boolean).join(' – '), { w: 25 })
        ] });
      })
    ]));
  }

  // Esito delle verifiche con legenda
  children.push(sezione('Esito delle verifiche'));
  children.push(piccolo('Legenda: C = conforme; NC = non conforme; N.A. = non applicabile; non verificata = voce non controllata in questo sopralluogo. Gravità NC: lieve · grave · pericolo grave e imminente (art. 92 c.1 lett. f).'));
  const righe = [intestazione(['Voce', 'Esito', 'Note'], [60, 10, 30])];
  const naPerArea = [];
  for (const area of CHECKLIST) {
    const voci = area.voci.filter(x => ['c', 'nc'].includes(v.esiti[x.id]?.esito));
    const na = area.voci.filter(x => v.esiti[x.id]?.esito === 'na').length;
    const nv = area.voci.filter(x => !v.esiti[x.id]?.esito).length;
    if (na || nv) naPerArea.push(`${area.titolo}: ${[na && na + ' N.A.', nv && nv + ' non verificate'].filter(Boolean).join(', ')}`);
    if (!voci.length) continue;
    righe.push(new TableRow({ children: [cella(area.titolo, { span: 3, fill: 'F3F1EE', run: { bold: true } })] }));
    for (const voce of voci) {
      const e = v.esiti[voce.id];
      righe.push(new TableRow({ children: [
        cella(new Paragraph({ children: [new TextRun({ text: voce.testo }), new TextRun({ text: `  (${voce.rif})`, size: 14, color: '777777' })] }), { w: 60 }),
        cella(ESITO[e.esito], { w: 10, run: { bold: true, color: e.esito === 'nc' ? 'B91C1C' : '15803D' } }),
        cella([e.nota, rifFoto(f => f.tipo === 'voce' && f.voceId === voce.id)].filter(Boolean).join(' – '), { w: 30 })
      ] }));
    }
  }
  if (righe.length > 1) children.push(tabella(righe)); else children.push(p('Nessuna voce verificata.', { run: { italics: true } }));
  if (naPerArea.length) children.push(piccolo('Voci non applicabili o non verificate — ' + naPerArea.join('; ') + '.'));

  // Non conformità
  children.push(sezione('Non conformità rilevate e prescrizioni'));
  if (ncVerbale.length) {
    children.push(tabella([
      intestazione(['N.', 'Non conformità', 'Impresa', 'Prescrizione', 'Termine'], [5, 30, 18, 32, 15]),
      ...ncVerbale.map((n, i) => new TableRow({ children: [
        cella(String(i + 1), { w: 5 }),
        cella(new Paragraph({ children: [
          new TextRun({ text: n.descrizione }), new TextRun({ text: ' — ' + GRAVITA[n.gravita], bold: true, size: 16, color: n.gravita === 'pgi' ? 'B91C1C' : n.gravita === 'grave' ? 'B45309' : '1D4ED8' }),
          new TextRun({ text: rifFoto(f => f.tipo === 'nc' && f.ncId === n.id) ? '  ' + rifFoto(f => f.tipo === 'nc' && f.ncId === n.id) : '', size: 16, color: GRIGIO })
        ] }), { w: 30 }),
        cella(nomeImpresa(n.impresaId), { w: 18 }),
        cella(n.prescrizione, { w: 32 }),
        cella(fmtData(n.termine), { w: 15, run: { bold: true } })
      ] }))
    ]));
  } else children.push(p('Nel corso del sopralluogo non sono state rilevate non conformità.'));

  if (v.sospensione) { children.push(sezione('Sospensione delle lavorazioni – art. 92 c.1 lett. f')); children.push(p(v.sospensione)); }
  if (v.osservazioni) { children.push(sezione('Osservazioni e disposizioni del CSE')); children.push(p(v.osservazioni)); }
  children.push(piccolo(testoChiusura));

  // Foto
  if (tutteFoto.length) {
    children.push(sezione('Documentazione fotografica'));
    for (const f of tutteFoto) {
      const img = await immagine(f.blob, 420, 300);
      const didascalia = f.didascalia || (f.tipo === 'nc' ? 'Non conformità' : f.tipo === 'verifica' ? 'Verifica NC precedente' : '');
      children.push(new Paragraph({ keepNext: true, spacing: { before: 120 }, children: [new ImageRun({ data: img.data, transformation: { width: img.width, height: img.height } })] }));
      children.push(piccolo(`Foto ${fotoN.get(f.id)}${didascalia ? ' – ' + didascalia : ''}`));
    }
  }

  // Firme
  children.push(sezione('Firme'));
  children.push(p(`Letto, confermato e sottoscritto. ${c.comune ? c.comune + ', ' : ''}${fmtData(v.data)}`));
  const firma = async (titolo, nome, dataUrl, rifiuto) => {
    const out = [piccolo(titolo, { color: GRIGIO }), p(nome || '', { run: { bold: true } })];
    if (rifiuto) out.push(p('Non firma', { run: { italics: true } }));
    else if (dataUrl) { const im = await immagine(dataUrl, 180, 70); out.push(new Paragraph({ children: [new ImageRun({ data: im.data, transformation: { width: im.width, height: im.height } })] })); }
    else out.push(p('_____________________'));
    return out;
  };
  children.push(...await firma('Il Coordinatore per la sicurezza in fase di esecuzione', cse, v.firmaCSE));
  for (const x of v.persone) {
    children.push(...await firma([x.ruolo, x.impresaId && nomeImpresa(x.impresaId)].filter(Boolean).join(' – ') || 'Presente', x.nome, x.firma, x.rifiuto));
  }
  children.push(new Paragraph({
    spacing: { before: 200, after: 600 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' }, left: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' }, right: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' } },
    children: [new TextRun({ text: 'Spazio per la firma digitale del CSE (PAdES)', size: 16, color: '999999' })]
  }));
  children.push(p(testoGDPR(s), { run: { size: 14, color: '666666' } }));

  const doc = new Document({
    creator: cse || 'CSE', title: `Verbale di sopralluogo ${num} – ${c.denominazione}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{
      properties: { page: { margin: { top: 850, bottom: 850, left: 850, right: 850 } } },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: `Verbale ${num} – ${c.denominazione}    pag. `, size: 14, color: '777777' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 14, color: '777777' }),
            new TextRun({ text: ' di ', size: 14, color: '777777' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: '777777' })]
        })] })
      },
      children
    }]
  });
  const blob = await Packer.toBlob(doc);
  return new File([blob], nomeFileVerbale(v, c) + '.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
