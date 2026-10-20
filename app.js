import { html, render, useState, useEffect, useRef, useMemo, useCallback } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import {
  db, liveQuery, getImpostazioni, salvaImpostazioni, impreseDelCantiere, ncApertePrecedenti,
  eliminaVerbaleBozza, chiudiVerbale, creaBackup, ripristinaBackup, puoRiaprire, riapriVerbale, eliminaCantiere
} from './db.js';

// Mostrata in Impostazioni: serve a capire se il tablet ha l'ultima versione.
const VERSIONE = '12 · 20/10/2026';
import { CHECKLIST, VOCI, GRAVITA } from './checklist.js';
import { CATALOGO } from './catalogo.js';
import { LOGO_SCURO } from './logo.js';
import {
  driveConfigurato, accedi as accediDrive, scollega as scollegaDrive, accessoAttivo,
  salvaVerbaleSuDrive, verbaliDaInviare, linkCartella, CARTELLA_PRINCIPALE
} from './drive.js';
import { sincronizza, statoSync, usaDrive, usaQuestoDispositivo, unisci } from './sync.js';
import { oggiISO, oraHHMM, fmtData, scaduta, ridimensiona, blobToDataURL, condividiOScarica, scarica } from './util.js';

const SignaturePad = window.SignaturePad;
// Dentro un riquadro (es. link di prova su claude.ai) download, condivisione e microfono non sono disponibili.
const PROVA = window.self !== window.top;
const SR = PROVA ? null : (window.SpeechRecognition || window.webkitSpeechRecognition);
const GIORNI_BACKUP = 7;

// ---------- Finestre di conferma interne (al posto di confirm/alert) ----------

let apriDialogo = () => {};
const chiedi = (testo, ok = 'Conferma') => new Promise(res => apriDialogo({ testo, ok, res, conferma: true }));
const avviso = testo => new Promise(res => apriDialogo({ testo, ok: 'OK', res, conferma: false }));
// Più scelte: [{ valore, etichetta, primaria? }]; restituisce il valore scelto, o null se si chiude.
const scegli = (testo, scelte) => new Promise(res => apriDialogo({ testo, scelte, res }));

function Dialogo() {
  const [d, setD] = useState(null);
  apriDialogo = setD;
  if (!d) return null;
  const chiudi = v => { setD(null); d.res(v); };
  return html`<div class="dlg-bg" onClick=${e => e.target === e.currentTarget && chiudi(d.scelte ? null : false)}>
    <div class="dlg" role="alertdialog" aria-modal="true">
      <p>${d.testo}</p>
      ${d.scelte ? html`<div class="dlg-scelte">${d.scelte.map(s => html`
          <button class=${'btn' + (s.primaria ? ' primary' : '')} onClick=${() => chiudi(s.valore)}>${s.etichetta}</button>`)}</div>`
      : html`<div class="row-btns">
        ${d.conferma && html`<button class="btn ghost" onClick=${() => chiudi(false)}>Annulla</button>`}
        <button class="btn primary" onClick=${() => chiudi(true)} autofocus>${d.ok}</button>
      </div>`}
    </div>
  </div>`;
}

// ---------- Hook di base ----------

function useLive(query, deps = []) {
  const [val, setVal] = useState(undefined);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setVal, error: e => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return val;
}

function useRoute() {
  const leggi = () => (location.hash.slice(1) || '/').split('/').filter(Boolean);
  const [r, setR] = useState(leggi);
  useEffect(() => {
    const f = () => { setR(leggi()); window.scrollTo(0, 0); };
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return r;
}

const go = (p) => { location.hash = p; };

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const f = () => setOn(navigator.onLine);
    addEventListener('online', f); addEventListener('offline', f);
    return () => { removeEventListener('online', f); removeEventListener('offline', f); };
  }, []);
  return on;
}

// ---------- Icone ----------

const Icon = ({ d, size = 22 }) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d.map(p => html`<path d=${p} />`)}</svg>`;
const I = {
  home: ['M3 11l9-8 9 8', 'M5 10v10h14V10'],
  cantiere: ['M2 20h20', 'M4 20V9l8-5 8 5v11', 'M9 20v-6h6v6'],
  imprese: ['M3 21V7l6-4v18', 'M9 21h12V10l-6-3', 'M13 12h4', 'M13 16h4'],
  nc: ['M12 3l10 18H2z', 'M12 10v5', 'M12 18h.01'],
  imp: ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z'],
  mic: ['M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z', 'M19 10v2a7 7 0 01-14 0v-2', 'M12 19v3'],
  cam: ['M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z', 'M12 17a4 4 0 100-8 4 4 0 000 8z'],
  plus: ['M12 5v14', 'M5 12h14'],
  x: ['M18 6L6 18', 'M6 6l12 12'],
  back: ['M15 18l-6-6 6-6']
};

// ---------- Componenti di input ----------

function Mic({ onText }) {
  const online = useOnline();
  const [on, setOn] = useState(false);
  const cb = useRef(onText); cb.current = onText;
  const rec = useRef(null);
  useEffect(() => () => rec.current?.abort(), []);
  if (!SR) return null;
  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    const r = new SR();
    r.lang = 'it-IT'; r.interimResults = false; r.continuous = false;
    r.onresult = e => cb.current(Array.from(e.results).map(x => x[0].transcript).join(' '));
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r; r.start(); setOn(true);
  };
  return html`<button type="button" class=${'icon-btn mic' + (on ? ' on' : '')} disabled=${!online}
    title=${online ? (on ? 'Interrompi dettatura' : 'Detta') : 'Senza rete: usa il microfono della tastiera'}
    aria-label="Dettatura vocale" onClick=${toggle}><${Icon} d=${I.mic} /></button>`;
}

function Field({ label, value, onInput, type = 'text', rows, mic, options, hint, ...rest }) {
  const v = value ?? '';
  const appendi = t => onInput((v ? v.trimEnd() + ' ' : '') + t.trim());
  let input;
  if (options) {
    input = html`<select value=${v} onChange=${e => onInput(e.target.value)} ...${rest}>
      ${options.map(([val, lab]) => html`<option value=${val}>${lab}</option>`)}</select>`;
  } else if (rows) {
    input = html`<textarea rows=${rows} value=${v} onInput=${e => onInput(e.target.value)} ...${rest} />`;
  } else {
    input = html`<input type=${type} value=${v} onInput=${e => onInput(e.target.value)} ...${rest} />`;
  }
  return html`<label class="field">
    <span class="lbl">${label}</span>
    <div class="field-row">${input}${mic && html`<${Mic} onText=${appendi} />`}</div>
    ${hint && html`<small class="hint">${hint}</small>`}
  </label>`;
}

// Restituisce una funzione che genera campi collegati a un oggetto di stato.
// L'aggiornamento parte sempre dallo stato più recente, così modifiche rapide su più campi non si perdono.
const binder = (obj, set) => (key, label, opts = {}) =>
  html`<${Field} label=${label} value=${obj[key]} onInput=${val => set(cur => ({ ...cur, [key]: val }))} ...${opts} />`;

function Firma({ value, onChange, altezza = 170 }) {
  const cv = useRef(); const pad = useRef(); const ultimo = useRef(value);
  const cb = useRef(onChange); cb.current = onChange;
  const disegna = (url) => {
    const p = pad.current; const c = cv.current;
    p.clear();
    if (url) p.fromDataURL(url, { ratio: c.width / c.offsetWidth, width: c.offsetWidth, height: altezza });
  };
  useEffect(() => {
    const c = cv.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    c.width = c.offsetWidth * ratio; c.height = altezza * ratio;
    c.getContext('2d').scale(ratio, ratio);
    const p = new SignaturePad(c, { penColor: '#111', minWidth: 0.8, maxWidth: 2.4 });
    p.addEventListener('endStroke', () => { ultimo.current = p.toDataURL(); cb.current(ultimo.current); });
    pad.current = p;
    disegna(value);
    return () => p.off();
  }, []);
  useEffect(() => {
    if (pad.current && value !== ultimo.current) { ultimo.current = value; disegna(value); }
  }, [value]);
  const pulisci = () => { pad.current.clear(); ultimo.current = null; cb.current(null); };
  return html`<div class="firma">
    <canvas ref=${cv} style=${`height:${altezza}px`}></canvas>
    <button type="button" class="btn small ghost" onClick=${pulisci}>Cancella firma</button>
  </div>`;
}

function Foto({ match, readOnly }) {
  const key = JSON.stringify(match);
  const list = useLive(() => {
    const coll = match.ncId != null ? db.foto.where('ncId').equals(match.ncId) : db.foto.where('verbaleId').equals(match.verbaleId);
    return coll.filter(f => Object.entries(match).every(([k, v]) => f[k] === v)).toArray();
  }, [key]);
  const items = useMemo(() => (list || []).map(f => ({ f, url: URL.createObjectURL(f.blob) })), [list]);
  useEffect(() => () => items.forEach(i => URL.revokeObjectURL(i.url)), [items]);
  const [busy, setBusy] = useState(false);
  const aggiungi = async e => {
    setBusy(true);
    try {
      for (const file of e.target.files) {
        const blob = await ridimensiona(file);
        await db.foto.add({ ...match, blob, didascalia: '', creato: Date.now() });
      }
    } finally { setBusy(false); e.target.value = ''; }
  };
  const elimina = async id => { if (await chiedi('Eliminare la foto?')) await db.foto.delete(id); };
  if (readOnly && !items.length) return null;
  return html`<div class="foto">
    ${items.map(({ f, url }) => html`<figure key=${f.id}>
      <img src=${url} alt=${f.didascalia || 'Foto'} />
      ${readOnly ? html`<figcaption>${f.didascalia}</figcaption>` : html`
        <input class="caption" placeholder="Didascalia" value=${f.didascalia}
          onChange=${e => db.foto.update(f.id, { didascalia: e.target.value })} />
        <button type="button" class="del" aria-label="Elimina foto" onClick=${() => elimina(f.id)}><${Icon} d=${I.x} size=${16} /></button>`}
    </figure>`)}
    ${!readOnly && html`<label class=${'add-foto' + (busy ? ' busy' : '')}>
      <${Icon} d=${I.cam} /><span>${busy ? 'Salvo…' : 'Foto'}</span>
      <input type="file" accept="image/*" multiple onChange=${aggiungi} hidden />
    </label>`}
  </div>`;
}

// ---------- Indirizzi: suggerimenti (Photon) e posizione GPS (Nominatim), dati OpenStreetMap ----------

let ultimaPosizione = null; // per proporre prima le vie vicine

async function cercaIndirizzi(testo) {
  const vicino = ultimaPosizione ? `&lat=${ultimaPosizione.lat}&lon=${ultimaPosizione.lon}` : '&lat=42.5&lon=12.5';
  // Il civico si cerca a parte: il servizio trova meglio la via senza numero.
  const civico = (testo.match(/\b(\d{1,4}(?:\/?[a-z])?)\b/i) || [])[1] || '';
  const q = civico ? testo.replace(civico, ' ').replace(/\s+/g, ' ').trim() : testo;
  const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8${vicino}`);
  const d = await r.json();
  return (d.features || []).map(f => f.properties).filter(p => p.countrycode === 'IT' || p.country === 'Italia').map(p => {
    const strada = p.type === 'street' || p.osm_key === 'highway' ? p.name : (p.street || p.name);
    const nr = p.housenumber || civico;
    return {
      via: [strada, nr].filter(Boolean).join(' '),
      comune: [p.postcode, p.city || p.town || p.village || p.name].filter(Boolean).join(' ') + (p.county && p.county !== (p.city || '') ? ` (${p.county})` : ''),
      extra: p.type !== 'street' && p.osm_key !== 'highway' && p.street ? p.name : ''
    };
  }).filter((s, i, a) => s.via && a.findIndex(x => (x.via + x.comune).toLowerCase() === (s.via + s.comune).toLowerCase()) === i)
    .slice(0, 6);
}

