// Salvataggio dei verbali su Google Drive: Sopralluoghi cantiere / <nome del cantiere> / verbale.pdf + verbale.docx
// Accesso con Google Identity Services e permesso "drive.file": l'app vede e modifica solo i file che crea lei.
import { db, getImpostazioni, salvaImpostazioni } from './db.js';

// Identificativo OAuth del progetto Google Cloud del CSE (tipo "Applicazione web").
export const GOOGLE_CLIENT_ID = '824906668646-mu5idprnfnf8e8g3kao86e5kqu6ccrc6.apps.googleusercontent.com';
export const CARTELLA_PRINCIPALE = 'Sopralluoghi cantiere';

const AMBITO = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const CARTELLA = 'application/vnd.google-apps.folder';

export const driveConfigurato = () => !!GOOGLE_CLIENT_ID;

let token = null; // { valore, scade }
try { token = JSON.parse(sessionStorage.getItem('driveToken') || 'null'); } catch { token = null; }
const tokenValido = () => token && token.scade > Date.now() + 60000;
// Vero quando si può salvare senza aprire la finestra di Google (accesso fatto da meno di un'ora).
export const accessoAttivo = () => !!tokenValido();

function caricaGoogle() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.onload = res;
    s.onerror = () => rej(new Error('Servizio Google non raggiungibile: controlla la connessione.'));
    document.head.appendChild(s);
  });
}

// Chiede un accesso a Google. Va chiamata da un tocco dell'utente (apre la finestra di Google se serve).
export async function accedi({ conferma = false } = {}) {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google Drive non è ancora configurato nell\'app.');
  if (!conferma && tokenValido()) return token.valore;
  await caricaGoogle();
  const imp = await getImpostazioni();
  return new Promise((res, rej) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: AMBITO,
      hint: imp.driveEmail || undefined,
      callback: async r => {
        if (r.error) { rej(new Error('Accesso a Google non riuscito: ' + r.error)); return; }
        token = { valore: r.access_token, scade: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
        try { sessionStorage.setItem('driveToken', JSON.stringify(token)); } catch { /* facoltativo */ }
        if (!imp.driveCollegato) await salvaImpostazioni({ driveCollegato: true });
        res(token.valore);
      },
      error_callback: e => rej(new Error(e?.type === 'popup_closed' ? 'Finestra di Google chiusa prima di completare l\'accesso.' : 'Accesso a Google non riuscito.'))
    });
    client.requestAccessToken({ prompt: conferma || !imp.driveCollegato ? 'consent' : '' });
  });
}

export async function scollega() {
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.valore, () => {});
  token = null;
  try { sessionStorage.removeItem('driveToken'); } catch { /* facoltativo */ }
  await salvaImpostazioni({ driveCollegato: false, driveCartellaId: null });
}

async function chiama(url, opz = {}) {
  const r = await fetch(url, { ...opz, headers: { Authorization: 'Bearer ' + token.valore, ...(opz.headers || {}) } });
  if (r.status === 401) { token = null; throw new Error('Accesso a Google scaduto: tocca di nuovo «Salva su Drive».'); }
  if (!r.ok) throw new Error(`Google Drive ha risposto con errore ${r.status}.`);
  return r.status === 204 ? null : r.json();
}

const pulisciNome = n => (n || 'Cantiere senza nome').replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 120);
const q = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function esiste(id) {
  if (!id) return false;
  try { const f = await chiama(`${API}/files/${id}?fields=id,trashed`); return f && !f.trashed; } catch { return false; }
}

