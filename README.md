# Nightstand Scrabble

A two-player Scrabble game for Junghyun and Hailey, played on two phones before
bed. One self-contained HTML page, no accounts, no install: open the link and
the game is there.

The point of it is the dictionary. Every Scrabble app ships the tournament word
list, where QI, ZA, XU and QAT are worth knowing and ordinary English is not.
Here a word gets in only if it is spelled validly, turns up in real usage, and
has a meaning the game can show you. Tap any word you played to read what it
means, in English and often in Korean.

## Running it

```sh
python3 build.py        # src/template.html + data/dictionary.json -> dist/index.html
npm install             # once, for the tests
npm test                # rules engine, then the whole page in a headless browser
```

`dist/index.html` is the whole game. Drag it onto Netlify and it is live.

## Layout

| Path | What it is |
|---|---|
| `src/template.html` | The game: board, rules, clock, sync, screens. The only file to edit. |
| `data/dictionary.json` | 48,146 words with definitions, examples and Korean glosses. |
| `build.py` | Drops the dictionary into the template's placeholder. |
| `test/run.js` | Plays a full game against itself, then loads the page and starts one. |
| `dist/index.html` | The built page. This is what gets deployed. |
| `scripts/firebase-rules.js` | Prints the database rules for a passphrase (`npm run rules`). |
| `scripts/deploys-left.js` | Counts Netlify deploys left this credit period (`npm run deploys`). |
| `netlify.toml` | Tells Netlify to publish `dist/`. |

The dictionary lives in the page rather than behind an API so that definitions
open instantly and work with no signal. It costs 3.4 MB, which compresses to
1.2 MB and is fetched once.

## How two phones stay in sync

There is no game server. Both phones write to one Firebase Realtime Database
and each works out the same game from the same short record:

```
S5.BED.1.900.rs.3.1.P76C77A78T@28,P88O98P@74,...
```

Room, settings, start time, game number, who opened, then every move with the
second it was played. Tiles are shuffled from a seed of `room + game number`,
so both phones deal the same rack without ever sending one. Clocks are computed
from those timestamps rather than counted locally, which is why they agree.

Everything is stored under `/s/<key>`, where the key is a SHA-256 hash of a
passphrase only the two phones know. Each phone asks for it once and keeps the
hash, never the passphrase. The Firebase rules allow that one path, limited to
strings under 4000 characters, and refuse everything else, including listing
what the database holds. The database URL is in the page source, but without
the passphrase there is nothing there to find.

`npm run rules` asks for the passphrase and prints the rules to paste into
Firebase console > Realtime Database > Rules. Neither the passphrase nor its hash
belongs in this repo.

Games used to live under `/g/`, open to anyone. On first unlock a phone copies
anything still there into the new location, filling only empty slots.
`npm run rules -- --final` prints the rules with `/g/` closed.

## Rules that differ from Scrabble

Decided over many evenings of playing it:

- **Scoring is just the words you made.** No penalty for tiles left in hand, no
  taking your partner's leftovers. The number on screen is the final number.
- **Emptying your rack is worth 20** and passes play to whoever still has tiles.
  It does not end the game, and both players can earn it in one game.
- **A game ends** when neither of you holds a tile, when neither of you can play,
  or on the clock.
- **The clock is a chess clock.** At zero your partner gets a final minute, but
  only if they are behind; if they are already ahead the game ends there.
- **Geography is on**: countries, nationalities, capitals, US cities over
  100,000 and US states. Two-word names run together, so `MEXICOCITY` counts.
- **The best move you missed** is worked out after every move and shown as boxes.
  It opens the moment that exact move is no longer available, which means a word
  your partner missed can become yours.

Full history is in the release notes inside the game.

## Making changes

Edit `src/template.html`, run `python3 build.py`, run `npm test`, then deploy
`dist/index.html`. The tests catch the two things that have actually broken
before: a rule quietly doing the wrong thing, and a line of setup code that
throws on load and takes the screen with it.

The dictionary was built from WordNet, Wordset, kengdic and wordfreq, but those
build scripts are gone and `data/dictionary.json` is the only copy. Don't change
the word list by hand: editing one entry skips whatever the pipeline did for that
word's other forms, which is how HURLED came to be playable while HURL was not.
Widening the list means rebuilding the pipeline from scratch, so treat it as its
own project.

For reading the file: `words` and `geo` are newline-joined lists where each entry starts with a character giving how many letters it shares
with the entry before it (`0` means none, `1` one, and so on), so they stay
small; `defs` and `ko` are keyed by the base form of a word.
