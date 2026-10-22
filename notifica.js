// Lettura dei dati della notifica preliminare (art. 99 D.Lgs. 81/2008) dal PDF generato dal portale regionale.
// Si compila solo ciò che si trova con sicurezza: il resto lo inserisce il CSE a mano.
import { db } from './db.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

export async function caricaPdfJs() {
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = PDFJS + 'pdf.min.js'; s.onload = res; s.onerror = () => rej(new Error('libreria PDF non disponibile'));
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
  }
  return window.pdfjsLib;
}

// Righe di testo del PDF, pagina per pagina dall'alto in basso, con la posizione di ogni pezzo di testo.
async function righePdf(dati) {
  const lib = await caricaPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(dati) }).promise;
  const righe = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const { items } = await (await doc.getPage(p)).getTextContent();
    const pezzi = items.filter(it => it.str.trim()).map(it => ({ x: it.transform[4], y: it.transform[5], s: it.str.trim() }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    for (const pz of pezzi) {
      const r = righe.find(r => r.p === p && Math.abs(r.y - pz.y) <= 2);
      if (r) r.pezzi.push(pz); else righe.push({ p, y: pz.y, pezzi: [pz] });
    }
  }
  for (const r of righe) { r.pezzi.sort((a, b) => a.x - b.x); r.testo = r.pezzi.map(z => z.s).join('  '); }
  return righe.sort((a, b) => a.p - b.p || b.y - a.y);
}

// Codice fiscale delle persone (anche con le lettere al posto delle cifre in caso di omocodia).
const CF = /\b[A-Z]{6}[\dLMNPQRSTUV]{2}[A-Z][\dLMNPQRSTUV]{2}[A-Z][\dLMNPQRSTUV]{3}[A-Z]\b/i;
const PIVA = /\b\d{11}\b/;
const ETICHETTA = /^(.*?)\((\d+(?:bis)?)\)\s*:\s*(.*)$/;

// Le voci del modulo sono numerate, es. "Indirizzo cantiere (2):". Ogni voce prende le righe che la seguono.
function voci(righe) {
  const out = {};
  let cur = null;
  for (const r of righe) {
    const m = r.testo.match(ETICHETTA);
    if (m && r.pezzi[0].x < 60) { cur = { valore: m[3].trim(), righe: [] }; out[m[2]] = cur; }
    else if (cur) cur.righe.push(r);
  }
  return out;
}

