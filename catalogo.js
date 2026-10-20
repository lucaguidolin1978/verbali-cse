// Catalogo di non conformità ricorrenti con prescrizione precompilata.
// area = id dell'area in checklist.js; voce = id della voce collegata (facoltativo);
// gravita = lieve | grave | pgi; giorni = termine proposto (0 = immediato).
// Base di partenza: rivedere e adattare alla propria prassi professionale.

const N = (area, voce, gravita, giorni, descrizione, prescrizione, rif) =>
  ({ area, voce, gravita, giorni, descrizione, prescrizione, rif });

export const CATALOGO = [
  // Documentazione
  N('doc', 'doc1', 'lieve', 3, 'Copia della notifica preliminare non affissa in cantiere',
    'Affiggere in maniera visibile copia della notifica preliminare e del suo eventuale aggiornamento', 'art. 99 c.2'),
  N('doc', 'doc2', 'grave', 1, 'POS dell\'impresa esecutrice non presente in cantiere',
    'Rendere disponibile in cantiere copia del POS e trasmetterlo al CSE per la verifica di idoneità prima dell\'inizio delle lavorazioni', 'artt. 96, 101'),
  N('doc', 'doc2', 'grave', 0, 'Impresa presente in cantiere senza POS verificato dal CSE',
    'Sospendere le attività dell\'impresa fino alla trasmissione del POS e all\'esito positivo della verifica di idoneità da parte del CSE', 'art. 92 c.1 lett. b; art. 101 c.3'),
  N('doc', 'doc4', 'grave', 0, 'Lavoratori privi di tessera di riconoscimento',
    'Dotare immediatamente tutti i lavoratori della tessera di riconoscimento con fotografia, generalità e datore di lavoro, da esporre in modo visibile', 'art. 18 c.1 lett. u; art. 26 c.8'),
  N('doc', 'doc5', 'grave', 3, 'Documentazione di idoneità tecnico-professionale incompleta',
    'Trasmettere al committente/RL la documentazione prevista dall\'All. XVII (iscrizione CCIAA, DURC, DVR, nomine, formazione)', 'art. 90 c.9; All. XVII'),
  N('doc', 'doc6', 'grave', 1, 'PiMUS non presente o non aggiornato alla configurazione del ponteggio',
    'Redigere/aggiornare il PiMUS in funzione della configurazione realizzata e renderlo disponibile in cantiere', 'art. 134; All. XXII'),
  N('doc', 'doc7', 'grave', 3, 'Verifiche periodiche delle attrezzature non documentate',
    'Esibire i verbali delle verifiche periodiche (All. VII) e i registri di controllo delle attrezzature in uso', 'art. 71 c.11; All. VII'),

  // Organizzazione
  N('org', 'org1', 'grave', 1, 'Recinzione di cantiere interrotta o danneggiata',
    'Ripristinare la continuità della recinzione e chiudere gli accessi in assenza di sorveglianza, impedendo l\'accesso ai non addetti', 'All. XV p.to 2.2.2'),
  N('org', 'org2', 'grave', 1, 'Percorsi pedonali ingombri o non separati dalla viabilità dei mezzi',
    'Sgomberare e delimitare i percorsi pedonali, separandoli fisicamente dalle aree di transito dei mezzi', 'art. 108; All. XVIII'),
  N('org', 'org3', 'lieve', 3, 'Materiali stoccati in modo disordinato o instabile',
    'Riordinare i materiali in aree dedicate, accatastandoli in modo stabile e lontano da bordi e percorsi', 'All. XV'),
  N('org', 'org4', 'grave', 3, 'Servizi igienico-assistenziali assenti o non idonei',
    'Installare e mantenere in efficienza servizi igienici, spogliatoi e locale di ricovero secondo quanto previsto dal PSC', 'All. XIII'),
  N('org', 'org5', 'lieve', 3, 'Segnaletica di sicurezza mancante o non leggibile',
    'Integrare la cartellonistica di sicurezza (obblighi DPI, divieti, pericoli, emergenza) agli accessi e nelle zone di lavoro', 'Titolo V; All. XXIV-XXV'),

  // Cadute dall'alto
  N('alto', 'alto1', 'pgi', 0, 'Bordo del solaio privo di parapetto',
    'Installare immediatamente parapetto regolamentare (h ≥ 1 m, corrente intermedio, tavola fermapiede) e interdire l\'area fino alla messa in sicurezza', 'artt. 115, 146; All. XVIII'),
  N('alto', 'alto1', 'grave', 0, 'Parapetto incompleto (manca corrente intermedio o fermapiede)',
    'Completare il parapetto con corrente intermedio e tavola fermapiede su tutto lo sviluppo', 'art. 126; All. XVIII'),
  N('alto', 'alto2', 'pgi', 0, 'Apertura nel solaio / vano scala non protetto',
    'Proteggere immediatamente l\'apertura con parapetto o copertura fissata e resistente, segnalandola', 'art. 146'),
  N('alto', 'alto3', 'pgi', 0, 'Lavoratore in quota senza imbracatura agganciata',
    'Interrompere immediatamente l\'attività; riprenderla solo con protezioni collettive o con imbracatura agganciata a punto di ancoraggio idoneo', 'artt. 111, 115'),
  N('alto', 'alto4', 'grave', 0, 'Scala portatile non idonea o utilizzata in modo scorretto',
    'Allontanare la scala non conforme; utilizzare scale a norma, vincolate e sporgenti almeno 1 m oltre il piano di sbarco', 'art. 113'),
  N('alto', 'alto5', 'pgi', 0, 'Lavori in copertura senza protezioni contro la caduta',
    'Sospendere i lavori in copertura fino all\'installazione di parapetti perimetrali, reti o linee vita e all\'uso di DPI anticaduta', 'art. 148'),

  // Ponteggi
  N('pont', 'pont1', 'grave', 1, 'Ponteggio difforme dallo schema autorizzato senza progetto',
    'Adeguare il ponteggio allo schema tipo o produrre progetto firmato da ingegnere/architetto abilitato', 'artt. 132-133'),
  N('pont', 'pont2', 'pgi', 0, 'Ancoraggi del ponteggio insufficienti o rimossi',
    'Interdire l\'uso del ponteggio e ripristinare gli ancoraggi secondo libretto e PiMUS prima della ripresa delle attività', 'All. XVIII; art. 136'),
  N('pont', 'pont3', 'grave', 0, 'Impalcato del ponteggio incompleto o con tavole non fissate',
    'Completare gli impalcati con elementi fissati e accostati, privi di aperture', 'art. 128'),
  N('pont', 'pont4', 'grave', 1, 'Sottoponte mancante',
    'Realizzare il sottoponte a distanza non superiore a 2,50 m dall\'impalcato', 'art. 128'),
  N('pont', 'pont5', 'grave', 0, 'Trabattello utilizzato senza ruote bloccate o senza parapetti',
    'Bloccare le ruote, installare i parapetti e utilizzare il trabattello secondo le istruzioni del fabbricante', 'art. 140'),
  N('pont', 'pont6', 'grave', 1, 'Distanza tra ponteggio e opera superiore a 20 cm',
    'Installare parapetto interno o impalcato di chiusura per eliminare il rischio di caduta', 'art. 138'),

  // Scavi
  N('scavi', 'scavi1', 'pgi', 0, 'Scavo profondo oltre 1,5 m con pareti verticali non armate',
    'Interdire l\'accesso allo scavo; procedere ad armatura o a profilatura delle pareti secondo inclinazione di sicurezza', 'art. 119'),
  N('scavi', 'scavi2', 'grave', 0, 'Materiali o mezzi depositati presso il ciglio dello scavo',
    'Allontanare i carichi dal ciglio dello scavo; se necessari, rinforzare le armature', 'art. 120'),
  N('scavi', 'scavi3', 'grave', 0, 'Ciglio dello scavo non delimitato',
    'Installare parapetti o delimitazioni lungo il ciglio dello scavo', 'art. 118'),

  // Macchine
  N('macc', 'macc1', 'pgi', 0, 'Apparecchio di sollevamento con dispositivi di sicurezza non funzionanti',
    'Sospendere l\'uso dell\'apparecchio fino al ripristino dei dispositivi (finecorsa, limitatori) e alla verifica', 'art. 71; All. V'),
  N('macc', 'macc2', 'grave', 0, 'Operatore privo di abilitazione per l\'attrezzatura utilizzata',
    'Sospendere l\'utilizzo da parte dell\'operatore non abilitato; impiegare solo personale formato e abilitato', 'art. 73 c.5'),
  N('macc', 'macc3', 'grave', 0, 'Macchina con protezioni rimosse o manomesse',
    'Ripristinare le protezioni degli organi in movimento; fino ad allora mettere fuori servizio la macchina', 'art. 70; All. V'),
  N('macc', 'macc4', 'grave', 0, 'Area di manovra dei mezzi non delimitata',
    'Delimitare l\'area di manovra e garantire assistenza a terra durante le manovre in retromarcia', 'All. VI'),
  N('macc', 'macc5', 'grave', 0, 'Accessori di sollevamento usurati o non marcati',
    'Eliminare funi, catene e ganci usurati o privi di marcatura; utilizzare ganci con dispositivo di sicurezza', 'All. V'),

  // Elettrico
  N('ele', 'ele1', 'grave', 0, 'Quadro elettrico aperto o non idoneo (non ASC)',
    'Chiudere il quadro e sostituirlo con quadro ASC conforme alla norma CEI EN 61439-4', 'art. 80'),
  N('ele', 'ele3', 'grave', 0, 'Cavi danneggiati o stesi a terra nelle zone di passaggio',
    'Sostituire i cavi danneggiati e posare le linee in modo protetto (aeree o canalizzate) lontano dai percorsi', 'art. 80'),
  N('ele', 'ele2', 'grave', 3, 'Impianto di terra non realizzato o non verificato',
    'Realizzare l\'impianto di terra e trasmettere la denuncia / dichiarazione di conformità', 'art. 86; D.P.R. 462/2001'),
  N('ele', 'ele4', 'lieve', 3, 'Dichiarazione di conformità dell\'impianto di cantiere non disponibile',
    'Trasmettere al CSE la dichiarazione di conformità dell\'impianto elettrico di cantiere', 'D.M. 37/2008'),
  N('ele', 'ele5', 'pgi', 0, 'Lavori a distanza insufficiente da linee elettriche aeree',
    'Sospendere le lavorazioni; rispettare le distanze dell\'All. IX o concordare con l\'ente gestore la messa fuori tensione', 'art. 117; All. IX'),

  // DPI
  N('dpi', 'dpi1', 'grave', 0, 'Lavoratori senza elmetto di protezione',
    'Imporre l\'uso dell\'elmetto a tutti i lavoratori presenti; il preposto vigila sull\'uso effettivo', 'artt. 19, 78'),
  N('dpi', 'dpi2', 'grave', 0, 'Lavoratori senza calzature di sicurezza',
    'Imporre l\'uso delle calzature di sicurezza; allontanare dal cantiere i lavoratori sprovvisti', 'art. 78'),
  N('dpi', 'dpi3', 'lieve', 0, 'Mancato uso di guanti/occhiali/otoprotettori nelle lavorazioni che li richiedono',
    'Fornire e imporre l\'uso dei DPI previsti dal POS per la lavorazione in corso', 'art. 77'),
  N('dpi', 'dpi4', 'grave', 0, 'Lavoratori senza indumenti ad alta visibilità in presenza di traffico',
    'Imporre l\'uso di indumenti ad alta visibilità nelle aree interessate dal traffico veicolare', 'D.I. 22/01/2019'),

  // Rischi specifici
  N('risk', 'risk2', 'lieve', 0, 'Produzione di polveri senza misure di contenimento',
    'Adottare bagnatura, aspirazione localizzata e uso di facciali filtranti FFP2/FFP3', 'Titolo IX'),
  N('risk', 'risk3', 'pgi', 0, 'Rinvenimento di materiale sospetto contenente amianto',
    'Sospendere le lavorazioni nell\'area; far eseguire campionamento e, se positivo, bonifica da ditta abilitata con piano di lavoro ASL', 'art. 256'),
  N('risk', 'risk4', 'lieve', 3, 'Sostanze pericolose non etichettate o senza SDS',
    'Stoccare le sostanze in contenitori etichettati e rendere disponibili le schede di sicurezza', 'Titolo IX Capo I'),
  N('risk', 'risk5', 'pgi', 0, 'Demolizione eseguita senza programma o con rischio di crolli',
    'Sospendere la demolizione; redigere il programma delle demolizioni e procedere dall\'alto verso il basso', 'artt. 150-151'),

  // Emergenze
  N('emer', 'emer1', 'grave', 1, 'Cassetta di primo soccorso assente o incompleta',
    'Dotare il cantiere di cassetta di primo soccorso completa secondo D.M. 388/2003', 'art. 45'),
  N('emer', 'emer2', 'grave', 1, 'Estintori assenti, scaduti o non accessibili',
    'Posizionare estintori revisionati in punti accessibili e segnalati', 'art. 46'),
  N('emer', 'emer3', 'grave', 1, 'Nessun addetto alle emergenze presente in cantiere',
    'Garantire la presenza continua di addetti al primo soccorso e antincendio formati', 'art. 18 c.1 lett. b'),
  N('emer', 'emer4', 'lieve', 1, 'Numeri di emergenza non esposti',
    'Esporre in posizione visibile i numeri di emergenza e le indicazioni per raggiungere il cantiere', 'All. XV'),

  // Coordinamento
  N('coord', 'coord1', 'grave', 1, 'Lavorazioni eseguite in difformità dal cronoprogramma del PSC',
    'Riallineare le lavorazioni al cronoprogramma o richiedere preventivamente al CSE l\'aggiornamento del PSC', 'All. XV p.to 2.3'),
  N('coord', 'coord2', 'pgi', 0, 'Lavorazioni interferenti tra imprese senza misure di coordinamento',
    'Sfasare temporalmente o spazialmente le lavorazioni interferenti come previsto dal PSC; convocare riunione di coordinamento', 'art. 92 c.1 lett. c'),
  N('coord', 'coord4', 'grave', 0, 'Impresa/lavoratore autonomo non comunicato al CSE',
    'Allontanare l\'impresa fino alla comunicazione al committente/CSE e alla verifica del POS e dell\'idoneità', 'artt. 90, 97'),
  N('coord', 'coord5', 'grave', 1, 'Impresa affidataria non verifica l\'applicazione del PSC da parte delle subappaltatrici',
    'L\'impresa affidataria provveda alla verifica e al coordinamento delle imprese esecutrici, dandone evidenza al CSE', 'art. 97')
];
