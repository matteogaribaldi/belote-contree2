# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web-based multiplayer implementation of Belote Contrée, a French trick-taking card game. The application uses a client-server architecture with real-time communication.

**Tech Stack:**
- Backend: Node.js + Express + Socket.IO (backend/server.js)
- Frontend: Angular 17 + Socket.IO Client (frontend/)
- Communication: Real-time bidirectional events via WebSockets

## Development Commands

### Backend
```bash
cd backend
npm install           # Install dependencies
npm start             # Start server on port 3000
```

### Frontend
```bash
cd frontend
npm install           # Install dependencies
npm start             # Start dev server (http://localhost:4200)
npm run build         # Production build
npm test              # Run Karma tests
npm run watch         # Build with watch mode
```

## Architecture

### Backend Structure (backend/game/)

The backend is organized around game state management:

- **server.js** - Express server with Socket.IO event handlers. All client events (createRoom, joinRoom, startGame, placeBid, playCard, confirmTrick) are routed to RoomManager
- **RoomManager.js** - Core orchestrator managing rooms, players, bots, and game flow. Handles room lifecycle, bot AI triggering, and state broadcasting
- **GameLogic.js** - Pure game rules: card validation (isValidPlay), trick winner determination, scoring, and Belote/Rebelote detection
- **Deck.js** - Card deck operations: creation, shuffling, dealing, card values/ordering (trump vs normal)
- **BotPlayer.js** - Simple AI that makes bids (currently always passes) and plays valid cards randomly

### Frontend Structure (frontend/src/app/)

Angular routing-based UI flow:

- **Routing** (app.routes.ts):
  - `/` → LobbyComponent (create/join room)
  - `/waiting/:code` → WaitingRoomComponent (position selection, bot toggle, game start)
  - `/game/:code` → GameComponent (bidding, card play, trick confirmation)

- **services/socket.service.ts** - Socket.IO wrapper providing observables for all server events and emit methods for client actions

### Game Flow

1. **Room Setup**: Player creates room (gets 6-char code) or joins existing room
2. **Waiting Room**: Players choose positions (N/E/S/W), host can add bots, host starts game
3. **Bidding Phase**: Players bid on contract (80-160 points + suit) or pass. After 3 consecutive passes post-bid, bidding closes
4. **Card Play**: 8 tricks per hand. Players must follow suit, play trump if unable, and surpass trump if possible (French Belote rules)
5. **Trick Confirmation**: After each trick, all players must confirm before continuing (room.game.waitingForConfirmation, trickConfirmations)
6. **Hand Completion**: After 8th trick, score calculated. Contract team must meet bid or lose hand (capot)

### State Broadcasting

- **broadcastRoomState()** - Sends room info (players, positions, bots) during waiting phase
- **broadcastGameState()** - Sends personalized game state to each player (only their hand visible)

### Bot Integration

When a player disconnects during a game (handleDisconnect), they are automatically converted to a bot. Bots are triggered via setTimeout when it's their turn:
- Bidding: botBid() via placeBid()
- Playing: botPlay() via playCard()

### Card Rules (isValidPlay in GameLogic.js)

- Must follow suit if possible
- If cannot follow suit and have trump, must play trump (unless partner is winning)
- If playing trump over existing trump, must surpass if possible
- Special scoring: Belote/Rebelote (King+Queen of trump = 20 points)

## Key Implementation Details

- **Trump Card Ordering**: Jack and 9 are strongest in trump suit (see Deck.getCardOrder)
- **Hand Sorting**: Cards sorted by suit then rank (sortHands in RoomManager.js)
- **Disconnection Handling**: Players converted to bots mid-game to keep game playable
- **Trick Confirmation System**: Prevents race conditions by requiring all players to acknowledge trick results before proceeding (isLastTrick flag distinguishes final trick)
- **Score Calculation**: 162 total points per hand. Last trick worth +10. Contract team gets all points if successful, opponent gets 162 (+ belote if applicable) if contract fails

## Deployment on Render.com

### Prerequisites
1. Push your code to a GitHub repository
2. Create a free account on [Render.com](https://render.com)

### Deployment Steps

1. **Connect GitHub Repository**:
   - Go to Render Dashboard
   - Click "New +" → "Blueprint"
   - Connect your GitHub account and select this repository
   - Render will automatically detect `render.yaml` and create both services

2. **Configure Environment Variables**:
   After deployment, update the frontend service environment variable:
   - Go to Backend service → Copy the service URL (e.g., `https://belote-backend.onrender.com`)
   - Go to Frontend service → Environment → Add environment variable
   - Key: `BACKEND_URL`, Value: `<your-backend-url>`
   - Redeploy frontend service

3. **Update Backend CORS**:
   - Go to Backend service → Environment
   - Add `FRONTEND_URL` variable with your frontend URL (e.g., `https://belote-frontend.onrender.com`)
   - Redeploy backend service

### Important Notes

- **Free Tier Limitations**: Services spin down after 15 minutes of inactivity. First request after sleep takes ~30-60 seconds
- **Environment Files**: Socket URLs are configured via `frontend/src/environments/environment.prod.ts` (production) and `environment.ts` (development)
- **CORS Configuration**: Backend automatically uses production URLs when `NODE_ENV=production` (set in render.yaml)

### Manual Deployment (Alternative)

If not using Blueprint:

**Backend Service:**
- Type: Web Service
- Build Command: `cd backend && npm install`
- Start Command: `cd backend && npm start`
- Environment: `NODE_ENV=production`, `PORT=10000`

**Frontend Service:**
- Type: Static Site
- Build Command: `cd frontend && npm install && npm run build`
- Publish Directory: `frontend/dist/belote-frontend/browser`
