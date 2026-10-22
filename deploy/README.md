# Pubblicazione gratuita

`render.yaml` prepara un servizio Node Free (frontend e API insieme, HTTPS). PostgreSQL è su Neon Free, Redis su Upstash Free. Nessun piano a pagamento autorizzato. Il percorso Blueprint e la cache Render richiedono una carta su questo account: usare la creazione manuale del Web Service Free copiando comandi e impostazioni dal file YAML, senza aggiungere carte.

1. Collegare solo il repository GitHub di lavoro RadioHub a un Web Service Render Free, runtime Node, regione Frankfurt, root del repository. Build/start come in `render.yaml`, health `/api/health`, auto-deploy dopo CI riuscita.
2. Creare un database PostgreSQL 17 su Neon Free; copiare la connessione diretta con TLS in `DATABASE_URL` nei segreti Render.
3. Creare Redis su Upstash Free; impostare `REDIS_URL` con la connessione `rediss://` (TLS). Inserire in Render `FM_WORLD_TOKEN`, `AI_API_KEY` e un nuovo `JWT_SECRET` casuale. Non caricare `.env` su GitHub.
4. Render installa e compila backend/frontend, applica le migrazioni e avvia il server. `STATIC_DIR` abilita il frontend sullo stesso indirizzo delle API. L'origine Render è riconosciuta automaticamente; per un dominio personalizzato impostare `CORS_ORIGINS` con gli indirizzi HTTPS esatti.
5. Dopo il deploy verificare `/api/health`, accesso, ricerca, audio, notizie e installazione PWA. I deploy successivi attendono i controlli GitHub.

Il database online parte vuoto: le migrazioni creano le tabelle, il backend importa le notizie. Gli account e i preferiti locali non vengono trasferiti. Docker Compose sul Mac continua a funzionare separatamente.

## Limiti

- Render Free sospende il backend dopo 15 minuti senza visite; il primo accesso successivo può richiedere circa un minuto. Il job ogni cinque minuti opera soltanto mentre il processo è attivo: questa soluzione non offre aggiornamenti continui 24 ore su 24.
- Neon Free ha limiti di spazio e calcolo; Render Free ha limiti di traffico/build. Senza carta, un superamento può sospendere il servizio anziché generare costi aggiuntivi. Non selezionare upgrade automatici.
- La cache gratuita non è persistente: al riavvio si ricostruisce; utenti, preferiti e notizie restano in PostgreSQL.
- L'hosting gratuito non rende gratuite le chiamate OpenAI. Per una demo senza chiamate AI a pagamento impostare `LLM_PROVIDER=mock`; in quel caso ricerca AI e domande alle notizie non sono disponibili. Le radio vere richiedono il token FM-World.
- Gli stream forniti soltanto in HTTP possono essere bloccati dal browser su una pagina HTTPS. Il player non inoltra gli stream attraverso il backend.

Fonti: [Render Free](https://render.com/docs/free), [Neon Free](https://neon.com/pricing), [Blueprint](https://render.com/docs/blueprint-spec).