async function indirizzoDaPosizione() {
  const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }));
  const { latitude: lat, longitude: lon, accuracy } = pos.coords;
  ultimaPosizione = { lat, lon };
  const coordinate = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  if (!navigator.onLine) return { coordinate, accuracy };
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1&accept-language=it`);
  const a = (await r.json()).address || {};
  const prov = (a['ISO3166-2-lvl6'] || '').replace('IT-', '');
  return {
    coordinate, accuracy,
    via: [a.road || a.pedestrian || a.square || a.hamlet, a.house_number].filter(Boolean).join(' '),
    comune: [a.postcode, a.city || a.town || a.village || a.municipality].filter(Boolean).join(' ') + (prov ? ` (${prov})` : '')
  };
}

function IndirizzoAuto({ via, comune, onChange, etichetta = 'Indirizzo (via, piazza…)', unico, auto }) {
  const online = useOnline();
  const [sugg, setSugg] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  const ultimoTesto = useRef('');
  const attuale = useRef({ via, comune }); attuale.current = { via, comune };
  const disponibile = !PROVA && online;
  // Nuovo cantiere: con l'indirizzo ancora vuoto la posizione si rileva da sola, una volta.
  useEffect(() => {
    if (auto && disponibile && navigator.geolocation && !via && !comune) posizione(true);
  }, []);
  // Con un solo campo (es. sede dell'impresa) via e comune vengono uniti.
  const emetti = (v, c, coord) => unico ? onChange([v, c].filter(Boolean).join(', ')) : onChange(v, c, coord);

  const scrivi = testo => {
    unico ? onChange(testo) : onChange(testo, comune);
    clearTimeout(timer.current);
    if (!disponibile || testo.trim().length < 4) { setSugg([]); return; }
    ultimoTesto.current = testo;
    timer.current = setTimeout(async () => {
      try {
        // Si cerca solo ciò che si sta scrivendo: il comune già inserito potrebbe essere quello vecchio.
        const s = await cercaIndirizzi(testo);
        if (ultimoTesto.current === testo) setSugg(s);
      } catch { setSugg([]); }
    }, 450);
  };
  const scegli = s => { setSugg([]); emetti(s.via, s.comune); };
  async function posizione(automatica = false) {
    if (!navigator.geolocation) { setMsg('Questo dispositivo non fornisce la posizione.'); return; }
    setBusy(true); setMsg(automatica ? 'Rilevo la posizione per proporti l\'indirizzo del cantiere…' : 'Rilevo la posizione…');
    try {
      const p = await indirizzoDaPosizione();
      const cur = attuale.current;
      // Se nel frattempo l'indirizzo è stato scritto a mano, non lo si tocca.
      if (automatica && (cur.via || cur.comune)) {
        if (!unico) onChange(cur.via, cur.comune, p.coordinate);
        setMsg('');
      } else if (p.via || p.comune) {
        emetti(p.via || cur.via, p.comune || cur.comune, p.coordinate);
        setMsg(`Indirizzo proposto dalla posizione (precisione circa ${Math.round(p.accuracy)} m). Controllalo e correggi il civico se serve.`);
      } else {
        if (!unico) onChange(cur.via, cur.comune, p.coordinate);
        setMsg(`Senza connessione non trovo l'indirizzo: ${unico ? '' : 'ho salvato le coordinate GPS. '}Scrivilo a mano.`);
      }
    } catch (e) {
      setMsg(e.code === 1 ? 'Permesso di posizione negato: attivalo nelle impostazioni di Chrome per questo sito, oppure scrivi l\'indirizzo a mano.' : 'Posizione non disponibile: riprova all\'aperto o scrivi l\'indirizzo a mano.');
    } finally { setBusy(false); }
  }

  return html`<div class="indirizzo-auto">
    <div class=${unico ? '' : 'grid2'}>
      <div class="sugg-wrap">
        <${Field} label=${etichetta} value=${via} onInput=${scrivi} autocomplete="off"
          onBlur=${() => setTimeout(() => setSugg([]), 200)} />
        ${sugg.length > 0 && html`<ul class="sugg" role="listbox">
          ${sugg.map(s => html`<li role="option"><button type="button" onMouseDown=${e => e.preventDefault()} onClick=${() => scegli(s)}>
            <b>${s.via}</b>${s.extra && html` <small>${s.extra}</small>`}<small>${s.comune}</small></button></li>`)}
        </ul>`}
      </div>
      ${!unico && html`<${Field} label="Comune" value=${comune} onInput=${x => onChange(via, x)} placeholder="CAP Comune (PR)" />`}
    </div>
    ${!PROVA && html`<div class="row-btns">
      <button type="button" class="btn small" disabled=${busy} onClick=${() => posizione()}>
        ${busy ? 'Rilevo…' : 'Usa la mia posizione'}</button>
      ${!online && html`<small class="hint">Senza connessione niente suggerimenti: scrivi l'indirizzo a mano.</small>`}
    </div>`}
    ${msg && html`<div class="banner info">${msg}</div>`}
  </div>`;
}

// ---------- Catalogo NC tipiche ----------

const AREE = Object.fromEntries(CHECKLIST.map(a => [a.id, a.titolo]));

