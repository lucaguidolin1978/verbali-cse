// Sincronizzazione dei dati tra dispositivi tramite Google Drive ("un dispositivo alla volta").
// Su Drive c'è un solo file con tutti i dati; ogni dispositivo ricorda quale versione ha scaricato
// e se ha modifiche non ancora caricate. All'apertura si scarica la versione più recente, dopo ogni
// modifica la si ricarica. Se entrambe le parti sono cambiate, decide l'utente.
import { db, getImpostazioni, creaBackup, ripristinaBackup } from './db.js';
import { dataURLToBlob } from './util.js';
import { driveConfigurato, accedi, accessoAttivo, infoFileDati, scaricaFileDati, caricaFileDati } from './drive.js';

const CHIAVE = 'syncVerbaliCSE';
// Campi delle impostazioni che appartengono al singolo dispositivo e non si sovrascrivono.
const CAMPI_LOCALI = ['driveCollegato', 'driveCartellaId', 'driveEmail', 'ultimoBackup'];

export function statoSync() {
  try { return JSON.parse(localStorage.getItem(CHIAVE) || '{}'); } catch { return {}; }
}
function salvaStato(patch) {
  const s = { ...statoSync(), ...patch };
  try { localStorage.setItem(CHIAVE, JSON.stringify(s)); } catch { /* memoria del browser non disponibile */ }
  window.dispatchEvent(new CustomEvent('sync-stato', { detail: s }));
  return s;
}

// ---- Registro delle modifiche locali ----
let applicando = false;
let timer = null;
function segnaModifica() {
  if (applicando) return;
  salvaStato({ sporco: Date.now() });
  // Si carica dopo 20 secondi senza modifiche (non a ogni tasto) e quando l'app va in secondo piano.
  clearTimeout(timer);
  timer = setTimeout(() => sincronizza().catch(() => {}), 20000);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && statoSync().sporco) { clearTimeout(timer); sincronizza().catch(() => {}); }
});
for (const t of db.tables) {
  t.hook('creating', segnaModifica);
  t.hook('updating', segnaModifica);
  t.hook('deleting', segnaModifica);
}

const haDati = async () => (await db.cantieri.count()) + (await db.imprese.count()) + (await db.verbali.count()) > 0;

async function senzaRegistrare(fn) {
  applicando = true;
  try { return await fn(); } finally { applicando = false; }
}

// Sostituisce i dati di questo dispositivo con quelli di Drive, mantenendo le impostazioni locali di Drive.
async function applicaRemoto(dati, info) {
  const prima = await getImpostazioni();
  await senzaRegistrare(async () => {
    await ripristinaBackup(dati);
    const dopo = await getImpostazioni();
    const locali = Object.fromEntries(CAMPI_LOCALI.map(k => [k, prima[k]]));
    await db.impostazioni.put({ ...dopo, ...locali, id: 'cse' });
  });
  return salvaStato({ fileId: info.id, version: info.version, sporco: 0, ultima: Date.now(), conflitto: null });
}

async function caricaLocale(info) {
  const dati = await creaBackup();
  const nuova = await caricaFileDati(dati, info?.id);
  return salvaStato({ fileId: nuova.id, version: nuova.version, sporco: 0, ultima: Date.now(), conflitto: null });
}

// Esito: 'aggiornato' | 'scaricato' | 'caricato' | 'nessuna-modifica' | { conflitto: 'primo'|'entrambi' } | 'non-collegato'
export async function sincronizza({ interattivo = false } = {}) {
  if (!driveConfigurato() || !navigator.onLine) return 'non-collegato';
  const imp = await getImpostazioni();
  if (!imp.driveCollegato) return 'non-collegato';
  if (!interattivo && !accessoAttivo()) return 'non-collegato';
  await accedi();
  const st = statoSync();
  const info = await infoFileDati();
  try { sessionStorage.setItem('syncFatto', '1'); } catch { /* facoltativo */ }

  if (!info) { await caricaLocale(null); return 'caricato'; }
  if (st.version === info.version) {
    if (st.sporco) { await caricaLocale(info); return 'caricato'; }
    salvaStato({ ultima: Date.now() });
    return 'nessuna-modifica';
  }
  // Su Drive c'è una versione diversa da quella che questo dispositivo conosce.
  if (!st.version) {
    if (!(await haDati())) { await applicaRemoto(await scaricaFileDati(info.id), info); return 'scaricato'; }
    salvaStato({ conflitto: 'primo' });
    return { conflitto: 'primo' };
  }
  if (!st.sporco) { await applicaRemoto(await scaricaFileDati(info.id), info); return 'scaricato'; }
  salvaStato({ conflitto: 'entrambi' });
  return { conflitto: 'entrambi' };
}

