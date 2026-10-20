// Database locale (IndexedDB) tramite Dexie, caricato come script globale in index.html.
import { blobToDataURL, dataURLToBlob } from './util.js';

const Dexie = window.Dexie;

export const db = new Dexie('verbaleCSE');

db.version(1).stores({
  impostazioni: 'id',
  cantieri: '++id, stato',
  imprese: '++id, ragioneSociale',
  cantiereImprese: '++id, cantiereId, impresaId',
  verbali: '++id, cantiereId, stato',
  nonConformita: '++id, cantiereId, verbaleId, impresaId, stato',
  foto: '++id, verbaleId, ncId'
});

export const liveQuery = Dexie.liveQuery;

export async function getImpostazioni() {
  return (await db.impostazioni.get('cse')) || { id: 'cse' };
}

export async function salvaImpostazioni(patch) {
  const cur = await getImpostazioni();
  await db.impostazioni.put({ ...cur, ...patch, id: 'cse' });
}

export async function impreseDelCantiere(cantiereId) {
  const links = await db.cantiereImprese.where('cantiereId').equals(cantiereId).toArray();
  const imprese = await db.imprese.bulkGet(links.map(l => l.impresaId));
  return imprese.filter(Boolean);
}

// NC ancora da verificare per un cantiere, escluse quelle del verbale in bozza corrente.
export async function ncApertePrecedenti(cantiereId, verbaleId) {
  const tutte = await db.nonConformita.where('cantiereId').equals(cantiereId).toArray();
  return tutte.filter(n => !n.bozza && n.verbaleId !== verbaleId && n.stato !== 'risolta');
}

export async function eliminaVerbaleBozza(verbaleId) {
  await db.transaction('rw', db.verbali, db.nonConformita, db.foto, async () => {
    const ncIds = (await db.nonConformita.where('verbaleId').equals(verbaleId).primaryKeys());
    await db.foto.where('verbaleId').equals(verbaleId).delete();
    await db.foto.where('ncId').anyOf(ncIds).delete();
    await db.nonConformita.bulkDelete(ncIds);
    await db.verbali.delete(verbaleId);
  });
}

export async function chiudiVerbale(verbaleId) {
  await db.transaction('rw', db.verbali, db.nonConformita, async () => {
    const v = await db.verbali.get(verbaleId);
    const chiusi = await db.verbali.where('cantiereId').equals(v.cantiereId)
      .filter(x => x.stato === 'chiuso').toArray();
    // Un verbale riaperto per modifica mantiene il suo numero e passa alla revisione successiva.
    const numero = v.numero || chiusi.reduce((m, x) => Math.max(m, x.numero || 0), 0) + 1;
    const revisione = v.numero ? (v.revisione || 0) + 1 : 0;
    // Applica gli esiti delle verifiche delle NC precedenti.
    for (const [ncId, ver] of Object.entries(v.verificheNC || {})) {
      if (!ver.esito) continue;
      const nc = await db.nonConformita.get(Number(ncId));
      if (!nc) continue;
      const storico = [...(nc.verifiche || []), { verbaleId, data: v.data, esito: ver.esito, nota: ver.nota || '' }];
      await db.nonConformita.update(nc.id, {
        stato: ver.esito,
        verifiche: storico,
        ...(ver.esito === 'risolta' ? { verbaleChiusura: verbaleId, dataChiusura: v.data } : {})
      });
    }
    await db.nonConformita.where('verbaleId').equals(verbaleId).modify({ bozza: false });
    await db.verbali.update(verbaleId, { stato: 'chiuso', numero, revisione, chiusoIl: Date.now() });
  });
}

// Un verbale si può modificare solo se è l'ultimo del cantiere (nessun sopralluogo successivo).
export async function puoRiaprire(verbaleId) {
  const v = await db.verbali.get(verbaleId);
  const altri = await db.verbali.where('cantiereId').equals(v.cantiereId)
    .filter(x => x.id !== verbaleId && (x.stato === 'bozza' || (x.numero || 0) > v.numero)).count();
  return altri === 0;
}

export async function riapriVerbale(verbaleId) {
  await db.transaction('rw', db.verbali, db.nonConformita, async () => {
    const v = await db.verbali.get(verbaleId);
    // Annulla gli esiti di verifica che questo verbale aveva applicato alle NC precedenti.
    for (const ncId of Object.keys(v.verificheNC || {})) {
      const nc = await db.nonConformita.get(Number(ncId));
      if (!nc) continue;
      const verifiche = (nc.verifiche || []).filter(x => x.verbaleId !== verbaleId);
      const patch = { verifiche, stato: verifiche.length ? verifiche[verifiche.length - 1].esito : 'aperta' };
      if (nc.verbaleChiusura === verbaleId) { patch.verbaleChiusura = null; patch.dataChiusura = null; }
      await db.nonConformita.update(nc.id, patch);
    }
    await db.nonConformita.where('verbaleId').equals(verbaleId).modify({ bozza: true });
    await db.verbali.update(verbaleId, { stato: 'bozza', riapertoIl: Date.now() });
  });
}

// ---- Backup ----

export async function creaBackup() {
  const out = { app: 'verbale-cse', versione: 1, creato: new Date().toISOString(), tabelle: {} };
  for (const t of db.tables) {
    const rows = await t.toArray();
    out.tabelle[t.name] = await Promise.all(rows.map(async r =>
      r.blob instanceof Blob ? { ...r, blob: await blobToDataURL(r.blob) } : r));
  }
  return out;
}

export async function ripristinaBackup(data) {
  if (data?.app !== 'verbale-cse' || !data.tabelle) throw new Error('File di backup non valido');
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      await t.clear();
      const rows = (data.tabelle[t.name] || []).map(r =>
        typeof r.blob === 'string' ? { ...r, blob: dataURLToBlob(r.blob) } : r);
      if (rows.length) await t.bulkPut(rows);
    }
  });
}