function termineDa(giorni) {
  const t = new Date(); t.setDate(t.getDate() + (giorni || 0));
  return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const fmtGiorni = g => g === 0 ? 'immediato' : g === 1 ? 'entro 1 giorno' : `entro ${g} giorni`;

function Catalogo({ area: areaIniziale = '', onPick }) {
  const [q, setQ] = useState('');
  const [area, setArea] = useState(areaIniziale);
  const [grav, setGrav] = useState('');
  const parole = q.toLowerCase().split(/\s+/).filter(Boolean);
  const vis = CATALOGO.filter(n =>
    (!area || n.area === area) && (!grav || n.gravita === grav) &&
    parole.every(p => (n.descrizione + ' ' + n.prescrizione + ' ' + n.rif).toLowerCase().includes(p)));
  const gruppi = CHECKLIST.map(a => [a, vis.filter(n => n.area === a.id)]).filter(([, l]) => l.length);
  return html`<div class="catalogo">
    <div class="cat-filtri">
      <input type="search" placeholder="Cerca (es. parapetto, DPI, scavo…)" value=${q} onInput=${e => setQ(e.target.value)} aria-label="Cerca nel catalogo" />
      <div class="grid2">
        <select value=${area} onChange=${e => setArea(e.target.value)} aria-label="Area">
          <option value="">Tutte le aree</option>
          ${CHECKLIST.map(a => html`<option value=${a.id}>${a.titolo}</option>`)}
        </select>
        <select value=${grav} onChange=${e => setGrav(e.target.value)} aria-label="Gravità">
          <option value="">Tutte le gravità</option>
          ${Object.entries(GRAVITA).map(([k, l]) => html`<option value=${k}>${l}</option>`)}
        </select>
      </div>
      <small>${vis.length} non conformità</small>
    </div>
    ${gruppi.length ? gruppi.map(([a, list]) => html`<section class="cat-gruppo">
      <h3>${a.titolo}</h3>
      ${list.map(n => html`<div class=${'card nc cat-item g-' + n.gravita}>
        <div class="nc-head"><span class=${'tag g-' + n.gravita}>${GRAVITA[n.gravita]}</span><small>${n.rif} · ${fmtGiorni(n.giorni)}</small></div>
        <p><b>${n.descrizione}</b></p>
        <p class="muted">${n.prescrizione}</p>
        ${onPick && html`<button class="btn small primary" onClick=${() => onPick(n)}>Usa nel verbale</button>`}
      </div>`)}
    </section>`) : html`<${Empty}>Nessuna voce trovata.<//>`}
  </div>`;
}

function CatalogoModal({ area, onPick, onClose }) {
  useEffect(() => {
    const f = e => e.key === 'Escape' && onClose();
    addEventListener('keydown', f); document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', f); document.body.style.overflow = ''; };
  }, []);
  return html`<div class="modal" role="dialog" aria-modal="true" aria-label="Catalogo non conformità">
    <header class="top">
      <h1>Catalogo NC tipiche</h1>
      <button class="icon-btn" aria-label="Chiudi" onClick=${onClose}><${Icon} d=${I.x} /></button>
    </header>
    <main><${Catalogo} area=${area} onPick=${onPick} /></main>
  </div>`;
}

const SchedeNC = ({ attiva }) => html`<div class="seg tabs">
  <button class=${attiva === 'registro' ? 'on' : ''} onClick=${() => go('/nc')}>Registro</button>
  <button class=${attiva === 'catalogo' ? 'on' : ''} onClick=${() => go('/catalogo')}>Catalogo NC tipiche</button>
</div>`;

function CatalogoPage() {
  return html`<${Header} title="Catalogo non conformità" />
  <main>
    <${SchedeNC} attiva="catalogo" />
    <p class="hint">Non conformità ricorrenti con prescrizione e termine proposti. Durante il sopralluogo, al passo «Non conformità», usa «Dal catalogo» per inserirle nel verbale.</p>
    <${Catalogo} />
  </main>`;
}

const Empty = ({ children }) => html`<p class="empty">${children}</p>`;

function Header({ title, back, logo, children }) {
  return html`<header class="top">
    ${back && html`<button class="icon-btn" aria-label="Indietro" onClick=${() => go(back)}><${Icon} d=${I.back} /></button>`}
    ${logo && html`<span class="logo-mini" dangerouslySetInnerHTML=${{ __html: LOGO_SCURO }}></span>`}
    <h1>${title}</h1>
    <div class="top-actions">${children}</div>
  </header>`;
}

// ---------- Home ----------

function Home() {
  const cantieri = useLive(() => db.cantieri.where('stato').notEqual('chiuso').toArray());
  const nc = useLive(() => db.nonConformita.filter(n => !n.bozza && n.stato !== 'risolta').toArray());
  const bozze = useLive(() => db.verbali.where('stato').equals('bozza').toArray());
  const imp = useLive(() => getImpostazioni());
  const sospesiDrive = useLive(() => driveConfigurato() ? verbaliDaInviare() : [], []);
  const [scelta, setScelta] = useState(false);

  if (!cantieri || !nc || !bozze || !imp) return null;
  const scadute = nc.filter(scaduta);
  const giorni = imp.ultimoBackup ? Math.floor((Date.now() - imp.ultimoBackup) / 86400000) : null;
  const backupDovuto = cantieri.length > 0 && (giorni === null || giorni >= GIORNI_BACKUP);

  const cse = [imp.titolo, imp.nome].filter(Boolean).join(' ');
  return html`<${Header} title="Verbali di cantiere" logo />
  <section class="hero" aria-label="Riepilogo">
    <div class="hero-in">
      ${cse && html`<div class="hero-cse"><small>Coordinatore in esecuzione</small><b>${cse}</b></div>`}
      <div class="stats">
        <a class="stat" href="#/cantieri"><b>${cantieri.length}</b><span>cantieri attivi</span></a>
        <a class=${'stat' + (nc.length ? ' warn' : '')} href="#/nc"><b>${nc.length}</b><span>NC aperte</span></a>
        <a class=${'stat' + (scadute.length ? ' alert' : '')} href="#/nc/scadute"><b>${scadute.length}</b><span>NC scadute</span></a>
      </div>
    </div>
  </section>
  <main>
    ${PROVA && html`<div class="banner warn"><b>Versione di prova.</b> I dati restano solo in questo browser.
      Foto da file, firme, checklist, catalogo NC e anteprima del PDF funzionano. Download, condivisione, email e dettatura
      funzionano solo nell'app installata sul tablet.</div>`}
    ${!cantieri.length && html`<div class="card">
      <h3>Vuoi provare subito?</h3>
      <p class="muted">Carica un cantiere di esempio con due imprese e prova un sopralluogo completo.</p>
      <button class="btn primary" onClick=${caricaEsempio}>Carica esempio</button>
    </div>`}
    ${!imp.nome && html`<div class="banner info">Inizia dalle <a href="#/impostazioni">Impostazioni</a>: inserisci i tuoi dati di CSE, il logo e la firma.</div>`}
    <${SyncBanner} />
    ${imp.driveCollegato && sospesiDrive?.length > 0 && !PROVA && html`<div class="banner warn">
      ${sospesiDrive.length === 1 ? '1 verbale da salvare' : `${sospesiDrive.length} verbali da salvare`} su Google Drive.
      <a href="#/impostazioni">Salva ora</a></div>`}
    ${backupDovuto && !PROVA && html`<div class="banner warn">
      ${giorni === null ? 'Non hai ancora fatto un backup. ' : `Ultimo backup ${giorni} giorni fa. `}I dati sono solo su questo dispositivo. <a href="#/impostazioni">Fai il backup</a></div>`}

    <button class="btn primary big" onClick=${() => setScelta(!scelta)} disabled=${!cantieri.length}>
      <${Icon} d=${I.plus} /> Nuovo sopralluogo</button>
    ${!cantieri.length && html`<p class="hint center">Crea prima un <a href="#/cantieri/nuovo">cantiere</a>.</p>`}
    ${scelta && html`<div class="card list">
      <h3>Scegli il cantiere</h3>
      ${cantieri.map(c => html`<button class="row" onClick=${() => nuovoSopralluogo(c.id)}>
        <span><b>${c.denominazione || 'Cantiere senza nome'}</b><small>${c.indirizzo}</small></span></button>`)}
    </div>`}

    ${bozze.length > 0 && html`<h2>Sopralluoghi in corso</h2>
      <div class="card list">${bozze.map(b => {
        const c = cantieri.find(x => x.id === b.cantiereId);
        return html`<a class="row" href=${`#/sopralluogo/${b.id}/0`}>
          <span><b>${c?.denominazione || 'Cantiere'}</b><small>Bozza del ${fmtData(b.data)}</small></span>
          <span class="tag">Riprendi</span></a>`;
      })}</div>`}

    <h2>Cantieri attivi</h2>
    ${cantieri.length ? html`<div class="card list">${cantieri.map(c => {
      const n = nc.filter(x => x.cantiereId === c.id);
      return html`<a class="row" href=${`#/cantieri/${c.id}`}>
        <span><b>${c.denominazione || 'Cantiere senza nome'}</b><small>${c.indirizzo}</small></span>
        ${n.length > 0 && html`<span class=${'tag' + (n.some(scaduta) ? ' red' : ' amber')}>${n.length} NC</span>`}
      </a>`;
    })}</div>` : html`<${Empty}>Nessun cantiere. <a href="#/cantieri/nuovo">Crea il primo</a>.<//>`}
  </main>`;
}

async function caricaEsempio() {
  const cid = await db.cantieri.add({
    ...CANTIERE_VUOTO, denominazione: 'ESEMPIO – Nuova palazzina via Roma', indirizzo: 'Via Roma 1', comune: 'Treviso',
    committente: 'Immobiliare Esempio Srl', rl: 'Geom. Esempio', dl: 'Arch. Esempio', csp: 'Ing. Esempio', cse: 'Ing. Esempio',
    notificaNumero: '1/2026', notificaData: oggiISO(), titoloAbilitativo: 'Permesso di costruire n. 10/2026'
  });
  const i1 = await db.imprese.add({ ...IMPRESA_VUOTA, ragioneSociale: 'ESEMPIO Edile Srl', tipo: 'affidataria', referente: 'Mario Bianchi', posVerificato: oggiISO() });
  const i2 = await db.imprese.add({ ...IMPRESA_VUOTA, ragioneSociale: 'ESEMPIO Impianti Snc', tipo: 'esecutrice', posVerificato: oggiISO() });
  await db.cantiereImprese.bulkAdd([{ cantiereId: cid, impresaId: i1 }, { cantiereId: cid, impresaId: i2 }]);
}

async function nuovoSopralluogo(cantiereId, passo = 0) {
  const esistente = await db.verbali.where('cantiereId').equals(cantiereId).filter(v => v.stato === 'bozza').first();
  if (esistente) { go(`/sopralluogo/${esistente.id}/${passo}`); return; }
  const imprese = await impreseDelCantiere(cantiereId);
  const id = await db.verbali.add({
    cantiereId, stato: 'bozza', data: oggiISO(), oraInizio: oraHHMM(), oraFine: '', meteo: '', fase: '',
    presenze: imprese.map(i => ({ impresaId: i.id, presente: false, addetti: '' })),
    persone: [], esiti: {}, verificheNC: {}, osservazioni: '', sospensione: '', firmaCSE: null, creato: Date.now()
  });
  go(`/sopralluogo/${id}/${passo}`);
}

// ---------- Cantieri ----------

function CantieriList() {
  const list = useLive(() => db.cantieri.toArray());
  const [mostraChiusi, setMostraChiusi] = useState(false);
  if (!list) return null;
  const vis = list.filter(c => mostraChiusi || c.stato !== 'chiuso');
  return html`<${Header} title="Cantieri">
    <button class="btn small primary" onClick=${() => go('/cantieri/nuovo')}><${Icon} d=${I.plus} size=${18} /> Nuovo</button>
  <//>
  <main>
    <label class="check"><input type="checkbox" checked=${mostraChiusi} onChange=${e => setMostraChiusi(e.target.checked)} /> Mostra cantieri chiusi</label>
    ${vis.length ? html`<div class="card list">${vis.map(c => html`<a class="row" href=${`#/cantieri/${c.id}`}>
      <span><b>${c.denominazione || 'Cantiere senza nome'}</b><small>${[c.indirizzo, c.comune].filter(Boolean).join(', ')}</small></span>
      ${c.stato === 'chiuso' && html`<span class="tag">Chiuso</span>`}
    </a>`)}</div>` : html`<${Empty}>Nessun cantiere.<//>`}
  </main>`;
}

const CANTIERE_VUOTO = {
  denominazione: '', indirizzo: '', comune: '', committente: '', committenteEmail: '', rl: '', rlEmail: '',
  csp: '', cse: '', dl: '', dlEmail: '', notificaNumero: '', notificaData: '', titoloAbilitativo: '',
  dataInizio: '', dataFine: '', importo: '', stato: 'attivo', coordinate: ''
};

function CantiereForm({ id }) {
  const nuovo = id === 'nuovo';
  const [c, setC] = useState(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    (async () => {
      if (nuovo) {
        const imp = await getImpostazioni();
        setC({ ...CANTIERE_VUOTO, cse: [imp.titolo, imp.nome].filter(Boolean).join(' ') });
      } else setC(await db.cantieri.get(Number(id)));
    })();
  }, [id]);
  const imprese = useLive(() => db.imprese.orderBy('ragioneSociale').toArray());
  const links = useLive(() => nuovo ? [] : db.cantiereImprese.where('cantiereId').equals(Number(id)).toArray(), [id]);
  const verbali = useLive(() => nuovo ? [] : db.verbali.where('cantiereId').equals(Number(id)).reverse().sortBy('data'), [id]);
  if (!c || !imprese || !links || !verbali) return null;

  const set = v => { setC(v); setDirty(true); };
  const f = binder(c, set);
  const salva = async () => {
    if (!c.denominazione.trim()) { avviso('Inserisci la denominazione del cantiere.'); return; }
    if (nuovo) { const nid = await db.cantieri.add(c); go(`/cantieri/${nid}`); }
    else { await db.cantieri.put(c); setDirty(false); }
  };
  const eliminaQuesto = async () => {
    const ncTot = await db.nonConformita.where('cantiereId').equals(c.id).count();
    const testo = `Eliminare definitivamente il cantiere «${c.denominazione}» con ${verbali.length} verbali e ${ncTot} non conformità? ` +
      'Le imprese restano in anagrafica. Se ti servono, fai prima il backup o salva i PDF. L\'operazione non si può annullare.';
    if (!await chiedi(testo, 'Elimina')) return;
    await eliminaCantiere(c.id);
    go('/cantieri');
  };
  const toggleImpresa = async (impresaId, on) => {
    const cid = Number(id);
    if (on) await db.cantiereImprese.add({ cantiereId: cid, impresaId });
    else await db.cantiereImprese.where('cantiereId').equals(cid).filter(l => l.impresaId === impresaId).delete();
  };

  return html`<${Header} title=${nuovo ? 'Nuovo cantiere' : c.denominazione || 'Cantiere'} back="/cantieri">
    <button class="btn small primary" disabled=${!dirty && !nuovo} onClick=${salva}>Salva</button>
  <//>
  <main>
    ${!nuovo && html`<button class="btn primary big" onClick=${() => nuovoSopralluogo(c.id)}>
      <${Icon} d=${I.plus} /> Nuovo sopralluogo</button>`}
    <section class="card">
      <h3>Dati del cantiere</h3>
      ${f('denominazione', 'Denominazione / oggetto dei lavori')}
      <${IndirizzoAuto} via=${c.indirizzo} comune=${c.comune} auto=${nuovo}
        onChange=${(via, comune, coordinate) => set(cur => ({ ...cur, indirizzo: via, comune, ...(coordinate ? { coordinate } : {}) }))} />
      ${f('coordinate', 'Coordinate GPS (per i soccorsi)', { placeholder: 'es. 45.66690, 12.24300', hint: 'Si compilano con «Usa la mia posizione»; utili da comunicare al 112.' })}
      <div class="grid2">${f('notificaNumero', 'N. notifica preliminare (art. 99)')}${f('notificaData', 'Data notifica', { type: 'date' })}</div>
      ${f('titoloAbilitativo', 'Titolo abilitativo (PdC, SCIA…)')}
      <div class="grid2">${f('dataInizio', 'Inizio lavori', { type: 'date' })}${f('dataFine', 'Fine presunta', { type: 'date' })}</div>
      <div class="grid2">${f('importo', 'Importo lavori (€)', { inputmode: 'decimal' })}
        ${f('stato', 'Stato', { options: [['attivo', 'Attivo'], ['sospeso', 'Sospeso'], ['chiuso', 'Chiuso']] })}</div>
    </section>
    <section class="card">
      <h3>Soggetti</h3>
      <div class="grid2">${f('committente', 'Committente')}${f('committenteEmail', 'Email/PEC committente', { type: 'email' })}</div>
      <div class="grid2">${f('rl', 'Responsabile dei lavori')}${f('rlEmail', 'Email/PEC RL', { type: 'email' })}</div>
      <div class="grid2">${f('dl', 'Direttore dei lavori')}${f('dlEmail', 'Email/PEC DL', { type: 'email' })}</div>
      <div class="grid2">${f('csp', 'Coordinatore in progettazione (CSP)')}${f('cse', 'Coordinatore in esecuzione (CSE)')}</div>
    </section>
    ${nuovo ? html`<p class="hint center">Salva il cantiere per associare le imprese.</p>` : html`
    <section class="card">
      <h3>Imprese e lavoratori autonomi</h3>
      ${imprese.length ? imprese.map(i => html`<label class="check row-check">
        <input type="checkbox" checked=${links.some(l => l.impresaId === i.id)} onChange=${e => toggleImpresa(i.id, e.target.checked)} />
        <span><b>${i.ragioneSociale}</b> <small>${TIPI_IMPRESA[i.tipo] || ''}</small></span></label>`)
        : html`<${Empty}>Nessuna impresa in anagrafica.<//>`}
      <a class="btn small ghost" href=${`#/imprese/nuova/${c.id}`}>+ Nuova impresa</a>
    </section>
    <section class="card list">
      <h3>Verbali</h3>
      ${verbali.length ? verbali.map(v => html`<a class="row" href=${v.stato === 'bozza' ? `#/sopralluogo/${v.id}/0` : `#/verbale/${v.id}`}>
        <span><b>${v.stato === 'bozza' ? 'Bozza' : `Verbale n. ${v.numero}`}</b><small>${fmtData(v.data)}</small></span>
        ${v.stato === 'bozza' && html`<span class="tag amber">In corso</span>`}</a>`)
        : html`<${Empty}>Nessun verbale.<//>`}
    </section>
    <button class="btn danger ghost" onClick=${eliminaQuesto}>Elimina cantiere</button>`}
  </main>`;
}

// ---------- Imprese ----------

const TIPI_IMPRESA = { affidataria: 'Affidataria', esecutrice: 'Esecutrice', autonomo: 'Lavoratore autonomo' };

function ImpreseList() {
  const list = useLive(() => db.imprese.orderBy('ragioneSociale').toArray());
  if (!list) return null;
  return html`<${Header} title="Imprese">
    <button class="btn small primary" onClick=${() => go('/imprese/nuova')}><${Icon} d=${I.plus} size=${18} /> Nuova</button>
  <//>
  <main>
    ${list.length ? html`<div class="card list">${list.map(i => html`<a class="row" href=${`#/imprese/${i.id}`}>
      <span><b>${i.ragioneSociale}</b><small>${TIPI_IMPRESA[i.tipo] || ''}${i.referente ? ' · ' + i.referente : ''}</small></span>
      ${!i.posVerificato && html`<span class="tag amber">POS da verificare</span>`}
    </a>`)}</div>` : html`<${Empty}>Nessuna impresa.<//>`}
  </main>`;
}

const IMPRESA_VUOTA = {
  ragioneSociale: '', piva: '', sede: '', tipo: 'esecutrice', email: '', pec: '', datoreLavoro: '', rspp: '', preposto: '',
  referente: '', telefono: '', posRicevuto: '', posVerificato: ''
};

// Ponte (Cloudflare Worker) verso il registro europeo VIES: vedi la cartella ponte-piva.
const PONTE_PIVA = 'https://ponte-piva.luca-guidolin78.workers.dev/';

// Controllo della cifra finale della partita IVA italiana.
function pivaValida(p) {
  if (!/^\d{11}$/.test(p)) return false;
  let s = 0;
  for (let k = 0; k < 11; k++) {
    let n = Number(p[k]);
    if (k % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    s += n;
  }
  return s % 10 === 0;
}

function RicercaPiva({ impresa, onDati }) {
  const online = useOnline();
  const [stato, setStato] = useState({ busy: false, msg: '', tipo: '' });
  const [diversi, setDiversi] = useState(null);
  const piva = (impresa.piva || '').replace(/[\s.]/g, '').replace(/^IT/i, '');
  const cercata = useRef(piva); // all'apertura di un'impresa già salvata non si cerca di nuovo
  const ultimo = useRef(impresa); ultimo.current = impresa;

  const cerca = async () => {
    cercata.current = piva;
    setDiversi(null);
    setStato({ busy: true, msg: 'Cerco i dati dell\'impresa nel registro europeo delle partite IVA…', tipo: 'info' });
    try {
      const r = await fetch(`${PONTE_PIVA}?piva=${encodeURIComponent(piva)}`);
      const d = await r.json();
      if (!d.valida) {
        // VIES contiene solo le partite IVA abilitate agli scambi con l'estero: molte imprese edili non ci sono.
        const msg = /non attiva|inesistente/i.test(d.errore || '')
          ? 'Questa partita IVA non è nel registro europeo VIES (capita spesso alle imprese che non lavorano con l\'estero). Inserisci ragione sociale e sede a mano, oppure verificale con «Verifica su Agenzia Entrate».'
          : (d.errore || 'Partita IVA non trovata.') + ' Puoi inserire i dati a mano.';
        setStato({ busy: false, msg, tipo: 'warn' }); return;
      }
      const cur = ultimo.current;
      // Si compilano da soli i campi vuoti; quelli già scritti con un valore diverso si propongono.
      const patch = {}, conflitti = {};
      [['ragioneSociale', d.nome], ['sede', d.indirizzo]].forEach(([k, val]) => {
        if (!val) return;
        const att = (cur[k] || '').trim();
        if (!att) patch[k] = val;
        else if (att.toLowerCase() !== val.toLowerCase()) conflitti[k] = val;
      });
      if (Object.keys(patch).length) onDati(patch);
      setDiversi(Object.keys(conflitti).length ? conflitti : null);
      setStato({ busy: false, msg: `Trovata: ${d.nome}${d.indirizzo ? ' – ' + d.indirizzo : ''}. Controlla i dati e premi Salva.`, tipo: 'ok' });
    } catch {
      setStato({ busy: false, msg: 'Ricerca non riuscita: controlla la connessione e riprova, oppure inserisci i dati a mano.', tipo: 'warn' });
    }
  };

  // Ricerca automatica appena la P.IVA è completa e corretta.
  useEffect(() => {
    if (!PONTE_PIVA || PROVA || !online || piva === cercata.current) return;
    if (pivaValida(piva)) cerca();
    else if (/^\d{11}$/.test(piva)) setStato({ busy: false, msg: 'Partita IVA non corretta: controlla le cifre.', tipo: 'warn' });
    else if (stato.msg) setStato({ busy: false, msg: '', tipo: '' });
  }, [piva, online]);

  const nome = impresa.ragioneSociale.trim();
  const NOMI = { ragioneSociale: 'Ragione sociale', sede: 'Sede' };
  return html`<div class="ricerca-piva">
    ${stato.msg && html`<div class=${'banner ' + (stato.tipo === 'warn' ? 'warn' : 'info')}>${stato.msg}</div>`}
    ${diversi && html`<div class="banner warn">
      <p>Nel registro risultano dati diversi da quelli inseriti:</p>
      <ul>${Object.entries(diversi).map(([k, val]) => html`<li><b>${NOMI[k]}:</b> ${val}</li>`)}</ul>
      <div class="row-btns">
        <button type="button" class="btn small primary" onClick=${() => { onDati(diversi); setDiversi(null); }}>Usa i dati del registro</button>
        <button type="button" class="btn small ghost" onClick=${() => setDiversi(null)}>Tieni i miei</button>
      </div>
    </div>`}
    <div class="row-btns">
      ${PONTE_PIVA && !PROVA && pivaValida(piva) && html`<button type="button" class="btn small ghost" disabled=${!online || stato.busy} onClick=${cerca}>
        ${stato.busy ? 'Cerco…' : 'Ricarica dati da P.IVA'}</button>`}
      ${nome && html`<a class="btn small ghost" target="_blank" rel="noopener"
        href=${'https://www.google.com/search?q=' + encodeURIComponent(nome + ' partita iva sede')}>Cerca P.IVA per nome</a>`}
      <a class="btn small ghost" target="_blank" rel="noopener" href="https://www.inipec.gov.it/cerca-pec/-/pecs/companies">Cerca PEC su INI-PEC</a>
      ${pivaValida(piva) && html`<a class="btn small ghost" target="_blank" rel="noopener"
        href="https://telematici.agenziaentrate.gov.it/VerificaPIVA/Scegli.do?parameter=verificaPiva">Verifica su Agenzia Entrate</a>`}
    </div>
    ${!online && html`<small class="hint">Senza connessione i dati non si caricano da soli: inseriscili a mano.</small>`}
    ${pivaValida(piva) && html`<small class="hint">Email e PEC non sono nel registro europeo: cercale su INI-PEC (inserisci la P.IVA ${piva}) e incollale qui sotto.</small>`}
  </div>`;
}

function ImpresaForm({ id, cantiere }) {
  const nuova = id === 'nuova';
  const [i, setI] = useState(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { nuova ? setI({ ...IMPRESA_VUOTA }) : db.imprese.get(Number(id)).then(setI); }, [id]);
  if (!i) return null;
  const set = v => { setI(v); setDirty(true); };
  const f = binder(i, set);
  const salva = async () => {
    if (!i.ragioneSociale.trim()) { avviso('Inserisci la ragione sociale.'); return; }
    if (nuova) {
      const nid = await db.imprese.add(i);
      // Creata dalla scheda di un cantiere: si associa e si torna lì; altrimenti all'elenco imprese.
      if (cantiere) { await db.cantiereImprese.add({ cantiereId: Number(cantiere), impresaId: nid }); go(`/cantieri/${cantiere}`); }
      else go('/imprese');
    }
    else { await db.imprese.put(i); setDirty(false); }
  };
  const elimina = async () => {
    const usata = await db.nonConformita.where('impresaId').equals(i.id).count();
    if (usata) { avviso('Impresa collegata a non conformità: non può essere eliminata.'); return; }
    if (!await chiedi(`Eliminare ${i.ragioneSociale}?`)) return;
    await db.cantiereImprese.where('impresaId').equals(i.id).delete();
    await db.imprese.delete(i.id);
    go('/imprese');
  };
  return html`<${Header} title=${nuova ? 'Nuova impresa' : i.ragioneSociale} back=${cantiere ? `/cantieri/${cantiere}` : '/imprese'}>
    <button class="btn small primary" disabled=${!dirty && !nuova} onClick=${salva}>Salva</button>
  <//>
  <main>
    <section class="card">
      ${nuova && html`<p class="hint">Scrivi la partita IVA per caricare in automatico ragione sociale e sede, oppure compila i campi a mano. Poi premi <b>Salva</b>.</p>`}
      <div class="grid2">${f('piva', 'Partita IVA', { inputmode: 'numeric', placeholder: '11 cifre' })}
        ${f('tipo', 'Tipo', { options: Object.entries(TIPI_IMPRESA) })}</div>
      <${RicercaPiva} impresa=${i} onDati=${d => { setI(cur => ({ ...cur, ...d })); setDirty(true); }} />
      ${f('ragioneSociale', 'Ragione sociale / nominativo')}
      <${IndirizzoAuto} via=${i.sede} etichetta="Sede legale" unico
        onChange=${via => set({ ...i, sede: via })} />
      <div class="grid2">${f('email', 'Email', { type: 'email' })}${f('pec', 'PEC', { type: 'email' })}</div>
    </section>
    <section class="card">
      <h3>Figure</h3>
      <div class="grid2">${f('datoreLavoro', 'Datore di lavoro')}${f('rspp', 'RSPP')}</div>
      <div class="grid2">${f('preposto', 'Preposto')}${f('referente', 'Referente in cantiere')}</div>
      ${f('telefono', 'Telefono', { type: 'tel' })}
    </section>
    <section class="card">
      <h3>POS (art. 92 c.1 lett. b)</h3>
      <div class="grid2">${f('posRicevuto', 'Ricevuto il', { type: 'date' })}${f('posVerificato', 'Verificato idoneo il', { type: 'date' })}</div>
    </section>
    ${!nuova && html`<button class="btn danger ghost" onClick=${elimina}>Elimina impresa</button>`}
  </main>`;
}

// ---------- Sopralluogo (procedura guidata) ----------

const PASSI = ['Intestazione', 'Presenze', 'NC precedenti', 'Checklist', 'Non conformità', 'Osservazioni', 'Firme'];

function useVerbale(id) {
  const [v, setV] = useState(null);
  const latest = useRef(null); const timer = useRef(null);
  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (latest.current) await db.verbali.put(latest.current);
  }, []);
  useEffect(() => {
    db.verbali.get(id).then(x => { latest.current = x; setV(x); });
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); if (timer.current) flush(); };
  }, [id]);
  const upd = useCallback(patch => {
    const nv = typeof patch === 'function' ? patch(latest.current) : { ...latest.current, ...patch };
    latest.current = nv; setV(nv);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; db.verbali.put(latest.current); }, 400);
  }, []);
  return [v, upd, flush];
}

function Sopralluogo({ id, step }) {
  const vid = Number(id); const s = Number(step) || 0;
  const [v, upd, flush] = useVerbale(vid);
  const cantiere = useLive(() => v ? db.cantieri.get(v.cantiereId) : undefined, [v?.cantiereId]);
  const imprese = useLive(() => db.imprese.toArray());
  if (!v || !cantiere || !imprese) return null;
  if (v.stato === 'chiuso') { go(`/verbale/${vid}`); return null; }

  const vai = async n => { await flush(); go(`/sopralluogo/${vid}/${n}`); };
  const esci = async () => { await flush(); go('/'); };
  const eliminaBozza = async () => {
    const testo = v.numero
      ? `Eliminare definitivamente il verbale n. ${v.numero} con le sue foto e non conformità? L'operazione non si può annullare.`
      : 'Eliminare questa bozza di sopralluogo con foto e NC inserite?';
    if (!await chiedi(testo, 'Elimina')) return;
    await eliminaVerbaleBozza(vid); go(`/cantieri/${v.cantiereId}`);
  };
  const ctx = { v, upd, flush, cantiere, imprese, vid };
  const Passo = [PassoIntestazione, PassoPresenze, PassoVerificaNC, PassoChecklist, PassoNC, PassoOsservazioni, PassoFirme][s];

  return html`<div class="wizard">
    <header class="top">
      <button class="icon-btn" aria-label="Esci" onClick=${esci}><${Icon} d=${I.back} /></button>
      <h1><small>${v.numero ? `Modifica verbale n. ${v.numero}` : 'Sopralluogo'} · ${cantiere.denominazione}</small>${PASSI[s]}</h1>
      <div class="top-actions"><button class="btn small ghost danger" onClick=${eliminaBozza}>${v.numero ? 'Elimina verbale' : 'Elimina bozza'}</button></div>
    </header>
    <nav class="steps" aria-label="Passi">
      ${PASSI.map((p, i) => html`<button class=${i === s ? 'on' : i < s ? 'done' : ''} onClick=${() => vai(i)} aria-label=${p}>${i + 1}</button>`)}
    </nav>
    <main><${Passo} ...${ctx} /></main>
    <footer class="wizard-nav">
      <button class="btn ghost" disabled=${s === 0} onClick=${() => vai(s - 1)}>Indietro</button>
      <span class="hint">Salvataggio automatico</span>
      ${s < PASSI.length - 1 && html`<button class="btn primary" onClick=${() => vai(s + 1)}>Avanti</button>`}
    </footer>
  </div>`;
}

function PassoIntestazione({ v, upd, cantiere }) {
  const f = binder(v, upd);
  return html`<section class="card">
    <h3>${cantiere.denominazione}</h3>
    <p class="muted">${[cantiere.indirizzo, cantiere.comune].filter(Boolean).join(', ')}<br />
      Committente: ${cantiere.committente || '—'} · RL: ${cantiere.rl || '—'} · DL: ${cantiere.dl || '—'}</p>
  </section>
  <section class="card">
    <div class="grid3">${f('data', 'Data', { type: 'date' })}${f('oraInizio', 'Ora inizio', { type: 'time' })}${f('oraFine', 'Ora fine', { type: 'time' })}</div>
    ${f('meteo', 'Condizioni meteo', { mic: true, list: 'meteo-list' })}
    <datalist id="meteo-list"><option>Sereno</option><option>Nuvoloso</option><option>Pioggia</option><option>Vento forte</option><option>Neve</option></datalist>
    ${f('fase', 'Fasi lavorative in corso', { rows: 3, mic: true })}
  </section>`;
}

function PassoPresenze({ v, upd, imprese, cantiere }) {
  const nomi = Object.fromEntries(imprese.map(i => [i.id, i]));
  const setPres = (idx, patch) => upd(cur => ({ ...cur, presenze: cur.presenze.map((p, i) => i === idx ? { ...p, ...patch } : p) }));
  const aggiornaElenco = async () => {
    const assoc = await impreseDelCantiere(cantiere.id);
    upd(cur => {
      const ids = new Set(cur.presenze.map(p => p.impresaId));
      return { ...cur, presenze: [...cur.presenze, ...assoc.filter(i => !ids.has(i.id)).map(i => ({ impresaId: i.id, presente: false, addetti: '' }))] };
    });
  };
  const setPers = (idx, patch) => upd(cur => ({ ...cur, persone: cur.persone.map((p, i) => i === idx ? { ...p, ...patch } : p) }));
  const addPers = () => upd(cur => ({ ...cur, persone: [...cur.persone, { nome: '', ruolo: '', impresaId: '', firma: null }] }));
  const delPers = idx => upd(cur => ({ ...cur, persone: cur.persone.filter((_, i) => i !== idx) }));
  const opzImprese = [['', '—'], ...v.presenze.map(p => [String(p.impresaId), nomi[p.impresaId]?.ragioneSociale || '?'])];

  return html`<section class="card">
    <h3>Imprese in cantiere</h3>
    ${v.presenze.length ? v.presenze.map((p, idx) => html`<div class="pres">
      <label class="check"><input type="checkbox" checked=${p.presente} onChange=${e => setPres(idx, { presente: e.target.checked })} />
        <span><b>${nomi[p.impresaId]?.ragioneSociale || 'Impresa rimossa'}</b> <small>${TIPI_IMPRESA[nomi[p.impresaId]?.tipo] || ''}</small></span></label>
      ${p.presente && html`<input class="num" type="number" min="0" inputmode="numeric" placeholder="Addetti" aria-label="Numero addetti"
        value=${p.addetti} onInput=${e => setPres(idx, { addetti: e.target.value })} />`}
    </div>`) : html`<${Empty}>Nessuna impresa associata al cantiere. <a href=${`#/cantieri/${cantiere.id}`}>Associale</a>.<//>`}
    <button class="btn small ghost" onClick=${aggiornaElenco}>Aggiorna elenco dal cantiere</button>
  </section>
  <section class="card">
    <h3>Persone presenti alla visita</h3>
    <p class="hint">Chi accompagna il CSE e firmerà il verbale (es. capocantiere, preposti, DL).</p>
    ${v.persone.map((p, idx) => html`<div class="persona">
      <div class="grid3">
        <${Field} label="Nome e cognome" value=${p.nome} onInput=${x => setPers(idx, { nome: x })} />
        <${Field} label="Ruolo" value=${p.ruolo} onInput=${x => setPers(idx, { ruolo: x })} list="ruoli-list" />
        <${Field} label="Impresa" value=${String(p.impresaId ?? '')} options=${opzImprese} onInput=${x => setPers(idx, { impresaId: x ? Number(x) : '' })} />
      </div>
      <button class="icon-btn" aria-label="Rimuovi persona" onClick=${() => delPers(idx)}><${Icon} d=${I.x} /></button>
    </div>`)}
    <datalist id="ruoli-list"><option>Capocantiere</option><option>Preposto</option><option>Direttore tecnico</option><option>Direttore dei lavori</option><option>Datore di lavoro</option><option>RLS</option><option>Lavoratore autonomo</option></datalist>
    <button class="btn small" onClick=${addPers}><${Icon} d=${I.plus} size=${18} /> Aggiungi persona</button>
  </section>`;
}

function PassoVerificaNC({ v, upd, cantiere, imprese, vid }) {
  const list = useLive(() => ncApertePrecedenti(cantiere.id, vid), [cantiere.id, vid]);
  const verbali = useLive(() => db.verbali.where('cantiereId').equals(cantiere.id).toArray(), [cantiere.id]);
  if (!list || !verbali) return null;
  const nomi = Object.fromEntries(imprese.map(i => [i.id, i.ragioneSociale]));
  const setVer = (ncId, patch) => upd(cur => ({ ...cur, verificheNC: { ...cur.verificheNC, [ncId]: { ...(cur.verificheNC[ncId] || {}), ...patch } } }));
  if (!list.length) return html`<${Empty}>Nessuna non conformità aperta dai sopralluoghi precedenti.<//>`;
  return html`<p class="hint">Verifica se le prescrizioni dei sopralluoghi precedenti sono state attuate.</p>
  ${list.map(nc => {
    const ver = v.verificheNC[nc.id] || {};
    const orig = verbali.find(x => x.id === nc.verbaleId);
    return html`<section class=${'card nc ' + (scaduta(nc) ? 'late' : '')}>
      <div class="nc-head"><span class=${'tag g-' + nc.gravita}>${GRAVITA[nc.gravita]}</span>
        <small>Verbale n. ${orig?.numero ?? '?'} del ${fmtData(orig?.data)} · termine ${fmtData(nc.termine) || '—'}${scaduta(nc) ? ' (scaduto)' : ''}</small></div>
      <p><b>${nc.descrizione}</b></p>
      <p class="muted">${nomi[nc.impresaId] || 'Impresa non indicata'} — ${nc.prescrizione}</p>
      <${Foto} match=${{ ncId: nc.id, verbaleId: nc.verbaleId, tipo: 'nc' }} readOnly />
      <div class="seg">
        ${[['risolta', 'Risolta'], ['persistente', 'Ancora non conforme'], ['', 'Non verificata']].map(([k, l]) =>
          html`<button class=${(ver.esito || '') === k ? 'on ' + k : ''} onClick=${() => setVer(nc.id, { esito: k })}>${l}</button>`)}
      </div>
      ${ver.esito && html`<${Field} label="Note di verifica" rows=${2} mic value=${ver.nota} onInput=${x => setVer(nc.id, { nota: x })} />
        <${Foto} match=${{ ncId: nc.id, verbaleId: vid, tipo: 'verifica' }} />`}
    </section>`;
  })}`;
}

// Le non conformità di una voce della checklist: una per ogni impresa scelta (una sola, senza impresa, se non se ne sceglie nessuna).
async function allineaNC({ vid, cantiereId, voceId, imprese }) {
  const esistenti = await db.nonConformita.where('verbaleId').equals(vid).filter(n => n.voceId === voceId).toArray();
  const volute = imprese.length ? imprese : [null];
  const modello = esistenti[0] || {
    descrizione: `Non conforme: ${VOCI[voceId].testo.charAt(0).toLowerCase()}${VOCI[voceId].testo.slice(1)}`,
    gravita: 'grave', prescrizione: '', termine: ''
  };
  const restanti = [...esistenti];
  const daAggiungere = [];
  for (const imp of volute) {
    const i = restanti.findIndex(n => (n.impresaId ?? null) === imp);
    if (i >= 0) restanti.splice(i, 1); else daAggiungere.push(imp);
  }
  // Una NC rimasta senza corrispondenza si riassegna (si conservano prescrizione e foto), le altre si tolgono.
  for (const imp of daAggiungere) {
    const riusa = restanti.shift();
    if (riusa) await db.nonConformita.update(riusa.id, { impresaId: imp });
    else await db.nonConformita.add({
      cantiereId, verbaleId: vid, voceId, descrizione: modello.descrizione, gravita: modello.gravita,
      impresaId: imp, prescrizione: modello.prescrizione, termine: modello.termine, stato: 'aperta', bozza: true, creato: Date.now()
    });
  }
  const ids = restanti.map(n => n.id);
  if (ids.length) { await db.foto.where('ncId').anyOf(ids).delete(); await db.nonConformita.bulkDelete(ids); }
}

function PassoChecklist({ v, upd, cantiere, vid, imprese }) {
  const [aperta, setAperta] = useState(CHECKLIST[0].id);
  const nomi = Object.fromEntries(imprese.map(i => [i.id, i.ragioneSociale]));
  // Imprese proponibili: prima le presenti, poi le altre associate al cantiere.
  const elencoImprese = [...v.presenze].sort((a, b) => b.presente - a.presente).filter(p => nomi[p.impresaId]);
  const setVoce = (voceId, patch) => upd(cur => ({ ...cur, esiti: { ...cur.esiti, [voceId]: { ...(cur.esiti[voceId] || {}), ...patch } } }));
  const setEsito = async (voceId, esito) => {
    const prev = v.esiti[voceId]?.esito;
    const nuovo = prev === esito ? null : esito;
    if (prev === 'nc' && nuovo !== 'nc') {
      const ncs = await db.nonConformita.where('verbaleId').equals(vid).filter(n => n.voceId === voceId).toArray();
      if (ncs.some(n => n.prescrizione) && !await chiedi('Rimuovere le non conformità già compilate per questa voce?')) return;
      const ids = ncs.map(n => n.id);
      await db.foto.where('ncId').anyOf(ids).delete();
      await db.nonConformita.bulkDelete(ids);
    }
    if (nuovo === 'nc' && prev !== 'nc') {
      await allineaNC({ vid, cantiereId: cantiere.id, voceId, imprese: v.esiti[voceId]?.imprese || [] });
    }
    setVoce(voceId, { esito: nuovo });
  };
  const toggleImpresa = async (voceId, impresaId) => {
    const attuali = v.esiti[voceId]?.imprese || [];
    const imprese2 = attuali.includes(impresaId) ? attuali.filter(x => x !== impresaId) : [...attuali, impresaId];
    setVoce(voceId, { imprese: imprese2 });
    if (v.esiti[voceId]?.esito === 'nc') await allineaNC({ vid, cantiereId: cantiere.id, voceId, imprese: imprese2 });
  };
  const tuttiConformi = (area) => upd(cur => {
    const esiti = { ...cur.esiti };
    area.voci.forEach(x => { if (!esiti[x.id]?.esito) esiti[x.id] = { ...(esiti[x.id] || {}), esito: 'c' }; });
    return { ...cur, esiti };
  });
  const naArea = (area) => upd(cur => {
    const esiti = { ...cur.esiti };
    area.voci.forEach(x => { if (!esiti[x.id]?.esito) esiti[x.id] = { ...(esiti[x.id] || {}), esito: 'na' }; });
    return { ...cur, esiti };
  });

  return html`<p class="hint">C = conforme · NC = non conforme · N.A. = non applicabile. Fotografa le situazioni, evitando di inquadrare i volti delle persone.</p>
  ${CHECKLIST.map(area => {
    const fatte = area.voci.filter(x => v.esiti[x.id]?.esito).length;
    const nNC = area.voci.filter(x => v.esiti[x.id]?.esito === 'nc').length;
    const open = aperta === area.id;
    return html`<section class="card area">
      <button class="area-head" aria-expanded=${open} onClick=${() => setAperta(open ? null : area.id)}>
        <span><b>${area.titolo}</b><small>${area.rif}</small></span>
        <span class="area-count">${nNC > 0 && html`<span class="tag red">${nNC} NC</span>`} ${fatte}/${area.voci.length}</span>
      </button>
      ${open && html`<div class="voci">
        <div class="area-bulk">
          <button class="btn small ghost" onClick=${() => tuttiConformi(area)}>Restanti conformi</button>
          <button class="btn small ghost" onClick=${() => naArea(area)}>Restanti N.A.</button>
        </div>
        ${area.voci.map(voce => {
          const e = v.esiti[voce.id] || {};
          return html`<div class=${'voce ' + (e.esito || '')}>
            <div class="voce-top">
              <p>${voce.testo} <small>(${voce.rif})</small></p>
              <div class="seg esito">
                ${[['c', 'C'], ['nc', 'NC'], ['na', 'N.A.']].map(([k, l]) =>
                  html`<button class=${e.esito === k ? 'on ' + k : ''} onClick=${() => setEsito(voce.id, k)} aria-pressed=${e.esito === k}>${l}</button>`)}
              </div>
            </div>
            ${(e.esito === 'c' || e.esito === 'nc') && html`<div class="imprese-voce" role="group" aria-label="Imprese interessate">
              <span class="hint">${e.esito === 'nc' ? 'Impresa responsabile:' : 'Impresa:'}</span>
              ${elencoImprese.length ? elencoImprese.map(p => {
                const on = (e.imprese || []).includes(p.impresaId);
                return html`<button type="button" class=${'chip' + (on ? ' on ' + e.esito : '')} aria-pressed=${on}
                  onClick=${() => toggleImpresa(voce.id, p.impresaId)}>${nomi[p.impresaId]}</button>`;
              }) : html`<span class="hint">nessuna impresa associata al cantiere (passo 2)</span>`}
            </div>`}
            ${e.esito === 'nc' || e.nota || e.dettagli ? html`
              <${Field} label="Nota" rows=${2} mic value=${e.nota} onInput=${x => setVoce(voce.id, { nota: x })} />
              <${Foto} match=${{ verbaleId: vid, voceId: voce.id, tipo: 'voce' }} />`
            : e.esito && html`<button class="btn small ghost" onClick=${() => setVoce(voce.id, { dettagli: true })}>+ Nota / foto</button>`}
            ${e.esito === 'nc' && html`<p class="hint">${(e.imprese || []).length > 1 ? `Verranno create ${e.imprese.length} non conformità, una per impresa. ` : ''}Completa prescrizione e termine al passo «Non conformità».</p>`}
          </div>`;
        })}
      </div>`}
    </section>`;
  })}`;
}

function NcEditor({ nc, imprese, presenze, vid }) {
  const [n, setN] = useState(nc);
  const [catalogo, setCatalogo] = useState(false);
  const set = patch => { const nn = { ...n, ...patch }; setN(nn); db.nonConformita.update(nc.id, patch); };
  const daCatalogo = async c => {
    if ((n.prescrizione || '').trim() && !await chiedi('Sostituire descrizione, prescrizione e termine già inseriti?')) return;
    set({ descrizione: c.descrizione, prescrizione: c.prescrizione, gravita: c.gravita, termine: termineDa(c.giorni) });
    setCatalogo(false);
  };
  const areaVoce = n.voceId ? CHECKLIST.find(a => a.voci.some(v => v.id === n.voceId))?.id : '';
  const elimina = async () => {
    if (!await chiedi('Eliminare questa non conformità?')) return;
    await db.foto.where('ncId').equals(nc.id).delete();
    await db.nonConformita.delete(nc.id);
  };
  const presentiIds = new Set(presenze.filter(p => p.presente).map(p => p.impresaId));
  const ordinate = [...imprese].sort((a, b) => (presentiIds.has(b.id) - presentiIds.has(a.id)) || a.ragioneSociale.localeCompare(b.ragioneSociale));
  return html`<section class=${'card nc g-' + n.gravita}>
    <div class="nc-head">
      <span class="nc-titolo"><b>${GRAVITA[n.gravita]}</b><small>${n.voceId ? VOCI[n.voceId]?.area : 'NC aggiuntiva'}</small></span>
      <span class="row-btns">
        <button class="btn small" onClick=${() => setCatalogo(true)}>Dal catalogo</button>
        ${!n.voceId && html`<button class="btn small ghost danger" onClick=${elimina}>Elimina</button>`}
      </span>
    </div>
    ${catalogo && html`<${CatalogoModal} area=${areaVoce} onPick=${daCatalogo} onClose=${() => setCatalogo(false)} />`}
    <${Field} label="Descrizione della non conformità" rows=${2} mic value=${n.descrizione} onInput=${x => set({ descrizione: x })} />
    <div class="grid2">
      <${Field} label="Gravità" value=${n.gravita} options=${Object.entries(GRAVITA)} onInput=${x => set({ gravita: x })} />
      <${Field} label="Impresa responsabile" value=${String(n.impresaId ?? '')}
        options=${[['', '— seleziona —'], ...ordinate.map(i => [String(i.id), i.ragioneSociale])]}
        onInput=${x => set({ impresaId: x ? Number(x) : null })} />
    </div>
    ${n.gravita === 'pgi' && html`<div class="banner danger">Pericolo grave e imminente: valuta la sospensione delle singole lavorazioni fino alla verifica degli adeguamenti (art. 92 c.1 lett. f). Annotala al passo «Osservazioni».</div>`}
    <${Field} label="Prescrizione / azione richiesta" rows=${3} mic value=${n.prescrizione} onInput=${x => set({ prescrizione: x })} />
    <div class="grid2">
      <${Field} label="Termine di adeguamento" type="date" value=${n.termine} onInput=${x => set({ termine: x })} />
      <div class="quick-dates">
        ${[['Subito', 0], ['+1 g', 1], ['+3 gg', 3], ['+7 gg', 7]].map(([l, d]) => html`<button class="btn small ghost" onClick=${() => {
          const t = new Date(); t.setDate(t.getDate() + d);
          set({ termine: new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10) });
        }}>${l}</button>`)}
      </div>
    </div>
    <${Foto} match=${{ ncId: nc.id, verbaleId: vid, tipo: 'nc' }} />
  </section>`;
}

function PassoNC({ v, upd, cantiere, imprese, vid }) {
  const list = useLive(() => db.nonConformita.where('verbaleId').equals(vid).toArray(), [vid]);
  const [catalogo, setCatalogo] = useState(false);
  if (!list) return null;
  const aggiungi = (dati = {}) => db.nonConformita.add({
    cantiereId: cantiere.id, verbaleId: vid, voceId: null, descrizione: '', gravita: 'grave',
    impresaId: null, prescrizione: '', termine: '', stato: 'aperta', bozza: true, creato: Date.now(), ...dati
  });
  const daCatalogo = async c => {
    // La NC dal catalogo segna anche la relativa voce di checklist come non conforme.
    const voceLibera = c.voce && !list.some(n => n.voceId === c.voce);
    await aggiungi({
      voceId: voceLibera ? c.voce : null, descrizione: c.descrizione, prescrizione: c.prescrizione,
      gravita: c.gravita, termine: termineDa(c.giorni)
    });
    if (c.voce) upd(cur => ({ ...cur, esiti: { ...cur.esiti, [c.voce]: { ...(cur.esiti[c.voce] || {}), esito: 'nc' } } }));
    setCatalogo(false);
  };
  return html`${list.length ? html`<p class="hint">Le NC segnate nella checklist compaiono qui. Indica impresa, prescrizione e termine, oppure prendile dal catalogo.</p>`
      : html`<${Empty}>Nessuna non conformità rilevata in questo sopralluogo.<//>`}
    ${list.map(nc => html`<${NcEditor} key=${nc.id} nc=${nc} imprese=${imprese} presenze=${v.presenze} vid=${vid} />`)}
    <div class="row-btns">
      <button class="btn primary" onClick=${() => setCatalogo(true)}>Aggiungi dal catalogo</button>
      <button class="btn" onClick=${() => aggiungi()}><${Icon} d=${I.plus} size=${18} /> NC libera</button>
    </div>
    ${catalogo && html`<${CatalogoModal} onPick=${daCatalogo} onClose=${() => setCatalogo(false)} />`}`;
}

function PassoOsservazioni({ v, upd, vid }) {
  const pgi = useLive(() => db.nonConformita.where('verbaleId').equals(vid).filter(n => n.gravita === 'pgi').count(), [vid]);
  const f = binder(v, upd);
  return html`<section class="card">
    ${f('osservazioni', 'Osservazioni generali e disposizioni del CSE', { rows: 6, mic: true })}
  </section>
  ${pgi > 0 && html`<section class="card">
    <div class="banner danger">Sono presenti ${pgi} NC con pericolo grave e imminente.</div>
    ${f('sospensione', 'Sospensione lavorazioni (art. 92 c.1 lett. f): lavorazioni sospese, motivazione, condizioni per la ripresa', { rows: 4, mic: true })}
  </section>`}`;
}

function PassoFirme({ v, upd, flush, vid, imprese }) {
  const imp = useLive(() => getImpostazioni());
  const ncs = useLive(() => db.nonConformita.where('verbaleId').equals(vid).toArray(), [vid]);
  const [errori, setErrori] = useState([]);
  const [bozzaPdf, setBozzaPdf] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!imp || !ncs) return null;
  const anteprima = async () => {
    setBusy(true);
    try {
      await flush();
      const { generaPdf } = await import('./pdf.js');
      setBozzaPdf(await generaPdf(vid));
    } catch (e) { console.error(e); avviso('Errore nella generazione del PDF: ' + e.message); }
    finally { setBusy(false); }
  };
  const nomi = Object.fromEntries(imprese.map(i => [i.id, i.ragioneSociale]));
  const setPers = (idx, patch) => upd(cur => ({ ...cur, persone: cur.persone.map((p, i) => i === idx ? { ...p, ...patch } : p) }));

  const chiudi = async () => {
    const e = [];
    if (!v.data) e.push('Manca la data del sopralluogo.');
    if (!v.presenze.some(p => p.presente)) e.push('Nessuna impresa indicata come presente (passo 2).');
    ncs.forEach((n, i) => {
      if (!n.descrizione) e.push(`NC ${i + 1}: manca la descrizione.`);
      if (!n.prescrizione) e.push(`NC ${i + 1}: manca la prescrizione.`);
      if (!n.termine) e.push(`NC ${i + 1}: manca il termine di adeguamento.`);
    });
    if (!v.firmaCSE) e.push('Manca la firma del CSE.');
    setErrori(e);
    if (e.length) return;
    if (!await chiedi('Chiudere il verbale? Dopo la chiusura si potrà modificare solo creando una revisione (Rev. 1, Rev. 2…).')) return;
    if (!v.oraFine) upd({ oraFine: oraHHMM() });
    await flush();
    await chiudiVerbale(vid);
    go(`/verbale/${vid}`);
  };

  return html`<section class="card">
    <h3>Firma del CSE</h3>
    <${Firma} value=${v.firmaCSE} onChange=${x => upd({ firmaCSE: x })} />
    ${imp.firma && html`<button class="btn small" onClick=${() => upd({ firmaCSE: imp.firma })}>Usa firma salvata</button>`}
  </section>
  ${v.persone.map((p, idx) => html`<section class="card">
    <h3>${p.nome || 'Persona ' + (idx + 1)} <small class="muted">${[p.ruolo, nomi[p.impresaId]].filter(Boolean).join(' · ')}</small></h3>
    ${p.rifiuto ? html`<p class="muted">Non firma.</p>` : html`<${Firma} value=${p.firma} onChange=${x => setPers(idx, { firma: x })} />`}
    <label class="check"><input type="checkbox" checked=${!!p.rifiuto} onChange=${e => setPers(idx, { rifiuto: e.target.checked, firma: null })} /> Non firma / si rifiuta di firmare</label>
  </section>`)}
  ${!v.persone.length && html`<p class="hint">Nessuna persona presente indicata al passo 2: firmerà solo il CSE.</p>`}
  ${errori.length > 0 && html`<div class="banner danger"><b>Prima di chiudere:</b><ul>${errori.map(x => html`<li>${x}</li>`)}</ul></div>`}
  <button class="btn big" disabled=${busy} onClick=${anteprima}>${busy ? 'Genero l\'anteprima…' : 'Anteprima del verbale'}</button>
  <button class="btn primary big" onClick=${chiudi}>Chiudi verbale</button>
  ${bozzaPdf && html`<${AnteprimaPdf} file=${bozzaPdf} onClose=${() => setBozzaPdf(null)} azioni=${html`
    <button class="btn ghost" onClick=${() => setBozzaPdf(null)}>Torna a modificare</button>
    <button class="btn primary" onClick=${() => { setBozzaPdf(null); chiudi(); }}>Chiudi verbale</button>`} />`}`;
}

// ---------- Verbale chiuso ----------

function VerbaleView({ id }) {
  const vid = Number(id);
  const v = useLive(() => db.verbali.get(vid), [vid]);
  const c = useLive(() => v ? db.cantieri.get(v.cantiereId) : undefined, [v?.cantiereId]);
  const ncs = useLive(() => db.nonConformita.where('verbaleId').equals(vid).toArray(), [vid]);
  const imprese = useLive(() => db.imprese.toArray());
  const [pdf, setPdf] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [vedi, setVedi] = useState(null);
  if (!v || !c || !ncs || !imprese) return null;
  if (v.stato !== 'chiuso') { go(`/sopralluogo/${vid}/0`); return null; }

  const genera = async () => {
    if (pdf) return pdf;
    setBusy(true);
    try {
      const { generaPdf } = await import('./pdf.js');
      const file = await generaPdf(vid);
      setPdf(file);
      await db.verbali.update(vid, { pdfGenerato: Date.now() });
      return file;
    } catch (e) { console.error(e); avviso('Errore nella generazione del PDF: ' + e.message); }
    finally { setBusy(false); }
  };
  const condividi = async () => {
    const f = await genera(); if (!f) return;
    const r = await condividiOScarica(f, oggettoEmail(v, c));
    if (r === 'scaricato') setMsg('PDF salvato nei Download.');
  };
  const scaricaWord = async () => {
    setBusy(true);
    try {
      const { generaWord } = await import('./word.js');
      const f = await generaWord(vid);
      const r = await condividiOScarica(f, oggettoEmail(v, c));
      if (r === 'scaricato') setMsg('Word salvato nei Download.');
    } catch (e) { console.error(e); avviso('Errore nella creazione del file Word: ' + e.message); }
    finally { setBusy(false); }
  };
  const scaricaPdf = async () => { const f = await genera(); if (f) { scarica(f); setMsg('PDF salvato nei Download.'); } };
  // Email con il PDF già allegato: si passa dalla condivisione di Android (Gmail, app PEC…), che allega il file
  // e compila oggetto e testo. I destinatari non passano da lì: li copiamo negli appunti da incollare nel campo «A».
  const email = async () => {
    const { to, cc, oggetto, body } = datiEmail(v, c, imprese);
    const destinatari = [...to, ...cc].join(', ');
    let copiati = false;
    if (destinatari) { try { await navigator.clipboard.writeText(destinatari); copiati = true; } catch { /* appunti non disponibili */ } }
    const f = await genera(); if (!f) return;
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      try {
        await navigator.share({ files: [f], title: oggetto, text: body });
        setMsg(destinatari
          ? (copiati ? `Destinatari copiati: incollali nel campo «A» dell'email (${destinatari}).` : `Destinatari da inserire: ${destinatari}.`)
          : 'Nessun indirizzo email in anagrafica: inserisci i destinatari nell\'email.');
      } catch (e) { if (e.name !== 'AbortError') setMsg('Condivisione non riuscita: usa «Scarica PDF» e allegalo a mano.'); }
      return;
    }
    // Dispositivo senza condivisione di file (es. PC): si scarica il PDF e si apre l'email precompilata.
    scarica(f);
    location.href = mailtoVerbale(v, c, imprese);
    setMsg('PDF salvato nei Download: allegalo all\'email che si è aperta.');
  };
  const anteprima = async () => { const f = await genera(); if (f) setVedi(f); };
  const modifica = async () => {
    if (!await puoRiaprire(vid)) {
      avviso('Questo verbale non si può modificare perché per il cantiere esiste già un sopralluogo successivo (anche in bozza).');
      return;
    }
    if (!await chiedi(`Modificare il verbale n. ${v.numero}? Torna in bozza e, alla nuova chiusura, diventa la revisione ${(v.revisione || 0) + 1}. Se cambi il contenuto, fai firmare di nuovo i presenti e invia di nuovo il PDF.`, 'Modifica')) return;
    await riapriVerbale(vid);
    go(`/sopralluogo/${vid}/0`);
  };
  const elimina = async () => {
    const successivi = !await puoRiaprire(vid);
    const testo = `Eliminare definitivamente il verbale n. ${v.numero} insieme alle sue ${ncs.length} non conformità e alle foto? ` +
      'Le NC dei verbali precedenti verificate in questo sopralluogo tornano aperte. ' +
      (successivi ? 'Attenzione: esistono sopralluoghi successivi; le NC di questo verbale spariranno anche dalle loro verifiche. ' : '') +
      'L\'operazione non si può annullare.';
    if (!await chiedi(testo, 'Elimina')) return;
    await riapriVerbale(vid);
    await eliminaVerbaleBozza(vid);
    go(`/cantieri/${c.id}`);
  };

  const presenti = v.presenze.filter(p => p.presente);
  const nomi = Object.fromEntries(imprese.map(i => [i.id, i.ragioneSociale]));
  const contaEsiti = k => Object.values(v.esiti).filter(e => e.esito === k).length;

  return html`<${Header} title=${`Verbale n. ${v.numero}${v.revisione ? ' – Rev. ' + v.revisione : ''}`} back=${`/cantieri/${c.id}`} />
  <main>
    <section class="card">
      <h3>${c.denominazione}</h3>
      <p class="muted">Sopralluogo del ${fmtData(v.data)} ${v.oraInizio ? `ore ${v.oraInizio}${v.oraFine ? '–' + v.oraFine : ''}` : ''}</p>
      <div class="stats small">
        <div class="stat"><b>${contaEsiti('c')}</b><span>conformi</span></div>
        <div class=${'stat' + (ncs.length ? ' alert' : '')}><b>${ncs.length}</b><span>NC</span></div>
        <div class="stat"><b>${presenti.length}</b><span>imprese</span></div>
      </div>
      ${ncs.length > 0 && html`<ul class="nc-list">${ncs.map(n => html`<li><span class=${'tag g-' + n.gravita}>${GRAVITA[n.gravita]}</span>
        ${n.descrizione} — <i>${nomi[n.impresaId] || ''}</i>, entro ${fmtData(n.termine)}</li>`)}</ul>`}
    </section>
    <section class="card actions">
      <${DriveVerbale} v=${v} />
      ${PROVA ? html`
        <button class="btn primary big" disabled=${busy} onClick=${anteprima}>${busy ? 'Genero il PDF…' : 'Vedi il PDF del verbale'}</button>
        <div class="banner warn">Versione di prova: qui il PDF si può solo vedere. Scaricarlo, condividerlo e inviarlo per email funziona nell'app installata sul tablet.</div>`
      : html`
        <button class="btn primary big" disabled=${busy} onClick=${anteprima}>${busy ? 'Genero il PDF…' : 'Anteprima e invio'}</button>
        <button class="btn" disabled=${busy} onClick=${condividi}>Condividi PDF</button>
        <button class="btn" disabled=${busy} onClick=${scaricaPdf}>Scarica PDF</button>
        <button class="btn" disabled=${busy} onClick=${scaricaWord}>Scarica Word</button>
        <button class="btn" disabled=${busy} onClick=${email}>Email con PDF allegato</button>`}
      <div class="row-btns">
        <button class="btn" onClick=${modifica}>Modifica verbale</button>
        <button class="btn ghost danger" onClick=${elimina}>Elimina verbale</button>
      </div>
      ${msg && html`<p class="hint">${msg}</p>`}
      ${vedi && html`<${AnteprimaPdf} file=${vedi} onClose=${() => setVedi(null)} azioni=${PROVA ? null : html`
        <button class="btn ghost" onClick=${() => setVedi(null)}>Chiudi</button>
        <button class="btn" onClick=${email}>Email + PDF</button>
        <button class="btn primary" onClick=${condividi}>Condividi PDF</button>`} />`}
      <div class="banner info">«Email con PDF allegato»: scegli Gmail o l'app della PEC; il PDF è già allegato con oggetto e testo,
        i destinatari sono copiati: incollali nel campo «A». Per la data certa firma digitalmente il PDF (PAdES) e invialo via PEC.</div>
    </section>
  </main>`;
}

// ---------- Sincronizzazione dei dati tra dispositivi ----------

function useSync() {
  const [s, setS] = useState(statoSync());
  useEffect(() => {
    const f = e => setS({ ...e.detail });
    addEventListener('sync-stato', f);
    return () => removeEventListener('sync-stato', f);
  }, []);
  return s;
}

async function risolviConflitto(tipo) {
  const testo = tipo === 'primo'
    ? 'Su Google Drive ci sono già dati dell\'app, salvati da un altro dispositivo, e anche questo dispositivo ne contiene. Cosa vuoi fare?'
    : 'I dati sono stati modificati sia su questo dispositivo sia su un altro dall\'ultima sincronizzazione. Quali vuoi tenere?';
  const scelte = tipo === 'primo'
    ? [{ valore: 'unisci', etichetta: 'Unisci i dati (consigliato)', primaria: true },
       { valore: 'drive', etichetta: 'Usa solo quelli di Drive' },
       { valore: 'locale', etichetta: 'Usa solo quelli di questo dispositivo' },
       { valore: null, etichetta: 'Decido dopo' }]
    : [{ valore: 'drive', etichetta: 'Tieni quelli di Drive', primaria: true },
       { valore: 'locale', etichetta: 'Tieni quelli di questo dispositivo' },
       { valore: null, etichetta: 'Decido dopo' }];
  const scelta = await scegli(testo, scelte);
  if (scelta === 'drive') {
    if (!await chiedi('I dati di questo dispositivo verranno sostituiti da quelli di Drive. Prima ne salvo una copia di sicurezza su Drive.', 'Sostituisci')) return 'annullato';
    await usaDrive(); return 'Dati scaricati da Google Drive.';
  }
  if (scelta === 'locale') {
    if (!await chiedi('I dati su Drive verranno sostituiti da quelli di questo dispositivo. Le modifiche fatte sull\'altro dispositivo andranno perse.', 'Sostituisci')) return 'annullato';
    await usaQuestoDispositivo(); return 'Dati di questo dispositivo caricati su Google Drive.';
  }
  if (scelta === 'unisci') { await unisci(); return 'Dati uniti e caricati su Google Drive.'; }
  return 'annullato';
}

// Avvia una sincronizzazione e, se serve, chiede all'utente come risolvere le differenze.
async function avviaSync(interattivo) {
  const r = await sincronizza({ interattivo });
  if (r?.conflitto) return risolviConflitto(r.conflitto);
  return { scaricato: 'Dati aggiornati da Google Drive.', caricato: 'Modifiche salvate su Google Drive.', 'nessuna-modifica': 'Dati già aggiornati.' }[r] || '';
}

function SyncBanner() {
  const imp = useLive(() => getImpostazioni());
  const s = useSync();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!imp?.driveCollegato || !driveConfigurato() || PROVA) return null;
  let fatta = false; try { fatta = sessionStorage.getItem('syncFatto') === '1'; } catch { /* facoltativo */ }
  const vai = async () => {
    setBusy(true); setMsg('');
    try { const m = await avviaSync(true); if (m && m !== 'annullato') setMsg(m); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };
  const testo = s.conflitto ? 'I dati differiscono da quelli su Google Drive: scegli quali tenere.'
    : !fatta ? 'Sincronizza con Google Drive per avere i dati aggiornati dall\'altro dispositivo.'
    : s.sporco ? 'Ci sono modifiche non ancora salvate su Google Drive.' : '';
  if (!testo && !msg) return null;
  return html`<div class=${'banner ' + (s.conflitto ? 'danger' : testo ? 'warn' : 'info') + ' sync-banner'}>
    <span>${testo || msg}</span>
    ${testo && html`<button class="btn small primary" disabled=${busy || !online} onClick=${vai}>${busy ? 'Sincronizzo…' : s.conflitto ? 'Scegli' : 'Sincronizza'}</button>`}
  </div>`;
}

// ---------- Google Drive ----------

// Riquadro nel verbale chiuso: salva PDF e Word nella cartella del cantiere su Drive.
function DriveVerbale({ v }) {
  const imp = useLive(() => getImpostazioni());
  const online = useOnline();
  const [stato, setStato] = useState({ busy: false, msg: '', errore: false });
  const salva = async () => {
    setStato({ busy: true, msg: 'Salvo PDF e Word su Google Drive…' });
    try {
      await salvaVerbaleSuDrive(v.id);
      setStato({ busy: false, msg: '' });
    } catch (e) { setStato({ busy: false, msg: e.message, errore: true }); }
  };
  // Appena chiuso (o modificato) si salva da solo, se l'accesso a Google è ancora attivo.
  useEffect(() => {
    if (driveConfigurato() && v.driveDaInviare && online && accessoAttivo()) salva();
  }, [v.id, v.revisione]);
  if (!driveConfigurato() || PROVA || !imp) return null;
  if (!imp.driveCollegato) return html`<div class="banner info">Collega Google Drive in <a href="#/impostazioni">Impostazioni</a>: i verbali verranno salvati in PDF e Word nella cartella «${CARTELLA_PRINCIPALE}».</div>`;
  const aggiornato = v.drive && !v.driveDaInviare && (v.drive.revisione || 0) === (v.revisione || 0);
  return html`<div class=${'drive-box' + (aggiornato ? ' ok' : '')}>
    ${aggiornato
      ? html`<span><b>Salvato su Google Drive</b><small>PDF e Word · ${new Date(v.drive.salvato).toLocaleString('it-IT')}</small></span>
          <a class="btn small" href=${linkCartella(v.drive.cartellaId)} target="_blank" rel="noopener">Apri cartella</a>`
      : html`<span><b>Da salvare su Google Drive</b><small>${online ? 'PDF e Word nella cartella del cantiere' : 'Senza connessione: lo salverai appena torna internet'}</small></span>
          <button class="btn small primary" disabled=${stato.busy || !online} onClick=${salva}>${stato.busy ? 'Salvo…' : 'Salva su Drive'}</button>`}
    ${stato.msg && html`<p class=${'hint' + (stato.errore ? ' red-text' : '')}>${stato.msg}</p>`}
  </div>`;
}

// Riquadro in Impostazioni: collegamento dell'account e salvataggio dei verbali in sospeso.
function DriveImpostazioni() {
  const imp = useLive(() => getImpostazioni());
  const sospesi = useLive(() => verbaliDaInviare(), []);
  const online = useOnline();
  const sync = useSync();
  const [stato, setStato] = useState({ busy: false, msg: '' });
  if (!imp || !sospesi) return null;
  const collega = async () => {
    setStato({ busy: true, msg: 'Apro l\'accesso a Google…' });
    try {
      await accediDrive({ conferma: true });
      setStato({ busy: true, msg: 'Google Drive collegato. Sincronizzo i dati…' });
      const m = await avviaSync(true);
      setStato({ busy: false, msg: 'Google Drive collegato. ' + (m && m !== 'annullato' ? m : '') });
    } catch (e) { setStato({ busy: false, msg: e.message }); }
  };
  const sincronizzaOra = async () => {
    setStato({ busy: true, msg: 'Sincronizzo i dati con Google Drive…' });
    try { const m = await avviaSync(true); setStato({ busy: false, msg: m === 'annullato' ? '' : m }); }
    catch (e) { setStato({ busy: false, msg: e.message }); }
  };
  const salvaTutti = async () => {
    let ok = 0;
    try {
      for (const v of sospesi) { setStato({ busy: true, msg: `Salvo il verbale n. ${v.numero} (${ok + 1} di ${sospesi.length})…` }); await salvaVerbaleSuDrive(v.id); ok++; }
      setStato({ busy: false, msg: `${ok} verbali salvati su Drive.` });
    } catch (e) { setStato({ busy: false, msg: `${ok} salvati, poi errore: ${e.message}` }); }
  };
  const scollega = async () => {
    if (!await chiedi('Scollegare Google Drive? I file già salvati restano su Drive.', 'Scollega')) return;
    await scollegaDrive(); setStato({ busy: false, msg: 'Google Drive scollegato.' });
  };
  return html`<section class="card">
    <h3>Google Drive</h3>
    ${!driveConfigurato() ? html`<p class="muted">Il collegamento a Google Drive è in preparazione.</p>`
    : PROVA ? html`<p class="muted">Disponibile nell'app installata.</p>`
    : imp.driveCollegato ? html`
      <p class="muted">Ogni verbale chiuso viene salvato in PDF e Word in <b>${CARTELLA_PRINCIPALE} / [nome del cantiere]</b>.
        Anche i dati dell'app (cantieri, imprese, verbali, foto) si sincronizzano tra tablet e PC.</p>
      <p class="hint">Ultima sincronizzazione: <b>${sync.ultima ? new Date(sync.ultima).toLocaleString('it-IT') : 'mai'}</b>${sync.sporco ? ' · modifiche da caricare' : ''}</p>
      <div class="row-btns">
        <button class="btn small primary" disabled=${stato.busy || !online} onClick=${sincronizzaOra}>Sincronizza ora</button>
        ${imp.driveCartellaId && html`<a class="btn small" href=${linkCartella(imp.driveCartellaId)} target="_blank" rel="noopener">Apri la cartella</a>`}
        ${sospesi.length > 0 && html`<button class="btn small" disabled=${stato.busy || !online} onClick=${salvaTutti}>Salva ${sospesi.length} verbali in sospeso</button>`}
        <button class="btn small ghost" onClick=${scollega}>Scollega</button>
      </div>`
    : html`
      <p class="muted">Collega il tuo Google Drive: l'app creerà la cartella <b>${CARTELLA_PRINCIPALE}</b> con una sottocartella per ogni cantiere, e ci salverà ogni verbale in PDF e Word.</p>
      <button class="btn primary" disabled=${stato.busy || !online} onClick=${collega}>Collega Google Drive</button>`}
    ${stato.msg && html`<p class="hint">${stato.msg}</p>`}
  </section>`;
}

// Anteprima del PDF disegnata con pdf.js, per vederlo anche dove il download non è consentito.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

function AnteprimaPdf({ file, onClose, azioni }) {
  const box = useRef();
  const [stato, setStato] = useState('Preparo l\'anteprima…');
  useEffect(() => {
    let annullato = false;
    document.body.style.overflow = 'hidden';
    (async () => {
      try {
        if (!window.pdfjsLib) {
          await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = PDFJS + 'pdf.min.js'; s.onload = res; s.onerror = () => rej(new Error('libreria non disponibile'));
            document.head.appendChild(s);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
        }
        const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const larg = Math.min(box.current.clientWidth, 900);
        for (let i = 1; i <= doc.numPages && !annullato; i++) {
          const pag = await doc.getPage(i);
          const base = pag.getViewport({ scale: 1 });
          const vp = pag.getViewport({ scale: (larg / base.width) * (window.devicePixelRatio || 1) });
          const cv = document.createElement('canvas');
          cv.width = vp.width; cv.height = vp.height;
          cv.style.width = larg + 'px';
          cv.setAttribute('aria-label', `Pagina ${i} di ${doc.numPages}`);
          box.current.appendChild(cv);
          await pag.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        }
        setStato('');
      } catch (e) { setStato('Anteprima non disponibile: ' + e.message); }
    })();
    return () => { annullato = true; document.body.style.overflow = ''; };
  }, [file]);
  return html`<div class="modal" role="dialog" aria-modal="true" aria-label="Anteprima PDF">
    <header class="top">
      <h1>${file.name}</h1>
      <button class="icon-btn" aria-label="Chiudi" onClick=${onClose}><${Icon} d=${I.x} /></button>
    </header>
    ${stato && html`<p class="empty">${stato}</p>`}
    <div class=${'pdf-pagine' + (azioni ? ' con-azioni' : '')} ref=${box}></div>
    ${azioni && html`<footer class="wizard-nav pdf-azioni">${azioni}</footer>`}
  </div>`;
}

const oggettoEmail = (v, c) => `Verbale di sopralluogo n. ${v.numero}${v.revisione ? ' Rev. ' + v.revisione : ''} – ${c.denominazione} – ${fmtData(v.data)}`;

function datiEmail(v, c, imprese) {
  const presenti = new Set(v.presenze.filter(p => p.presente).map(p => p.impresaId));
  const to = [...new Set([c.committenteEmail, c.rlEmail].filter(Boolean))];
  const cc = [...new Set([c.dlEmail, ...imprese.filter(i => presenti.has(i.id)).map(i => i.pec || i.email)].filter(Boolean))];
  const body = `Buongiorno,\n\nsi trasmette in allegato il verbale di sopralluogo n. ${v.numero}${v.revisione ? ' Rev. ' + v.revisione : ''} del ${fmtData(v.data)} relativo al cantiere "${c.denominazione}"${c.indirizzo ? ' in ' + c.indirizzo : ''}, redatto ai sensi dell'art. 92 del D.Lgs. 81/2008.\n\nLe imprese in indirizzo sono tenute ad attuare le prescrizioni riportate entro i termini indicati.\n\nCordiali saluti`;
  return { to, cc, oggetto: oggettoEmail(v, c), body };
}

