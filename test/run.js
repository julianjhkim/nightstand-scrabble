#!/usr/bin/env node
/* Checks dist/index.html two ways: the rules engine on its own, then the whole
   page in a headless browser. Most bugs this project has had were either a
   rule quietly doing the wrong thing or a line of setup code that threw on
   load and took the rest of the screen with it, so both halves earn their
   keep.

       npm test            (after: python3 build.py)
*/

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'dist', 'index.html');

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '   ' + detail : ''}`);
  if (!ok) failed++;
};

if (!fs.existsSync(PAGE)) {
  console.error('dist/index.html is missing. Run:  python3 build.py');
  process.exit(1);
}
const html = fs.readFileSync(PAGE, 'utf8');

/* ---------------------------------------------------------------- engine --
   The page guards its exports with `typeof module`, so the same script that
   runs in a browser can be required here and poked at directly.            */

const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const enginePath = path.join(os.tmpdir(), 'nightstand-engine.js');
fs.writeFileSync(enginePath, script);
const E = require(enginePath);

console.log('\nengine');
const dict = E.buildDict(1);
const plain = E.buildDict(0);
const words = E.prepWords(dict);
const tile = (r, c, L) => ({ r, c, L, blank: false });
const lay = (w, r, c) => [...w].map((L, i) => tile(r, c + i, L));
const emptyBoard = () => new Array(225).fill(null);

check('dictionary loaded', dict.size > 40000, `${dict.size.toLocaleString()} words`);
for (const w of ['hurl', 'hurled', 'satiety', 'kimchi', 'queso', 'glum']) {
  check(`${w} is playable`, plain.has(w));
}
for (const w of ['qi', 'za', 'qat', 'zaire']) {
  check(`${w} is not`, !plain.has(w));
}
for (const w of ['newyork', 'oslo', 'ohio', 'korean']) {
  check(`${w} needs geography`, dict.has(w) && !plain.has(w));
}
/* Some place names are ordinary words too and stay playable either way. */
for (const w of ['china', 'turkey', 'boston', 'texas']) {
  check(`${w} plays with geography off`, plain.has(w));
}

const bingo = E.evaluate(emptyBoard(), lay('STRANGE', 7, 4), dict);
check('seven tiles score the 50 bonus', bingo.ok && bingo.bingo && bingo.score === 66,
      `${bingo.score} pts`);

const first = E.evaluate(emptyBoard(), lay('CAT', 0, 0), dict);
check('first word must cross the star', !first.ok && first.err === 'center');

const roundTrip = { room: 'TEST', level: 1, clock: 900, startAt: 1000, gameNo: 3,
                    first: 1, moves: [{ t: 'P', tiles: lay('CAT', 7, 6), dt: 40 }] };
const decoded = E.decodeGame(E.encodeGame(roundTrip));
check('a game survives being written down and read back',
      decoded.gameNo === 3 && decoded.first === 1 && decoded.moves.length === 1);

/* A whole game, played by the solver against itself. Tile counts are checked
   after every move: a bag that quietly gains or loses tiles is the kind of
   fault that only shows up as a weird endgame hours later. */
const game = { room: 'SELFPLAY', level: 1, clock: 0, startAt: 0, gameNo: 1, first: 0, moves: [] };
let state = E.replay(game, dict, 0);
let move = 0;
let tilesHeld = true;
while (!state.ended && move < 80) {
  const best = E.findBest(state.board, state.racks[state.turn], dict, words, 500);
  if (best.best) game.moves.push({ t: 'P', tiles: best.best.tiles, dt: move });
  else if (state.left > 0) game.moves.push({ t: 'E', letters: state.racks[state.turn].slice(0, 3), dt: move });
  else game.moves.push({ t: 'X', dt: move });
  state = E.replay(game, dict, move + 1);

  const seen = {};
  for (const t of state.board) if (t) seen[t.blank ? '_' : t.L] = (seen[t.blank ? '_' : t.L] || 0) + 1;
  for (const rack of state.racks) for (const c of rack) seen[c] = (seen[c] || 0) + 1;
  const total = Object.values(seen).reduce((a, b) => a + b, 0) + state.left;
  if (total !== 100) { tilesHeld = false; break; }
  move++;
}
check('a full game ends on its own', state.ended, `${move} moves, ${state.reason}`);
check('all 100 tiles stay accounted for', tilesHeld);
check('both players scored', state.scores[0] > 0 && state.scores[1] > 0, state.scores.join(' : '));

/* Emptying your rack is worth 20 and hands over; it does not end the game. */
const outs = state.log.filter(l => l.type === 'OUT');
check('rack bonus only on a tile-out finish',
      state.reason === 'out' ? outs.length > 0 : outs.length === outs.length,
      outs.map(o => `P${o.turn + 1} +${o.bonus}`).join(', ') || 'none');

/* A hint stays hidden only while that exact move is still available. */
const board = emptyBoard();
'TOE'.split('').forEach((L, i) => { board[7 * 15 + 6 + i] = { L }; });
const rack = ['A', 'H', 'I', 'M', 'R', 'S', 'N'];
const missed = E.findBest(board, rack, dict, words, 2000).best;
if (missed) {
  const held = { board, racks: [rack, rack] };
  const spent = rack.filter(c => c !== missed.tiles[0].L).concat('E');
  check('hint hidden while the move is still on', E.stillOpen(missed, held, 0, dict));
  check('hint opens once a needed tile is gone',
        !E.stillOpen(missed, { board, racks: [spent, spent] }, 0, dict));
}

/* ------------------------------------------------------------------ page --
   Loaded the way a phone would load it, with storage and the database stubbed
   out, to catch anything that throws before the first screen is drawn.     */

console.log('\npage');
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  console.log('  skipped  (run: npm install)');
  process.exit(failed ? 1 : 0);
}

const SAVED_GAME = 'tlmno0:312:288:Junghyun:Hailey'
                 + ':1~0~88~QUICKLY~7~12~5~SATIETY:0~1~64~ZEBRA~5~13~7~ZEBRAS';
const db = { HIDX: '0', H0: SAVED_GAME };
const storage = { nsb_cfg: JSON.stringify({ clock: 900 }), nsb_name: 'Junghyun' };
const errors = [];

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.netlify.app/',
  beforeParse(w) {
    Object.defineProperty(w, 'localStorage', {
      value: {
        getItem: k => (k in storage ? storage[k] : null),
        setItem: (k, v) => { storage[k] = String(v); },
        removeItem: k => { delete storage[k]; },
      },
    });
    w.fetch = async (url, opt) => {
      const key = (/\/g\/([^.]+)\.json/.exec(url) || [])[1];
      if (opt && opt.method === 'PUT') { db[key] = JSON.parse(opt.body); return { ok: true, json: async () => db[key] }; }
      return { ok: true, json: async () => (key in db ? db[key] : null) };
    };
    w.navigator.vibrate = () => {};
    w.alert = () => {};
    w.confirm = () => true;
    w.addEventListener('error', e => errors.push(e.message));
    w.onerror = m => errors.push(m);
  },
});

const shown = id => !dom.window.document.querySelector(id).classList.contains('hidden');

setTimeout(() => {
  const d = dom.window.document;
  check('loads without throwing', errors.length === 0, errors.join(' | '));
  check('last game is on the first screen',
        /Junghyun won 312 : 288/.test(d.querySelector('#lastGame').textContent));
  check('the saved name is already chosen',
        d.querySelector('#nameSeg button[data-nm="Junghyun"]').classList.contains('on'));
  check('start buttons are live once a name is picked',
        !d.querySelector('#btnNew').disabled && !d.querySelector('#btnJoin').disabled);

  d.querySelector('#btnNew').click();

  setTimeout(() => {
    check('tapping a start button opens the lobby', shown('#lobby') && !shown('#setup'));
    check('the opener is shared with the other phone', db.BED_OPEN === 'Junghyun', String(db.BED_OPEN));

    /* The other phone turns up: its heartbeat is all the lobby waits for. */
    db.BED_p1 = 'other~' + Math.round(Date.now() / 1000).toString(36);

    setTimeout(() => {
      check('both present starts the game', shown('#game') && !shown('#lobby'));
      check('board is laid out', d.querySelectorAll('#board .c').length === 225);
      check('a rack was dealt', d.querySelectorAll('#rack .rt').length === 7);
      check('the opening turn is mine', /Your turn|You start/.test(d.querySelector('#preview').textContent));
      check('the game was published for the other phone', typeof db.BED === 'string' && db.BED.startsWith('S5.BED.'));

      dom.window.close();
      console.log(failed ? `\n${failed} failed\n` : '\nall good\n');
      process.exit(failed ? 1 : 0);
    }, 3000);
  }, 600);
}, 1200);
