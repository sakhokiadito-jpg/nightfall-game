# NIGHTFALL — browser multiplayer horror prototype

## Render
Build command: `npm install && npm run build`
Start command: `npm start`
Runtime: Node. Root directory: blank.

## GitHub
Upload the contents of this folder into the repository root. Do not upload the outer folder itself as an extra nested level.

## Included
- Multiplayer rooms with five-character codes, up to six players.
- Random killer assignment at match start.
- Three-dimensional low-poly forest, two cabins, abandoned hospital, road and four generators.
- Mobile joystick, touch camera, keyboard controls and sprint stamina.
- Survivor health/stamina/heartbeat HUD and item selection.
- Three completed generators unlock the exit.
- Killer melee attack; survivor stun chance (60%); downed and revive states.
- Four trap types with separate 20-second server cooldowns and contact damage.
- Basic escape and match result events.

## Prototype status
This is an early playable foundation, not a finished game. Generator repair is a simplified repeated tap, not a 35-second repair sequence. Revive is instant with a cooldown, not a timed animation. Hiding wardrobes, unique trap effects, trap cooldown countdown UI, detailed animations, audio, footsteps, hunt tracking, proper networking interpolation and production-grade anti-cheat are not yet implemented. The selected medkit and machete do not yet have unique item behavior. Test with two separate browser sessions.

## 3D models
The supplied GLB models are not embedded in this archive yet. Put licensed `.glb` files in `public/assets/` after checking them, then integrate them in `src/main.js`.