const maiuscoleIniziali = s => s.toLowerCase().replace(/(^|[\s'’.(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
// I nomi scritti tutti in maiuscolo diventano "Mario Rossi"; quelli già scritti bene restano come sono.
const nomeLeggibile = s => (s === s.toUpperCase() ? maiuscoleIniziali(s) : s).replace(/\s+/g, ' ').trim();

// Righe di una tabella: ogni riga ha un "ancoraggio" (codice fiscale o partita IVA). Le celle lunghe vanno
// a capo verso il basso, quindi le righe senza ancoraggio appartengono a quella sopra. Il nome è il testo
// a sinistra dell'ancoraggio, colonna per colonna (es. Nome + Cognome).
function righeTabella(righe, ancora, leggibile) {
  const gruppi = [];
  for (const r of righe) {
    if (/^(Nome|Denominazione|PEC)\b/.test(r.testo)) continue;
    const pz = r.pezzi.find(z => ancora.test(z.s));
    if (pz) gruppi.push({ righe: [r], x: pz.x, riga: r.testo });
    else if (gruppi.length && gruppi[gruppi.length - 1].righe[0].p === r.p) gruppi[gruppi.length - 1].righe.push(r);
  }
  return gruppi.map(g => {
    const colonne = new Map();
    for (const r of g.righe) {
      for (const z of r.pezzi) {
        const testo = z.x < g.x - 2 ? z.s : (r === g.righe[0] && ancora.test(z.s) ? z.s.split(ancora)[0].trim() : '');
        if (!testo) continue;
        const k = Math.round(z.x / 10);
        colonne.set(k, [...(colonne.get(k) || []), testo]);
      }
    }
    const parti = [...colonne.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t.join(' '));
    return { nome: parti.map(p => leggibile ? nomeLeggibile(p) : p).join(' ').replace(/\s+/g, ' ').trim(), riga: g.riga };
  }).filter(x => x.nome);
}

function dataISO(s) {
  const m = (s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

function importo(s) {
  let t = (s || '').replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return '';
  const dec = t.match(/[.,](\d{1,2})$/);
  const intero = (dec ? t.slice(0, -dec[0].length) : t).replace(/[.,]/g, '');
  const n = Number(intero + (dec ? '.' + dec[1] : ''));
  return Number.isFinite(n) ? n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

// Restituisce i dati del cantiere trovati nella notifica e le imprese già selezionate (voce 12).
export async function leggiNotifica(dati, nomeFile = '') {
  const righe = await righePdf(dati);
  const tutto = righe.map(r => r.testo).join('\n');
  if (!tutto.trim()) return { cantiere: { notificaNumero: numeroDaFile(nomeFile) }, imprese: [], scansione: true };
  const v = voci(righe);
  const testoVoce = k => v[k] ? [v[k].valore, ...v[k].righe.map(r => r.testo)].join(' ').replace(/\s+/g, ' ').trim() : '';
  // Persone fisiche (codice fiscale) oppure società/enti (partita IVA o codice fiscale numerico).
  const persone = k => {
    if (!v[k]) return [];
    const fisiche = righeTabella(v[k].righe, CF, true);
    return (fisiche.length ? fisiche : righeTabella(v[k].righe, PIVA, true)).map(x => x.nome);
  };
  const c = {};

  c.notificaNumero = numeroDaFile(nomeFile) || (tutto.match(/\[id:(\d+)\]/) || [])[1] || '';
  c.notificaData = dataISO(v['1']?.valore);

  const ind = (v['2']?.valore || '').match(/^(.*?),\s*(\d{5})\s*-\s*([^,]+?)\s*(?:,\s*lat:\s*(-?[\d.]+)\s*,\s*long:\s*(-?[\d.]+))?\s*$/i);
  if (ind) {
    c.indirizzo = ind[1].replace(/,\s*,/g, ',').trim();
    c.comune = ind[3].trim();
    if (ind[4] && ind[5]) c.coordinate = `${Number(ind[4]).toFixed(5)}, ${Number(ind[5]).toFixed(5)}`;
  } else if (v['2']?.valore) c.indirizzo = v['2'].valore;

  const committenti = persone('3');
  if (committenti.length) {
    c.committente = committenti[0].replace(/\s+(amministratore|legale rappresentante)\s+(.+)$/i, (_, ruolo, chi) => ` (${ruolo.toLowerCase()} ${chi})`);
  }
  const natura = testoVoce('4');
  const breve = (c.committente || '').replace(/\s*\(.*\)$/, '');
  if (natura || breve) c.denominazione = [breve, natura].filter(Boolean).join(' – ');

  const rl = persone('5'); if (rl.length) c.rl = rl[0];
  const csp = persone('6'); if (csp.length) c.csp = csp[0];
  const cse = persone('7'); if (cse.length) c.cse = cse[0];

  c.dataInizio = dataISO(v['8']?.valore);
  const giorni = parseInt(v['9']?.valore, 10);
  if (c.dataInizio && giorni > 0) {
    const d = new Date(c.dataInizio + 'T12:00:00');
    d.setDate(d.getDate() + giorni);
    c.dataFine = d.toISOString().slice(0, 10);
  }
  c.importo = importo(v['13']?.valore);

  const imprese = v['12'] ? righeTabella(v['12'].righe, PIVA).map(x => {
    const piva = x.riga.match(PIVA)[0];
    const ruolo = (x.riga.split(PIVA)[1] || '').toLowerCase();
    return {
      ragioneSociale: x.nome, piva,
      tipo: /autonom/.test(ruolo) ? 'autonomo' : /affidatar/.test(ruolo) ? 'affidataria' : 'esecutrice'
    };
  }) : [];

  for (const k of Object.keys(c)) if (!c[k]) delete c[k];
  return { cantiere: c, imprese, scansione: false };
}

export const numeroDaFile = nome => (nome || '').replace(/\.pdf$/i, '').trim();

// Crea il cantiere con i dati letti; le imprese si collegano a quelle già in anagrafica (stessa P.IVA) o si creano.
// "base" e "impresaVuota" sono i modelli vuoti dell'app, così le schede hanno tutti i campi.
export async function creaCantiereDaNotifica(letti, base, impresaVuota = {}) {
  return db.transaction('rw', db.cantieri, db.imprese, db.cantiereImprese, async () => {
    const cid = await db.cantieri.add({ ...base, ...letti.cantiere, stato: 'attivo' });
    await collegaImprese(cid, letti.imprese, impresaVuota);
    return cid;
  });
}

// Per un cantiere già esistente: si aggiungono numero e data della notifica e si completano solo i campi vuoti.
export async function completaCantiereDaNotifica(cid, letti, impresaVuota = {}) {
  return db.transaction('rw', db.cantieri, db.imprese, db.cantiereImprese, async () => {
    const c = await db.cantieri.get(cid);
    const vuoti = Object.fromEntries(Object.entries(letti.cantiere).filter(([k]) => !String(c[k] ?? '').trim()));
    await db.cantieri.update(cid, { ...vuoti, notificaNumero: letti.cantiere.notificaNumero, ...(letti.cantiere.notificaData ? { notificaData: letti.cantiere.notificaData } : {}) });
    await collegaImprese(cid, letti.imprese, impresaVuota);
    return Object.keys(vuoti).filter(k => !['notificaNumero', 'notificaData'].includes(k));
  });
}

// Imprese della notifica: si usa quella già in anagrafica con la stessa P.IVA, altrimenti si crea.
async function collegaImprese(cid, imprese, impresaVuota) {
  const tutte = await db.imprese.toArray();
  const legate = (await db.cantiereImprese.where('cantiereId').equals(cid).toArray()).map(l => l.impresaId);
  for (const i of imprese) {
    const esistente = tutte.find(x => (x.piva || '').replace(/\D/g, '') === i.piva);
    const iid = esistente ? esistente.id : await db.imprese.add({ ...impresaVuota, ragioneSociale: i.ragioneSociale, piva: i.piva, tipo: i.tipo });
    if (!legate.includes(iid)) { await db.cantiereImprese.add({ cantiereId: cid, impresaId: iid }); legate.push(iid); }
  }
}

// Cantieri senza numero di notifica con lo stesso indirizzo: probabilmente sono lo stesso cantiere.
const normInd = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const cantieriSimili = (cantieri, letti) => cantieri.filter(c => !(c.notificaNumero || '').trim() &&
  letti.cantiere.indirizzo && normInd(c.indirizzo) === normInd(letti.cantiere.indirizzo) &&
  (!c.comune || !letti.cantiere.comune || normInd(c.comune) === normInd(letti.cantiere.comune)));
