# GeoGiardini

App React + PWA per gestione aree verdi e dashboard admin.

## Avvio

1. Installa le dipendenze:
   ```bash
   npm install
   ```
2. Avvia il server di sviluppo:
   ```bash
   npm run dev
   ```

### Avvio locale completo

Per avviare sia frontend che backend in locale con le impostazioni già presenti in `.env.local`:

```bash
npm run local
```

In alternativa, `npm run server` ora carica automaticamente `.env.local` prima di avviare il backend.

## Struttura principale

- `src/App.tsx` definisce il routing dell'app
- `src/pages/LoginPage.tsx` è la schermata di login
- `src/pages/AdminPage.tsx` è la dashboard dell'amministratore
- `src/components/AuthField.tsx` contiene il campo di input riutilizzabile
- `src/styles/login.css` contiene gli stili principali
- `public/manifest.json` e `public/sw.js` abilitano la PWA

## Deploy su Vercel

Per pubblicare la nuova app su Vercel:

1. Crea un progetto su Vercel collegato a questo repository.
2. Usa il comando di build predefinito:
   ```bash
   npm run build
   ```
3. Assicurati che il progetto abbia queste variabili d'ambiente su Vercel:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
4. Vercel rileverà automaticamente il frontend statico e la funzione serverless in `api/[...slug].ts`.
5. Aggiungi l'app alla home del telefono dal browser usando l'URL Vercel pubblico.

> Il file `Codici.txt` rimane locale e non viene caricato su Vercel perché è ignorato da `.gitignore`.
