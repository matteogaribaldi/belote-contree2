# 🚀 Render.com Deployment Checklist

## ⚠️ Problemi Identificati e Soluzioni

### 1. **Discrepanza URL Backend**

**Problema:** L'URL del backend nel file `frontend/src/environments/environment.prod.ts` potrebbe non corrispondere all'URL effettivo su Render.

**File corrente:**
```typescript
// frontend/src/environments/environment.prod.ts
export const environment = {
  production: true,
  socketUrl: 'https://belote-backend-ylqd.onrender.com'
};
```

**Verifica necessaria:**
1. Vai su Render Dashboard → Service "belote-backend"
2. Copia l'URL effettivo del servizio (dovrebbe essere qualcosa come `https://belote-backend.onrender.com` o `https://belote-backend-XXXX.onrender.com`)
3. Aggiorna `frontend/src/environments/environment.prod.ts` con l'URL corretto

**Se l'URL è `https://belote-backend.onrender.com`:**
```typescript
export const environment = {
  production: true,
  socketUrl: 'https://belote-backend.onrender.com'
};
```

---

### 2. **Configurazione CORS Migliorata** ✅

**Applicata:** Il backend ora gestisce correttamente CORS per produzione e sviluppo.

**Configurazione attuale:**
- Development: `http://localhost:4200`, `http://localhost:3000`
- Production: Usa `FRONTEND_URL` da variabili ambiente (default: `https://belote-frontend.onrender.com`)

---

### 3. **Variabili Ambiente su Render**

**Verifica su Render Dashboard:**

#### Backend Service (`belote-backend`):
- ✅ `NODE_ENV=production`
- ✅ `PORT=10000`
- ✅ `FRONTEND_URL=https://belote-frontend.onrender.com`
- ✅ `DATABASE_URL` (collegato automaticamente da belote-db)

#### Frontend Service (`belote-frontend`):
- **NON servono** variabili ambiente (è una static site)
- L'URL del backend è hardcoded in `environment.prod.ts`

---

### 4. **Database PostgreSQL**

**Stato:** Configurato nel `render.yaml`
- Nome: `belote-db`
- Piano: Free tier
- Collegato automaticamente al backend tramite `DATABASE_URL`

**Nota:** Il messaggio "DATABASE_URL not configured" indica che il database PostgreSQL non è attivo o non è collegato correttamente.

**Verifica:**
1. Su Render Dashboard, vai su "belote-db"
2. Verifica che sia nello stato "Available"
3. Vai su "belote-backend" → Environment → Verifica che `DATABASE_URL` sia collegato

---

### 5. **Build e Deployment**

**Comandi corretti (già configurati in render.yaml):**

Backend:
```yaml
buildCommand: cd backend && npm install
startCommand: cd backend && npm start
```

Frontend:
```yaml
buildCommand: cd frontend && npm install && npm run build
staticPublishPath: ./frontend/dist/belote-frontend/browser
```

---

### 6. **Free Tier Limitations**

⚠️ **Importante:** I servizi gratuiti su Render vanno in sleep dopo 15 minuti di inattività.

**Impatto:**
- Prima richiesta dopo sleep: 30-60 secondi per il riavvio
- Socket.IO potrebbe disconnettersi durante lo sleep
- Non raccomandato per partite in corso durante periodi di inattività

**Soluzioni:**
1. Upgrade a piano a pagamento
2. Usare un servizio di "keep-alive" (ping periodico)
3. Avvisare gli utenti del possibile ritardo iniziale

---

## 🔧 Passi per Correggere il Problema "Non riesco a creare tavolo"

### 1. Verifica URL Backend
```bash
# Apri il file e verifica l'URL
cat frontend/src/environments/environment.prod.ts
```

Se l'URL non corrisponde a quello effettivo su Render, aggiorna il file e fai un nuovo deploy.

### 2. Verifica Logs su Render

**Backend logs da controllare:**
- ✅ "Server in ascolto sulla porta 10000"
- ✅ "Database pool created" (se database configurato)
- ❌ "CORS blocked origin: ..." (indica problema CORS)
- ❌ Errori di connessione Socket.IO

**Frontend logs (Browser DevTools):**
- ❌ "Failed to load resource: net::ERR_CONNECTION_REFUSED"
- ❌ "WebSocket connection failed"
- ❌ CORS errors

### 3. Test Endpoint REST

Verifica che il backend sia raggiungibile:
```bash
# Sostituisci con il tuo URL effettivo
curl https://belote-backend.onrender.com/api/stats
```

Dovrebbe restituire JSON con statistiche (anche vuote).

### 4. Test WebSocket Connection

Apri DevTools → Network → WS (WebSocket)
- Dovresti vedere una connessione a `wss://belote-backend.onrender.com`
- Status: 101 Switching Protocols

---

## 📋 Checklist Finale

- [ ] Verificato URL backend su Render Dashboard
- [ ] Aggiornato `environment.prod.ts` con URL corretto
- [ ] Verificato che `DATABASE_URL` sia collegato
- [ ] Fatto redeploy di frontend dopo modifica URL
- [ ] Testato endpoint `/api/stats` tramite curl/browser
- [ ] Verificato connessione WebSocket in DevTools
- [ ] Testato creazione tavolo su produzione
- [ ] Verificato che i log su Render non mostrino errori

---

## 🆘 Se il problema persiste

1. **Controlla i logs su Render:**
   - Backend: Dashboard → belote-backend → Logs
   - Database: Dashboard → belote-db → Logs

2. **Verifica che il servizio sia attivo:**
   - Vai su Render Dashboard
   - Verifica che "belote-backend" sia nello stato "Live"
   - Se è in "Suspended", riattivalo

3. **Testa localmente prima:**
   - Il gioco funziona su `http://localhost:4200`? ✅
   - Se sì, il problema è nella configurazione Render
   - Se no, il problema è nel codice

---

## 📞 Supporto

Se hai bisogno di aiuto:
1. Condividi i logs di Render (sia backend che frontend)
2. Condividi gli errori dal Browser DevTools (Console e Network)
3. Verifica l'URL effettivo del backend service su Render