// Scelte dell'utente in caso di conflitto.
export async function usaDrive() {
  await accedi();
  const info = await infoFileDati();
  // Prima di sostituire, i dati di questo dispositivo vengono messi al sicuro su Drive.
  if (await haDati()) {
    const ora = new Date().toLocaleString('it-IT').replace(/[/:]/g, '-').replace(',', '');
    await caricaFileDati(await creaBackup(), null, `copia di sicurezza ${ora}.json`);
  }
  await applicaRemoto(await scaricaFileDati(info.id), info);
}
export async function usaQuestoDispositivo() {
  await accedi();
  await caricaLocale(await infoFileDati());
}
export async function unisci() {
  await accedi();
  const info = await infoFileDati();
  const remoto = await scaricaFileDati(info.id);
  await senzaRegistrare(() => unisciDati(remoto));
  await caricaLocale(info);
}

// Aggiunge ai dati locali quelli di Drive, con nuovi identificativi e riferimenti corretti.
// Imprese e cantieri già presenti (stessa P.IVA o stesso nome) non vengono duplicati.
async function unisciDati(remoto) {
  const T = remoto.tabelle || {};
  const norm = s => (s || '').trim().toLowerCase();
  const mappa = { imprese: new Map(), cantieri: new Map(), verbali: new Map(), nc: new Map() };
  const senzaId = ({ id, ...resto }) => resto;

  await db.transaction('rw', db.tables, async () => {
    const impreseLoc = await db.imprese.toArray();
    for (const i of T.imprese || []) {
      const uguale = impreseLoc.find(l => (i.piva && l.piva && l.piva === i.piva) || norm(l.ragioneSociale) === norm(i.ragioneSociale));
      mappa.imprese.set(i.id, uguale ? uguale.id : await db.imprese.add(senzaId(i)));
    }
    const cantieriLoc = await db.cantieri.toArray();
    for (const c of T.cantieri || []) {
      const uguale = cantieriLoc.find(l => norm(l.denominazione) === norm(c.denominazione) && norm(l.indirizzo) === norm(c.indirizzo));
      mappa.cantieri.set(c.id, uguale ? uguale.id : await db.cantieri.add(senzaId(c)));
    }
    const legami = await db.cantiereImprese.toArray();
    for (const l of T.cantiereImprese || []) {
      const cantiereId = mappa.cantieri.get(l.cantiereId), impresaId = mappa.imprese.get(l.impresaId);
      if (cantiereId && impresaId && !legami.some(x => x.cantiereId === cantiereId && x.impresaId === impresaId)) {
        // Il legame porta con sé anche i dati del POS di quel cantiere.
        await db.cantiereImprese.add({ ...senzaId(l), cantiereId, impresaId });
      }
    }
    const imp = id => mappa.imprese.get(id) ?? id;
    for (const v of T.verbali || []) {
      const nuovo = {
        ...senzaId(v), cantiereId: mappa.cantieri.get(v.cantiereId),
        presenze: (v.presenze || []).map(p => ({ ...p, impresaId: imp(p.impresaId) })),
        persone: (v.persone || []).map(p => ({ ...p, impresaId: p.impresaId ? imp(p.impresaId) : p.impresaId }))
      };
      mappa.verbali.set(v.id, await db.verbali.add(nuovo));
    }
    const ver = id => mappa.verbali.get(id) ?? id;
    for (const n of T.nonConformita || []) {
      mappa.nc.set(n.id, await db.nonConformita.add({
        ...senzaId(n), cantiereId: mappa.cantieri.get(n.cantiereId), verbaleId: ver(n.verbaleId),
        impresaId: n.impresaId ? imp(n.impresaId) : n.impresaId,
        verbaleChiusura: n.verbaleChiusura ? ver(n.verbaleChiusura) : n.verbaleChiusura,
        verifiche: (n.verifiche || []).map(x => ({ ...x, verbaleId: ver(x.verbaleId) }))
      }));
    }
    // Le verifiche delle NC precedenti sono indicizzate per NC: si aggiornano ora che le NC hanno i nuovi id.
    for (const v of T.verbali || []) {
      if (!v.verificheNC || !Object.keys(v.verificheNC).length) continue;
      const verifiche = Object.fromEntries(Object.entries(v.verificheNC).map(([k, x]) => [mappa.nc.get(Number(k)) ?? k, x]));
      await db.verbali.update(mappa.verbali.get(v.id), { verificheNC: verifiche });
    }
    for (const f of T.foto || []) {
      await db.foto.add({
        ...senzaId(f), blob: typeof f.blob === 'string' ? dataURLToBlob(f.blob) : f.blob,
        verbaleId: f.verbaleId ? ver(f.verbaleId) : f.verbaleId, ncId: f.ncId ? (mappa.nc.get(f.ncId) ?? f.ncId) : f.ncId
      });
    }
    // Impostazioni: si completano solo i campi vuoti su questo dispositivo.
    const remotaImp = (T.impostazioni || [])[0];
    if (remotaImp) {
      const loc = await getImpostazioni();
      const completa = Object.fromEntries(Object.entries(remotaImp).filter(([k, val]) => !CAMPI_LOCALI.includes(k) && val && !loc[k]));
      await db.impostazioni.put({ ...loc, ...completa, id: 'cse' });
    }
  });
}
