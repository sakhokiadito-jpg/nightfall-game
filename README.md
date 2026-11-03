# NIGHTFALL — multiplayer horror prototype

A small playable browser 3D prototype for up to 6 players:
- 1 killer + up to 5 survivors
- private room code (NF-XXXXXX)
- first/third-person camera toggle
- mobile joystick and touch camera look
- survivors activate 3 generators
- killer eliminates survivors at close range
- Socket.IO multiplayer server

## Run locally

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open the Vite URL printed in the terminal (usually http://localhost:5173).
The development server proxies Socket.IO to port 3000.

For a production build:

```bash
npm run build
npm start
```

Then open http://localhost:3000.

## Play with friends over the internet

This is source code, not a hosted live game. To play with friends, deploy the Node.js app to a host that supports persistent WebSocket connections (for example Render, Railway, or a VPS). Do not deploy the Socket.IO server as a Vercel serverless function.

Typical deployment:
1. Push this folder to a GitHub repository.
2. Create a new Web Service on Render/Railway from that repository.
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Use the public HTTPS URL and share it with friends.
6. One player creates a room and shares its ID; others enter the same ID.

## Current prototype limitations

- Low-poly placeholder characters and environment; original art/audio still needed.
- Room state is held in server memory; restarting the server clears rooms.
- No accounts, matchmaking, voice chat, anti-cheat, persistent progression, or reconnect recovery.
- Generator interaction currently advances the shared objective counter; each press represents a repair action.
- Collision, animation, weapon models, advanced AI, and production-grade security are not yet implemented.
- A host can start with 2–6 players. With 2 players, the match is 1 killer vs 1 survivor.
- This is a foundation for development, not a finished commercial game.

## iPhone notes

Open the deployed HTTPS link in Safari. Add to Home Screen if desired. The game is designed for touch controls, but actual performance and network behavior must be tested on the target device.