async function trovaOCreaCartella(nome, padre) {
  const filtro = `mimeType='${CARTELLA}' and name='${q(nome)}' and trashed=false` + (padre ? ` and '${padre}' in parents` : ` and 'root' in parents`);
  const r = await chiama(`${API}/files?q=${encodeURIComponent(filtro)}&fields=files(id,name)&spaces=drive`);
  if (r.files?.length) return r.files[0].id;
  const nuova = await chiama(`${API}/files?fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, mimeType: CARTELLA, parents: padre ? [padre] : undefined })
  });
  return nuova.id;
}

export async function cartellaRadice() {
  const imp = await getImpostazioni();
  let radice = imp.driveCartellaId;
  if (!(await esiste(radice))) {
    radice = await trovaOCreaCartella(CARTELLA_PRINCIPALE, null);
    await salvaImpostazioni({ driveCartellaId: radice });
  }
  return radice;
}

// ---- File dei dati per la sincronizzazione tra dispositivi ----
export const FILE_DATI = 'dati app Verbali CSE (non modificare).json';

// Restituisce { id, version } del file dati su Drive, oppure null se non esiste ancora.
export async function infoFileDati() {
  const radice = await cartellaRadice();
  const filtro = `name='${q(FILE_DATI)}' and '${radice}' in parents and trashed=false`;
  const r = await chiama(`${API}/files?q=${encodeURIComponent(filtro)}&fields=files(id,version,modifiedTime)&spaces=drive`);
  return r.files?.[0] ? { id: r.files[0].id, version: String(r.files[0].version) } : null;
}

export async function scaricaFileDati(id) {
  const r = await fetch(`${API}/files/${id}?alt=media`, { headers: { Authorization: 'Bearer ' + token.valore } });
  if (!r.ok) throw new Error(`Download dei dati non riuscito (${r.status}).`);
  return r.json();
}

// Carica (o sostituisce) il file dati e restituisce { id, version } aggiornati.
export async function caricaFileDati(dati, id, nome = FILE_DATI) {
  const blob = new Blob([JSON.stringify(dati)], { type: 'application/json' });
  if (id) {
    const r = await chiama(`${UPLOAD}/files/${id}?uploadType=media&fields=id,version`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: blob });
    return { id: r.id, version: String(r.version) };
  }
  const radice = await cartellaRadice();
  const corpo = new FormData();
  corpo.append('metadata', new Blob([JSON.stringify({ name: nome, mimeType: 'application/json', parents: [radice] })], { type: 'application/json' }));
  corpo.append('file', blob);
  const r = await chiama(`${UPLOAD}/files?uploadType=multipart&fields=id,version`, { method: 'POST', body: corpo });
  return { id: r.id, version: String(r.version) };
}

async function cartellaCantiere(cantiere) {
  const radice = await cartellaRadice();
  let id = cantiere.driveCartellaId;
  if (!(await esiste(id))) {
    id = await trovaOCreaCartella(pulisciNome(cantiere.denominazione), radice);
    await db.cantieri.update(cantiere.id, { driveCartellaId: id });
  }
  return id;
}

// Carica un file nuovo o sostituisce il contenuto di quello già caricato (stesso link su Drive).
async function caricaFile(file, cartella, idEsistente) {
  const metadati = { name: file.name, mimeType: file.type };
  if (idEsistente && await esiste(idEsistente)) {
    await chiama(`${API}/files/${idEsistente}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name }) });
    await chiama(`${UPLOAD}/files/${idEsistente}?uploadType=media&fields=id`, { method: 'PATCH', headers: { 'Content-Type': file.type }, body: file });
    return idEsistente;
  }
  const corpo = new FormData();
  corpo.append('metadata', new Blob([JSON.stringify({ ...metadati, parents: [cartella] })], { type: 'application/json' }));
  corpo.append('file', file);
  const r = await chiama(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', body: corpo });
  return r.id;
}

// Salva PDF e Word di un verbale chiuso nella cartella del suo cantiere.
export async function salvaVerbaleSuDrive(verbaleId) {
  await accedi();
  const v = await db.verbali.get(verbaleId);
  const c = await db.cantieri.get(v.cantiereId);
  const [{ generaPdf }, { generaWord }] = await Promise.all([import('./pdf.js'), import('./word.js')]);
  const [pdf, docx] = await Promise.all([generaPdf(verbaleId), generaWord(verbaleId)]);
  const cartella = await cartellaCantiere(c);
  const prima = v.drive || {};
  const pdfId = await caricaFile(pdf, cartella, prima.pdfId);
  const docxId = await caricaFile(docx, cartella, prima.docxId);
  const drive = { pdfId, docxId, cartellaId: cartella, salvato: Date.now(), revisione: v.revisione || 0 };
  await db.verbali.update(verbaleId, { drive, driveDaInviare: false });
  return drive;
}

// Verbali chiusi non ancora salvati su Drive (o modificati dopo l'ultimo salvataggio).
export async function verbaliDaInviare() {
  const chiusi = await db.verbali.where('stato').equals('chiuso').toArray();
  return chiusi.filter(v => v.driveDaInviare || !v.drive || (v.drive.revisione || 0) !== (v.revisione || 0));
}

export const linkCartella = id => `https://drive.google.com/drive/folders/${id}`;
