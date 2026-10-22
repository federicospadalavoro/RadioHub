# Utilizzo dell'intelligenza artificiale

## Strumenti utilizzati

Sono stati utilizzati ChatGPT e Codex durante lo sviluppo di RadioHub, per confronto su scelte tecniche, documentazione e modifiche.
è stata anche usata la generazione di immagini per esplorare proposte grafiche prima di implementare l'interfaccia e lo stile.
L'assistenza AI ha riguardato parti come test, styling, configurazioni, e parti di coding frontend e backend.

## Funzioni AI presenti nell'app

L'uso dell'AI durante lo sviluppo è distinto dalle tre funzioni disponibili nell'app:

1. **Riassunti delle notizie.** Il backend invia titolo e contenuto al provider, chiedendo un riassunto in italiano di 2–3 frasi basato sui fatti forniti. Il risultato viene salvato in PostgreSQL e riutilizzato, evitando di rigenerarlo a ogni visualizzazione.
2. **Ricerca radio in linguaggio naturale.** Il modello trasforma la richiesta in parametri di ricerca: nome, genere, paese e limite dei risultati. È poi il backend a interrogare FM-World.
3. **Domande sulle notizie.** Il modello estrae alcune parole chiave; il backend cerca le notizie corrispondenti in PostgreSQL e seleziona fino a cinque fonti. Il modello formula la risposta usando quei contenuti e l'interfaccia mostra le fonti utilizzate. Non viene inviato l'intero archivio.

Il provider si seleziona con `LLM_PROVIDER`. La modalità `mock` produce riassunti dimostrativi riconoscibili, senza chiamate esterne; ricerca radio AI e domande sulle notizie richiedono OpenAI configurato. Modello, reasoning, endpoint, timeout e limiti sono configurabili tramite ambiente. La chiave API viene utilizzata soltanto dal backend.

## Verifiche e limiti

Durante lo sviluppo sono stati eseguiti controlli TypeScript, ESLint e formattazione, test backend e frontend e test end-to-end con Playwright. I test automatici delle funzioni AI usano il mock o risposte simulate: verificano il comportamento del codice senza effettuare chiamate AI.

Il codice limita gli input, imposta timeout e richiede risposte strutturate. I prompt dei riassunti e delle risposte sulle notizie indicano di trattare i contenuti ricevuti come dati, ignorando eventuali istruzioni al loro interno. 