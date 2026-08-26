# Deck of Gains 💪📈

Welcome to **Deck of Gains**, the app that turns a deck of cards into your personal trainer. Forget spreadsheets and boring routines—this is where fitness meets chaos and card tables. Whether you’re here to spice up your workouts, dominate your fitness tribe, or just prove how rugged you are, **Deck of Gains** has you covered.

The casino theme is the default and is applied on the first render, while saved or URL-selected themes are restored immediately during startup.

**NOTE:** Almost everything you see here is AI-generated. I make no guarantees of code quality or correctness!

## What It Does 🎲

1. Draw cards from a virtual deck.
2. Each card assigns an exercise and reps based on its suit and value:
   - **♥️ Hearts**: Jumping Jacks
   - **♠️ Spades**: Squats
   - **♦️ Diamonds**: Pushups
   - **♣️ Abs**: Abs (and yes, the reps are doubled because we’re savage like that).
3. Complete all the exercises in each round, then keep drawing until the deck is done.
4. **Last round?** Draw 8 cards and do TWO sprints, because why not?
5. When the deck is done, it’s BURPEE TIME. Keep going until your soul leaves your body (or the clock says 30 minutes, whichever comes first).

## The Rugged Theme 🪓🔥

You think you’re hardcore? You’re not rugged enough until you hit **Deck of Gains** with the `?theme=rugged` query param (the classic `?rugged=true` link still works for your old bookmarks). This mode transforms the app into something that looks like it crawled out of a Viking gym.

Here’s what the **Rugged Theme** brings:

- A dark, smoky background to remind you of the battlefield of gains.
- Fiery orange and gold highlights that scream, "I EAT BURPEES FOR BREAKFAST."
- Hover effects on cards so epic they might just make you flex involuntarily.
- `Tektur` for rugged display elements like headings, buttons, cards, and rep counts.
- `Google Sans Code` for rugged copy and controls so the setup and workout details stay readable.

Activate the **Rugged Theme** and prove you’re ready to enter the tribe of legends.

## How to Use 🛠️

1. Open the app in your browser.
2. **Add to Home Screen** for a full-screen experience (especially on iOS).
3. Hit "Draw Cards" and let the pain begin.
4. Once the deck is done, hit "New Set" to start over with the same theme and settings—or collapse in glory.
5. Want to switch it up? Add `?theme=plain` for the minimal look or `?theme=rugged` for the warrior’s playground (the legacy `?rugged=true` still works).
6. On landscape tablets and larger screens, the drawn cards stay on the left in a 2x2 grid while the rep summary sits on the right in its own 2x2 grid with oversized counts that scale with the tile size, the exercise name underneath, and zeroes shown for any exercise not in the current draw.
7. Your configuration _and_ active workout are mirrored in the URL, so refreshing the page or sharing the link drops you—and your unsuspecting friends—right back into the current round. Suits are shortened to `h/s/d/c` codes to keep those links lean, invalid card values are ignored when restoring state, auto-draw resumes from the `autoRemainingSeconds` value when present, and your latest configuration is cached locally so it comes back on a plain reload (URL settings still win).
8. Want real-time sync across devices? Use the "Create or join a group" box to enter a room name, or add `?room=YOURCODE` to the URL. Everyone in the same room stays in lockstep, and the server state is treated as the source of truth when a room is present. Hitting "New Set" in a room resets the room state for everyone. The sync host defaults to `http://localhost:4000` when running on localhost/127.0.0.1, otherwise it uses `https://sync.deck.fitness`, and you can override it with `?sync=https://your-sync-host`. If the sync server health check (`/healthz`) fails, the sync controls are disabled.

To run it locally with Node:

```sh
npm run dev
```

Then open `http://127.0.0.1:8000/index.html`.

## Auto-Draw & Sound FX 🎧

- Toggle **Auto-Draw** from the configuration screen to automatically draw the next hand for you. The controls live inside the **Mode** section and the interval picker only appears when auto-draw is enabled, letting you set minutes and seconds (defaulting to 2 minutes 30 seconds) without fussing over decimals.
- A live countdown appears on the **Draw Cards** button whenever auto-draw is active, so you know exactly when the next hand will hit.
- Every draw now rides the same clean **whoosh** sound effect. Pull four cards and you'll hear four whooshes; pull eight and the audio ramps up to match with each whoosh spaced just enough apart to land distinctly.

## Analytics & Privacy 📊

Deck of Gains uses a self-hosted Umami instance to understand whether people start, progress through, resume, and complete workouts. Analytics pageviews represent the setup and workout screens instead of every URL state update. Workout state, deck contents, sync hosts, and room names are excluded from analytics URLs and custom-event data; standard `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, and `utm_content` values are retained for campaign attribution.

The app stores a random anonymous browser identifier in `localStorage` under `deckOfGains:analyticsId` so repeat use can be measured across visits. It contains no account or profile information. Clearing the site's browser data resets the identifier, and browsers with Do Not Track enabled neither create the identifier nor send app-managed analytics.

Umami also samples session replays and heatmaps. Form inputs are masked, the group-join area is excluded from recording, and recordings are used to diagnose interaction and layout issues. Core Web Vitals are collected to monitor real-world loading, responsiveness, and visual stability.

On Netlify, `/analytics/*` is proxied to the configured Umami service without a build step. The app remains fully functional when that proxy is unavailable; analytics initialization emits one console warning, then tracking stays disabled without creating an anonymous identifier or loading the replay recorder.

## Why This Exists 🤔

Because working out should be fun. Or at least unpredictable. Or, at the very least, rugged.

Fitness doesn’t have to mean monotonous reps and boring routines. It should feel like a fight scene from a medieval epic. Or a high-stakes poker game where the stakes are your quads. Whatever you envision, **Deck of Gains** is here to spice up your sweat sessions.

## Pro Tips 🧠

- **Short on time?** Sprint harder.
- **Don’t skip abs.** You’ll regret it later.
- **Feeling heroic?** Rugged Theme is your calling.
- **Need focus?** Plain Theme keeps things clean and calm.
- **Invite friends.** Nothing says "bonding" like screaming through burpees together.

## License 📜

Deck of Gains is MIT-licensed. That means it's free to use, free to share, and always free to bring the pain. Just don’t blame us for your DOMS (Delayed Onset Muscle Soreness)

**Now stop reading and start sweating.**
