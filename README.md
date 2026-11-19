# Short Order

A chaotic two-player co-op diner game. One cooks, one serves, and neither can fix the other's mess.
Built from `short-order-design-doc.md` (v0.2): plain JavaScript + Three.js (CDN), PeerJS for online play. No build step.

## Run it
Double-click `start.command`, or run:

    python3 serve.py

and open http://localhost:8080.

## Play online
**https://hvangeertruyden.github.io/short-order/**: hosted on GitHub Pages, updates a minute after each push.

To publish changes:

    python3 deploy.py          # stamps file versions so browsers skip their cache
    git add -A && git commit -m "what changed" && git push

## Play with a friend
1. **Host a shift**: you get a 4-letter room code and a link.
2. Your friend opens the link (or types the code and clicks **Join**).
3. Over the internet, just use the GitHub Pages link above. Matchmaking goes through PeerJS's free
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
- `js/world.js`: the 3D diner (layout, lights, live objects)
- `js/furnish.js`: swaps in the downloaded models from `models/` · `js/decor.js`: signs, ads, fans, steam
- `js/ui.js`, `css/style.css`: HUD, receipts, chats, summary
- `js/net.js`: PeerJS networking · `js/audio.js`: synthesized sounds

## Sound credits
Sound effects in `sounds/` are from the Pixabay / Freesound community: bell, deep fryer, bacon (griddle sizzle),
toaster pop, blender, fridge open + close, mopping, washing dishes, soda pour (freesound_community), beep (musheran) and button click (universfield). Background music streams from
archive.org (no license listed; replace before any real release).

## 3D model credits
Detailed furniture and props in `models/` come from Sketchfab and load in `js/furnish.js`
(the hand-built pieces stay underneath as click targets and as a fallback). Thank you to:

| Model | Author | License |
|---|---|---|
| [Retro Diner Booth](https://sketchfab.com/3d-models/retro-diner-booth-8ef32cec40304720a6ba18e186b49dbc) | deleted_cube | CC BY 4.0 |
| [Retro Diner Table Set](https://sketchfab.com/3d-models/retro-diner-table-set-307918ddc85645da9805b105584ee77b) | deleted_cube | CC BY 4.0 |
| [Commercial Kitchen Props](https://sketchfab.com/3d-models/commercial-kitchen-props-30cd4c6767f64e9db2cd9ee4b09eee32) (griddles, fryer, freezer) | Courvee (@AndreiTrunov) | **CC BY-NC 4.0** (non-commercial only) |
| [Retro Fridge](https://sketchfab.com/3d-models/retro-fridge-3b130f0ba4304966a101c82be2429cc7) (maker's badge removed) | dylanheyes | CC BY 4.0 |
| [Silverware (Spoon, Fork, Knife)](https://sketchfab.com/3d-models/silverware-spoon-fork-knife-76a43250dd694d2fa1e109124d75b6ad) | Fridge (@youssefdarwish01) | CC BY 4.0 |
| [Fast Food Soda Cup](https://sketchfab.com/3d-models/fast-food-soda-cup-363537b2f81f43259aa587c8c5663c8e) | Adam.White | CC BY 4.0 |
| [Coffee pot](https://sketchfab.com/3d-models/coffee-pot-78cf3e058a0c4ff6a66652ee7657b3a9) | Virtual Museums of Małopolska | CC BY 4.0 |
| [Textured Napkin Dispenser](https://sketchfab.com/3d-models/textured-napkin-dispenser-83179d6069144ef2bf74c774dffa77c8) | Rachel Waag | CC BY 4.0 |
| [Condiments](https://sketchfab.com/3d-models/condiments-eb37199b60434b5395da7338e68e15f3) | WillowBoxArt | CC BY 4.0 |
| [Pancake - Food/SWC4](https://sketchfab.com/3d-models/pancake-foodswc4-8316d507d6334b14b7232e9b806a950e) | felixyadomi | CC BY 4.0 |

Models were rescaled, recoloured (tabletops) or trimmed (stray props) to fit the game.
The kitchen props pack is non-commercial: replace it before Short Order is ever sold.