function mailtoVerbale(v, c, imprese) {
  const { to, cc, oggetto, body } = datiEmail(v, c, imprese);
  const q = [cc.length && 'cc=' + encodeURIComponent(cc.join(',')),
    'subject=' + encodeURIComponent(oggetto), 'body=' + encodeURIComponent(body)].filter(Boolean).join('&');
  return `mailto:${to.join(',')}?${q}`;
}

// ---------- Registro NC ----------

function RegistroNC({ filtro }) {
  const ncs = useLive(() => db.nonConformita.filter(n => !n.bozza).toArray());
  const cantieri = useLive(() => db.cantieri.toArray());
  const imprese = useLive(() => db.imprese.toArray());
  const verbali = useLive(() => db.verbali.toArray());
  const [f, setF] = useState({ cantiere: '', impresa: '', stato: 'aperte', soloScadute: filtro === 'scadute' });
  if (!ncs || !cantieri || !imprese || !verbali) return null;
  const nomiC = Object.fromEntries(cantieri.map(c => [c.id, c.denominazione]));
  const nomiI = Object.fromEntries(imprese.map(i => [i.id, i.ragioneSociale]));
  const vMap = Object.fromEntries(verbali.map(v => [v.id, v]));
  const STATI = { aperta: 'Aperta', persistente: 'Ancora non conforme', risolta: 'Risolta' };
  const vis = ncs.filter(n =>
    (!f.cantiere || n.cantiereId === Number(f.cantiere)) &&
    (!f.impresa || n.impresaId === Number(f.impresa)) &&
    (f.stato === 'tutte' || (f.stato === 'aperte' ? n.stato !== 'risolta' : n.stato === 'risolta')) &&
    (!f.soloScadute || scaduta(n))
  ).sort((a, b) => (a.termine || '9').localeCompare(b.termine || '9'));
  const b = binder(f, setF);
  return html`<${Header} title="Registro non conformità" />
  <main>
    <${SchedeNC} attiva="registro" />
    <section class="card">
      <p class="muted">Le non conformità si registrano dentro un sopralluogo, così finiscono nel verbale con data, firme e foto.</p>
      ${cantieri.filter(c => c.stato !== 'chiuso').length
        ? html`<div class="row-btns">${cantieri.filter(c => c.stato !== 'chiuso').map(c => html`
            <button class="btn primary" onClick=${() => nuovoSopralluogo(c.id, 4)}>
              <${Icon} d=${I.plus} size=${18} /> Aggiungi NC – ${c.denominazione}</button>`)}</div>`
        : html`<a class="btn primary" href="#/cantieri/nuovo">Crea prima un cantiere</a>`}
    </section>
    <section class="card filters">
      <div class="grid2">
        ${b('cantiere', 'Cantiere', { options: [['', 'Tutti'], ...cantieri.map(c => [String(c.id), c.denominazione])] })}
        ${b('impresa', 'Impresa', { options: [['', 'Tutte'], ...imprese.map(i => [String(i.id), i.ragioneSociale])] })}
      </div>
      <div class="grid2">
        ${b('stato', 'Stato', { options: [['aperte', 'Aperte / persistenti'], ['risolta', 'Risolte'], ['tutte', 'Tutte']] })}
        <label class="check"><input type="checkbox" checked=${f.soloScadute} onChange=${e => setF({ ...f, soloScadute: e.target.checked })} /> Solo scadute</label>
      </div>
    </section>
    ${vis.length ? vis.map(n => {
      const orig = vMap[n.verbaleId];
      return html`<section class=${'card nc ' + (scaduta(n) ? 'late' : '')}>
        <div class="nc-head">
          <span class=${'tag g-' + n.gravita}>${GRAVITA[n.gravita]}</span>
          <span class=${'tag ' + (n.stato === 'risolta' ? 'green' : n.stato === 'persistente' ? 'red' : 'amber')}>${STATI[n.stato]}</span>
        </div>
        <p><b>${n.descrizione}</b></p>
        <p class="muted">${nomiI[n.impresaId] || 'Impresa non indicata'} · ${nomiC[n.cantiereId]}</p>
        <p>${n.prescrizione}</p>
        <p class="muted">Termine: <b class=${scaduta(n) ? 'red-text' : ''}>${fmtData(n.termine) || '—'}</b>
          · <a href=${`#/verbale/${n.verbaleId}`}>Verbale n. ${orig?.numero} del ${fmtData(orig?.data)}</a>
          ${n.dataChiusura ? ` · risolta il ${fmtData(n.dataChiusura)}` : ''}</p>
      </section>`;
    }) : html`<${Empty}>Nessuna non conformità con questi filtri.<//>`}
  </main>`;
}

// ---------- Impostazioni ----------

function Impostazioni() {
  const [s, setS] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [persist, setPersist] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    getImpostazioni().then(setS);
    navigator.storage?.persisted?.().then(setPersist);
  }, []);
  if (!s) return null;
  const set = v => { setS(v); setDirty(true); };
  const f = binder(s, set);
  const salva = async () => { await salvaImpostazioni(s); setDirty(false); setMsg('Impostazioni salvate.'); };
  const logo = async e => {
    const file = e.target.files[0]; if (!file) return;
    const blob = await ridimensiona(file, 500, 0.9, 'image/png');
    set({ ...s, logo: await blobToDataURL(blob) });
  };
  const esporta = async () => {
    setMsg('Preparo il backup…');
    const data = await creaBackup();
    const file = new File([JSON.stringify(data)], `backup-verbali-cse-${oggiISO()}.json`, { type: 'application/json' });
    const r = await condividiOScarica(file);
    if (r !== 'annullato') {
      await salvaImpostazioni({ ultimoBackup: Date.now() });
      setS(await getImpostazioni());
      setMsg(r === 'scaricato' ? 'Backup salvato nei Download. Copialo su Drive o sul PC.' : 'Backup condiviso.');
    } else setMsg('');
  };
  const importa = async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!await chiedi(`Ripristinare il backup del ${fmtData(data.creato)}? Tutti i dati attuali su questo dispositivo verranno sostituiti.`)) return;
      await ripristinaBackup(data);
      await salvaImpostazioni({ ultimoBackup: Date.now() });
      setS(await getImpostazioni()); setDirty(false);
      setMsg('Backup ripristinato.');
    } catch (err) { avviso('Impossibile ripristinare: ' + err.message); }
  };
  const ripara = async () => {
    if (!await chiedi('Riparare l\'app? Scarico di nuovo l\'ultima versione. I tuoi cantieri, imprese e verbali non vengono toccati. Serve la connessione internet.', 'Ripara')) return;
    for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
    location.reload();
  };
  const chiediPersist = async () => setPersist(await navigator.storage?.persist?.());

  return html`<${Header} title="Impostazioni">
    <button class="btn small primary" disabled=${!dirty} onClick=${salva}>Salva</button>
  <//>
  <main>
    ${msg && html`<div class="banner info">${msg}</div>`}
    <section class="card">
      <h3>Dati del coordinatore</h3>
      <div class="grid2">${f('titolo', 'Titolo (Ing., Arch., Geom.…)')}${f('nome', 'Nome e cognome')}</div>
      <div class="grid2">${f('ordine', 'Ordine / Collegio')}${f('iscrizione', 'N. iscrizione')}</div>
      ${f('indirizzo', 'Indirizzo studio')}
      <div class="grid3">${f('telefono', 'Telefono', { type: 'tel' })}${f('email', 'Email', { type: 'email' })}${f('pec', 'PEC', { type: 'email' })}</div>
    </section>
    <section class="card">
      <h3>Logo per l'intestazione</h3>
      ${s.logo && html`<img class="logo-prev" src=${s.logo} alt="Logo" />`}
      <div class="row-btns">
        <label class="btn small">Scegli immagine<input type="file" accept="image/*" hidden onChange=${logo} /></label>
        ${s.logo && html`<button class="btn small ghost" onClick=${() => set({ ...s, logo: null })}>Rimuovi</button>`}
      </div>
    </section>
    <section class="card">
      <h3>Firma salvata</h3>
      <p class="hint">Si può riutilizzare nei verbali con «Usa firma salvata».</p>
      <${Firma} value=${s.firma} onChange=${x => set({ ...s, firma: x })} />
    </section>
    <${DriveImpostazioni} />
    <section class="card">
      <h3>Backup</h3>
      ${PROVA && html`<div class="banner warn">Nella versione di prova il backup non si può salvare: funziona nell'app installata.</div>`}
      <p class="muted">I dati sono salvati solo su questo dispositivo. Ultimo backup:
        <b>${s.ultimoBackup ? new Date(s.ultimoBackup).toLocaleString('it-IT') : 'mai'}</b>.</p>
      <div class="row-btns">
        <button class="btn primary" onClick=${esporta}>Esporta backup</button>
        <label class="btn">Importa backup<input type="file" accept="application/json,.json" hidden onChange=${importa} /></label>
      </div>
      <p class="hint">Archiviazione protetta dal browser: <b>${persist === null ? 'non disponibile' : persist ? 'attiva' : 'non attiva'}</b>
        ${persist === false && html` <button class="btn small ghost" onClick=${chiediPersist}>Attiva</button>`}</p>
    </section>
    ${!PROVA && html`<section class="card">
      <h3>Problemi con l'app?</h3>
      <p class="muted">Versione dell'app: <b>${VERSIONE}</b>. Se un pulsante non risponde o l'app sembra vecchia, scarica di nuovo l'ultima versione. I dati restano.</p>
      <button class="btn" onClick=${ripara}>Ripara app</button>
    </section>`}
  </main>`;
}

// ---------- App ----------

function Nav({ attivo }) {
  const voci = [['', 'Home', I.home], ['cantieri', 'Cantieri', I.cantiere], ['imprese', 'Imprese', I.imprese], ['nc', 'NC', I.nc], ['impostazioni', 'Impostazioni', I.imp]];
  return html`<nav class="bottom">${voci.map(([k, l, d]) => html`<a href=${'#/' + k} class=${attivo === k ? 'on' : ''}><${Icon} d=${d} /><span>${l}</span></a>`)}</nav>`;
}

function App() {
  const r = useRoute();
  useEffect(() => {
    navigator.storage?.persist?.()?.catch?.(() => {});
    if (PROVA || !('serviceWorker' in navigator)) return;
    // Con la rete il service worker prende sempre i file più recenti: gli aggiornamenti arrivano da soli.
    navigator.serviceWorker.register('./sw.js').then(reg => reg.update()).catch(() => {});
  }, []);
  // Sincronizzazione automatica all'avvio e al ritorno della rete, se l'accesso a Google è ancora attivo.
  useEffect(() => {
    if (PROVA) return;
    const prova = () => avviaSync(false).catch(() => {});
    prova();
    addEventListener('online', prova);
    return () => removeEventListener('online', prova);
  }, []);

  const [sez, a, b] = r;
  let page;
  if (sez === 'sopralluogo') page = html`<${Sopralluogo} id=${a} step=${b} />`;
  else if (sez === 'verbale') page = html`<${VerbaleView} id=${a} />`;
  else if (sez === 'cantieri') page = a ? html`<${CantiereForm} key=${a} id=${a} />` : html`<${CantieriList} />`;
  else if (sez === 'imprese') page = a ? html`<${ImpresaForm} key=${a + (b || '')} id=${a} cantiere=${b} />` : html`<${ImpreseList} />`;
  else if (sez === 'nc') page = html`<${RegistroNC} filtro=${a} key=${a} />`;
  else if (sez === 'catalogo') page = html`<${CatalogoPage} />`;
  else if (sez === 'impostazioni') page = html`<${Impostazioni} />`;
  else page = html`<${Home} />`;

  return html`${page}
    <${Dialogo} />
    ${sez !== 'sopralluogo' && html`<${Nav} attivo=${sez === 'verbale' ? 'cantieri' : sez === 'catalogo' ? 'nc' : (sez || '')} />`}`;
}

render(html`<${App} />`, document.getElementById('app'));
