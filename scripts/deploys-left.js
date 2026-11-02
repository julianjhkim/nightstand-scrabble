// How many deploys are left before the free Netlify credits run out.
//
// Every production deploy costs 15 credits and the free plan gives 300 a
// month, reset on the account's own date rather than the 1st. Netlify does not
// expose the credit balance, so this counts production deploys since the
// current period started. Credits spent on anything else are not seen, which
// is why the answer is "about".
//
//     npm run deploys

const { execFileSync } = require('child_process');

const SITE = 'd64ccdb6-0c84-499b-b5ea-56f820cdc7a6';   // scrabble4hailey
const PER_DEPLOY = 15;

const api = (method, data) => JSON.parse(execFileSync(
  'npx', ['netlify', 'api', method, ...(data ? ['--data', JSON.stringify(data)] : [])],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));

let account, deploys;
try {
  account = api('listAccountsForUser').find(a => a.slug === 'juhng62');
  deploys = api('listSiteDeploys', { site_id: SITE, per_page: 100 });
} catch (e) {
  console.error('Could not reach Netlify. Run `npx netlify login` and try again.');
  process.exit(1);
}

const start = new Date(account.current_usage_period_start);
const next = new Date(account.next_usage_period_start);
const used = deploys.filter(d => d.context === 'production' && new Date(d.created_at) >= start);
const credits = account.plan_credits;
const left = Math.floor((credits - used.length * PER_DEPLOY) / PER_DEPLOY);
const day = d => d.toISOString().slice(0, 10);

console.log(`${used.length} deploys since ${day(start)} (${used.length * PER_DEPLOY} of ${credits} credits)`);
console.log(`about ${left} left until ${day(next)}`);
