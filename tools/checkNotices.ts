import { buildNotices } from './notices.ts';

// check:notices. Every production dependency and every asset manifest entry has a notice in the
// third-party notices the app ships. tools/notices.ts says where each notice comes from.
const { text, problems } = buildNotices(process.cwd());
if (problems.length > 0) {
  console.error('check:notices failed:');
  for (const problem of problems) console.error(`  ${problem.where} ${problem.detail}`);
  process.exit(1);
}
console.log(`check:notices passed. The third-party notices are complete, ${text.split('\n').length} lines.`);
