const GENERATED_CODEX_COMMIT_PATTERN = /^\[codex\]\s+\S.+$/u;

export default {
  extends: ['@commitlint/config-conventional'],
  // Stacked phase PRs can include generated Codex staging commits; the PR title still carries the semantic contract.
  ignores: [
    (message) => GENERATED_CODEX_COMMIT_PATTERN.test(message.split(/\r?\n/, 1)[0] ?? '')
  ],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation only
        'style',    // Formatting, no code change
        'refactor', // Code change that neither fixes bug nor adds feature
        'perf',     // Performance improvement
        'test',     // Adding or updating tests
        'build',    // Build system or dependencies
        'ci',       // CI configuration
        'chore',    // Other changes that don't modify src or test
        'revert'    // Revert previous commit
      ]
    ],
    'subject-case': [0],  // Allow any case in subject
    'body-max-line-length': [0]  // Allow long body lines
  }
};
