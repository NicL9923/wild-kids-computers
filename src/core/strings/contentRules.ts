/**
 * Words a child must never see or hear. Hard rule 4 bans rewards, pressure to keep playing, and
 * characters who scold or show disappointment. Hard rule 2 bans the names of the two reference
 * apps; this catches only the obvious case.
 *
 * Each rule matches whole words, ignoring case. A string that uses a word honestly, such as the
 * star shape, lists the rule id in its `allow` field.
 */

type ContentRuleCategory = 'reward' | 'pressure' | 'scolding' | 'reference-app';

interface ContentRule {
  readonly category: ContentRuleCategory;
  /** Whole-word alternatives, already lower case. Spaces match any run of whitespace. */
  readonly words: readonly string[];
}

export const CONTENT_RULES = {
  // Reward and score mechanics.
  star: { category: 'reward', words: ['star', 'stars', 'superstar', 'gold star'] },
  point: { category: 'reward', words: ['point', 'points'] },
  badge: { category: 'reward', words: ['badge', 'badges'] },
  streak: { category: 'reward', words: ['streak', 'streaks'] },
  score: { category: 'reward', words: ['score', 'scores', 'high score', 'scoreboard'] },
  leaderboard: { category: 'reward', words: ['leaderboard', 'leaderboards', 'ranking', 'rank'] },
  'level-up': { category: 'reward', words: ['level up', 'levelled up', 'leveled up', 'next level'] },
  trophy: { category: 'reward', words: ['trophy', 'trophies', 'medal', 'medals'] },
  prize: { category: 'reward', words: ['prize', 'prizes', 'reward', 'rewards', 'bonus', 'jackpot'] },
  currency: { category: 'reward', words: ['coin', 'coins', 'gem', 'gems', 'xp'] },
  unlock: { category: 'reward', words: ['unlock', 'unlocked', 'unlocks'] },
  // Pressure to hurry or to keep playing.
  countdown: { category: 'pressure', words: ['countdown', 'time is up', "time's up", 'times up', 'hurry'] },
  'keep-playing': {
    category: 'pressure',
    words: ['keep playing', 'keep going', "don't stop", 'dont stop', 'one more', 'play more', 'come back'],
  },
  // Scolding, disappointment, and verdicts on the child.
  wrong: { category: 'scolding', words: ['wrong', 'incorrect', 'mistake', 'fail', 'failed', 'failure'] },
  disappointment: {
    category: 'scolding',
    words: ['oh no', 'uh oh', 'too bad', 'too slow', 'bad', 'try harder', 'not good', 'disappointed', 'sad'],
  },
  // Hard rule 2: the two apps this one must not copy, and their mascot.
  'reference-app': { category: 'reference-app', words: ['gcompris', 'tux paint', 'tuxpaint', 'tux'] },
  // A reference app's own name for one of its tools. Tux Paint calls its effects "Magic", so the
  // paint studio says "Effects". A real object, such as the magic wand stamp, allows it.
  'reference-tool': { category: 'reference-app', words: ['magic'] },
} as const satisfies Readonly<Record<string, ContentRule>>;

export type ContentRuleId = keyof typeof CONTENT_RULES;

function isContentRuleId(value: string): value is ContentRuleId {
  return Object.hasOwn(CONTENT_RULES, value);
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

const RULE_IDS: readonly ContentRuleId[] = Object.keys(CONTENT_RULES).filter(isContentRuleId);

const RULE_PATTERNS: ReadonlyMap<ContentRuleId, RegExp> = new Map(
  RULE_IDS.map((id) => {
    const alternatives = CONTENT_RULES[id].words.map((word) => escapeRegExp(word).replaceAll(' ', String.raw`\s+`));
    // Letters, digits, and apostrophes count as word characters, so "star" does not match "start"
    // and "bad" does not match "badger", while "star!" and "stars." still match.
    return [id, new RegExp(String.raw`(?<![\p{L}\p{N}'])(?:${alternatives.join('|')})(?![\p{L}\p{N}'])`, 'iu')];
  }),
);

/** Ids of every content rule the text breaks. Curly apostrophes count as straight ones. */
export function contentRulesMatched(text: string): ContentRuleId[] {
  const plain = text.replaceAll(/[‘’ʼ]/g, "'");
  return RULE_IDS.filter((id) => RULE_PATTERNS.get(id)?.test(plain) === true);
}
