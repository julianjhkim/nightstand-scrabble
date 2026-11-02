// Print the Firebase Realtime Database rules for a passphrase.
//
// The game keeps everything under /s/<key>, where the key is a SHA-256 hash of
// the passphrase. The rules allow that one path and nothing else, so the
// passphrase itself never goes into the repo, the page, or the Firebase console.
//
//     npm run rules              rules that also keep the old open /g working,
//                                for the switch-over
//     npm run rules -- --final   rules with /g closed, once both phones are on
//                                the passphrase
//
// Paste the output into Firebase console > Realtime Database > Rules > Publish.

const crypto = require('crypto');
const readline = require('readline');

const FINAL = process.argv.includes('--final');
const MIN = 12;

// Must match keyFor() in src/template.html.
const keyFor = pass => crypto.createHash('sha256')
  .update(pass.trim().replace(/\s+/g, ' ').toLowerCase()).digest('hex');

// Typing is hidden: readline may write only the prompt itself, never the
// characters. (Writing the prompt around readline doesn't work: in a terminal
// it clears the line and wipes it.) Lines are queued so piped input works too.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let prompt = '';
rl._writeToOutput = s => { if (s === prompt) process.stdout.write(s); };
const lines = [];
let waiting = null;
rl.on('line', l => {
  process.stdout.write('\n');
  if (waiting) { waiting(l); waiting = null; } else lines.push(l);
});
const ask = question => new Promise(resolve => {
  prompt = question;
  rl.setPrompt(question);
  rl.prompt();
  if (lines.length) resolve(lines.shift()); else waiting = resolve;
});

(async () => {
  const pass = await ask('Passphrase: ');
  if (pass.trim().length < MIN) {
    console.error(`Use at least ${MIN} characters. A few unrelated words works well.`);
    process.exit(1);
  }
  const again = await ask('Again: ');
  rl.close();
  if (again !== pass) {
    console.error('The two did not match.');
    process.exit(1);
  }

  const slot = {
    '.validate': 'newData.isString() && newData.val().length < 4000',
  };
  const rules = { s: { [keyFor(pass)]: { '.read': true, '.write': true, $k: slot } } };
  if (!FINAL) rules.g = { $k: { '.read': true, '.write': true, ...slot } };

  console.log('\n' + JSON.stringify({ rules }, null, 2) + '\n');
})();
