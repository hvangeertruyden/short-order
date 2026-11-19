# Short Order

A chaotic two-player co-op diner game. One cooks, one serves, and neither can fix the other's mess.
Built from `short-order-design-doc.md` (v0.2): plain JavaScript + Three.js (CDN), PeerJS for online play. No build step.

## Run it
Double-click `start.command`, or run:

    python3 serve.py

and open http://localhost:8080.

## Play with a friend
1. **Host a shift**: you get a 4-letter room code and a link.
2. Your friend opens the link (or types the code and clicks **Join**).
3. Online play over the internet: the game files need to be reachable by your friend, so host the folder
   on any static host (Cloudflare Pages, Netlify, GitHub Pages). Matchmaking goes through PeerJS's free
   public server, and gameplay runs peer-to-peer.
On the same Wi-Fi, your friend can open `http://<your-mac-ip>:8080`.

**Practice solo** lets one person play both sides (Tab swaps between cook and server).

## Controls
WASD walk · drag to look (or Q/E) · hover objects to see actions · click or 1–6 to act ·
G = drop what you're holding (it lands on the floor; pick it back up) ·
Enter = staff chat · T = type to a customer · Esc = close · H = help · M = mute

## Where things live
- `js/data.js`: **all tunable content**: menu, **RECIPES** (every step of every dish), ingredient sources, prices, layout, events, director pacing, NPC lines
- `js/kitchen.js`: the recipe engine, plating, drinks, dropping/picking up
- `js/models.js`: every 3D model (food stages, containers, appliances)
- `js/jelly.js`: the jelly characters and their walking animation
- `js/sim.js`: game rules (host-authoritative simulation)
- `js/actions.js`: what each object offers each role (the hover menu)
- `js/world.js`: low-poly 3D diner and models
- `js/ui.js`, `css/style.css`: HUD, receipts, chats, summary
- `js/net.js`: PeerJS networking · `js/audio.js`: synthesized sounds
