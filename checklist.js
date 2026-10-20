// Checklist predefinita per il sopralluogo del CSE (D.Lgs. 81/2008, Titolo IV e allegati).
// Base di partenza: rivedere i contenuti prima dell'uso professionale.

export const CHECKLIST = [
  {
    id: 'doc', titolo: 'Documentazione in cantiere', rif: 'artt. 90, 96, 99, 101; All. XVII',
    voci: [
      { id: 'doc1', testo: 'Copia della notifica preliminare affissa in maniera visibile', rif: 'art. 99 c.2' },
      { id: 'doc2', testo: 'PSC e POS delle imprese esecutrici disponibili in cantiere', rif: 'artt. 100-101' },
      { id: 'doc3', testo: 'Cartello di cantiere presente e aggiornato', rif: 'normativa edilizia' },
      { id: 'doc4', testo: 'Lavoratori muniti di tessera di riconoscimento', rif: 'art. 18 c.1 lett. u; art. 26 c.8' },
      { id: 'doc5', testo: 'Documentazione di idoneità tecnico-professionale delle imprese', rif: 'art. 90 c.9; All. XVII' },
      { id: 'doc6', testo: 'PiMUS e autorizzazione ministeriale del ponteggio presenti', rif: 'artt. 134, 136' },
      { id: 'doc7', testo: 'Libretti e verifiche periodiche delle attrezzature disponibili', rif: 'art. 71 c.11; All. VII' }
    ]
  },
  {
    id: 'org', titolo: 'Organizzazione e recinzione del cantiere', rif: 'All. XIII, XV; Titolo V',
    voci: [
      { id: 'org1', testo: 'Recinzione integra e accessi controllati', rif: 'All. XV p.to 2.2.2' },
      { id: 'org2', testo: 'Viabilità di cantiere e percorsi pedonali separati e sgombri', rif: 'art. 108; All. XVIII' },
      { id: 'org3', testo: 'Aree di stoccaggio materiali ordinate e stabili', rif: 'All. XV' },
      { id: 'org4', testo: 'Servizi igienico-assistenziali presenti e idonei', rif: 'All. XIII' },
      { id: 'org5', testo: 'Segnaletica di sicurezza presente e leggibile', rif: 'Titolo V' },
      { id: 'org6', testo: 'Illuminazione adeguata delle zone di lavoro e passaggio', rif: 'All. XV' }
    ]
  },
  {
    id: 'alto', titolo: 'Cadute dall\'alto', rif: 'artt. 105-117',
    voci: [
      { id: 'alto1', testo: 'Parapetti regolamentari su bordi e solai prospicienti il vuoto', rif: 'art. 115; All. XVIII' },
      { id: 'alto2', testo: 'Aperture nei solai e vani scala protetti', rif: 'art. 146' },
      { id: 'alto3', testo: 'Sistemi anticaduta / linee vita installati e utilizzati', rif: 'art. 115' },
      { id: 'alto4', testo: 'Scale portatili idonee e correttamente utilizzate', rif: 'art. 113' },
      { id: 'alto5', testo: 'Lavori su coperture con protezioni collettive o DPI anticaduta', rif: 'artt. 111, 148' }
    ]
  },
  {
    id: 'pont', titolo: 'Ponteggi e opere provvisionali', rif: 'artt. 122-138; All. XVIII-XXII',
    voci: [
      { id: 'pont1', testo: 'Ponteggio montato secondo PiMUS e schema autorizzato', rif: 'artt. 133-136' },
      { id: 'pont2', testo: 'Ancoraggi presenti ed efficienti', rif: 'All. XVIII' },
      { id: 'pont3', testo: 'Impalcati completi, fermapiede e parapetti regolari', rif: 'artt. 126, 128' },
      { id: 'pont4', testo: 'Sottoponti presenti dove richiesti', rif: 'art. 128' },
      { id: 'pont5', testo: 'Trabattelli stabili, con ruote bloccate e parapetti', rif: 'art. 140' },
      { id: 'pont6', testo: 'Distanza del ponteggio dalla costruzione ≤ 20 cm', rif: 'art. 138' }
    ]
  },
  {
    id: 'scavi', titolo: 'Scavi', rif: 'artt. 118-121',
    voci: [
      { id: 'scavi1', testo: 'Pareti degli scavi armate o con inclinazione adeguata', rif: 'art. 119' },
      { id: 'scavi2', testo: 'Nessun deposito di materiali o mezzi presso il ciglio', rif: 'art. 120' },
      { id: 'scavi3', testo: 'Parapetti o delimitazioni lungo il ciglio', rif: 'art. 118' },
      { id: 'scavi4', testo: 'Accessi e uscite dagli scavi sicuri', rif: 'art. 119' }
    ]
  },
  {
    id: 'macc', titolo: 'Macchine e attrezzature', rif: 'Titolo III Capo I; All. V, VI, VII',
    voci: [
      { id: 'macc1', testo: 'Gru e apparecchi di sollevamento verificati e con dispositivi efficienti', rif: 'art. 71; All. VII' },
      { id: 'macc2', testo: 'Operatori abilitati (gru, PLE, macchine movimento terra)', rif: 'art. 73 c.5; Accordo Stato-Regioni' },
      { id: 'macc3', testo: 'Macchine con protezioni degli organi in movimento', rif: 'All. V' },
      { id: 'macc4', testo: 'Area di manovra dei mezzi delimitata', rif: 'All. VI' },
      { id: 'macc5', testo: 'Accessori di sollevamento (funi, catene, ganci) idonei', rif: 'All. V' }
    ]
  },
  {
    id: 'ele', titolo: 'Impianto elettrico', rif: 'artt. 80-86',
    voci: [
      { id: 'ele1', testo: 'Quadri elettrici di cantiere (ASC) idonei e chiusi', rif: 'art. 80' },
      { id: 'ele2', testo: 'Impianto di messa a terra realizzato', rif: 'art. 86' },
      { id: 'ele3', testo: 'Cavi e prolunghe integri, non a terra in zone di passaggio', rif: 'art. 80' },
      { id: 'ele4', testo: 'Dichiarazione di conformità dell\'impianto disponibile', rif: 'D.M. 37/2008' },
      { id: 'ele5', testo: 'Distanza di sicurezza da linee elettriche aeree', rif: 'art. 117; All. IX' }
    ]
  },
  {
    id: 'dpi', titolo: 'Dispositivi di protezione individuale', rif: 'Titolo III Capo II',
    voci: [
      { id: 'dpi1', testo: 'Utilizzo dell\'elmetto di protezione', rif: 'art. 75; All. VIII' },
      { id: 'dpi2', testo: 'Utilizzo delle calzature di sicurezza', rif: 'All. VIII' },
      { id: 'dpi3', testo: 'Utilizzo di guanti, occhiali e otoprotettori dove necessari', rif: 'All. VIII' },
      { id: 'dpi4', testo: 'Indumenti ad alta visibilità in presenza di traffico', rif: 'All. VIII' }
    ]
  },
  {
    id: 'risk', titolo: 'Rischi specifici', rif: 'Titoli VIII, IX; artt. 150-156',
    voci: [
      { id: 'risk1', testo: 'Misure contro rumore e vibrazioni', rif: 'Titolo VIII Capi II-III' },
      { id: 'risk2', testo: 'Contenimento delle polveri (bagnatura, aspirazione)', rif: 'Titolo IX' },
      { id: 'risk3', testo: 'Gestione di eventuali materiali contenenti amianto', rif: 'Titolo IX Capo III' },
      { id: 'risk4', testo: 'Sostanze pericolose stoccate correttamente, schede SDS disponibili', rif: 'Titolo IX Capo I' },
      { id: 'risk5', testo: 'Demolizioni eseguite secondo programma', rif: 'artt. 150-156' }
    ]
  },
  {
    id: 'emer', titolo: 'Gestione delle emergenze', rif: 'artt. 43-46; All. XV',
    voci: [
      { id: 'emer1', testo: 'Cassetta / pacchetto di primo soccorso presente', rif: 'art. 45; D.M. 388/2003' },
      { id: 'emer2', testo: 'Estintori presenti, accessibili e verificati', rif: 'art. 46' },
      { id: 'emer3', testo: 'Addetti alle emergenze designati e presenti', rif: 'art. 18 c.1 lett. b' },
      { id: 'emer4', testo: 'Numeri di emergenza esposti', rif: 'All. XV' }
    ]
  },
  {
    id: 'coord', titolo: 'Interferenze e coordinamento', rif: 'artt. 92, 95, 97',
    voci: [
      { id: 'coord1', testo: 'Lavorazioni conformi al cronoprogramma del PSC', rif: 'All. XV p.to 2.3' },
      { id: 'coord2', testo: 'Assenza di sovrapposizioni pericolose tra imprese', rif: 'art. 92 c.1 lett. c' },
      { id: 'coord3', testo: 'Uso comune di apprestamenti e attrezzature regolato', rif: 'All. XV p.to 2.3.4' },
      { id: 'coord4', testo: 'Imprese presenti tutte comunicate e con POS verificato', rif: 'art. 92 c.1 lett. b; art. 97' },
      { id: 'coord5', testo: 'Impresa affidataria verifica l\'applicazione del PSC', rif: 'art. 97' }
    ]
  }
];

export const VOCI = Object.fromEntries(
  CHECKLIST.flatMap(a => a.voci.map(v => [v.id, { ...v, area: a.titolo }]))
);

export const GRAVITA = {
  lieve: 'Lieve',
  grave: 'Grave',
  pgi: 'Pericolo grave e imminente'
};
