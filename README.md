# Deck of Gains 💪📈

Welcome to **Deck of Gains**, the app that turns a deck of cards into your personal trainer. Forget spreadsheets and boring routines—this is where fitness meets chaos and card tables. Whether you’re here to spice up your workouts, dominate your fitness tribe, or just prove how rugged you are, **Deck of Gains** has you covered.

**NOTE:** Almost everything you see here is AI-generated. I make no guarantees of code quality or correctness!

## What It Does 🎲
1. Draw cards from a virtual deck.
2. Each card assigns an exercise and reps based on its suit and value:
   - **♥️ Hearts**: Jumping Jacks
   - **♠️ Spades**: Squats
   - **♦️ Diamonds**: Pushups
   - **♣️ Abs**: Abs (and yes, the reps are doubled because we’re savage like that).
3. Complete all the exercises and finish the round with a 50-yard sprint.
4. **Last round?** Draw 8 cards and do TWO sprints, because why not?
5. When the deck is done, it’s BURPEE TIME. Keep going until your soul leaves your body (or the clock says 30 minutes, whichever comes first).

## The Rugged Theme 🪓🔥
You think you’re hardcore? You’re not rugged enough until you hit **Deck of Gains** with the `?theme=rugged` query param (the classic `?rugged=true` link still works for your old bookmarks). This mode transforms the app into something that looks like it crawled out of a Viking gym.

Here’s what the **Rugged Theme** brings:
- A dark, smoky background to remind you of the battlefield of gains.
- Fiery orange and gold highlights that scream, "I EAT BURPEES FOR BREAKFAST."
- Hover effects on cards so epic they might just make you flex involuntarily.
- Fonts so bold you’ll think they’ve been benching their whole life.

Activate the **Rugged Theme** and prove you’re ready to enter the tribe of legends.

## How to Use 🛠️
1. Open the app in your browser.
2. **Add to Home Screen** for a full-screen experience (especially on iOS).
3. Hit "Draw Cards" and let the pain begin.
4. Once the deck is done, hit "New Set" to start over with the same theme and settings—or collapse in glory.
5. Want to switch it up? Add `?theme=plain` for the minimal look or `?theme=rugged` for the warrior’s playground (the legacy `?rugged=true` still works).
6. Your configuration *and* active workout are mirrored in the URL, so refreshing the page or sharing the link drops you—and your unsuspecting friends—right back into the current round. Suits are shortened to `h/s/d/c` codes to keep those links lean, invalid card values are ignored when restoring state, auto-draw resumes from the `autoRemainingSeconds` value when present, and your latest configuration is cached locally so it comes back on a plain reload (URL settings still win).
7. Want real-time sync across devices? Use the "Create or join a group" box to enter a room name, or add `?room=YOURCODE` to the URL. Everyone in the same room stays in lockstep, and the server state is treated as the source of truth when a room is present. Hitting "New Set" in a room resets the room state for everyone. The sync host defaults to `http://localhost:4000` when running on localhost/127.0.0.1, otherwise it uses `https://sync.deck.fitness`, and you can override it with `?sync=https://your-sync-host`. If the sync server health check (`/healthz`) fails, the sync controls are disabled.

To run it locally with Node:

```sh
npm run dev
```

Then open `http://127.0.0.1:8000/index.html`.

## Auto-Draw & Sound FX 🎧
- Toggle **Auto-Draw** from the configuration screen to automatically draw the next hand for you. The controls live inside the **Mode** section and the interval picker only appears when auto-draw is enabled, letting you set minutes and seconds (defaulting to 2 minutes 30 seconds) without fussing over decimals.
- A live countdown appears on the **Draw Cards** button whenever auto-draw is active, so you know exactly when the next hand will hit.
- Every draw now rides the same clean **whoosh** sound effect. Pull four cards and you'll hear four whooshes; pull eight and the audio ramps up to match with each whoosh spaced just enough apart to land distinctly.

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
