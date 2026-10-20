export default {
  extends: ['@commitlint/config-conventional'],
  // Ignore machine-generated squash-merge commits that don't follow the
  // conventional format (in addition to the built-in Merge/revert ignores).
  ignores: [(message) => /^\[codex\]/.test(message)],
  rules: {
    'subject-case': [0],
    'body-max-line-length': [0],
    // Trailer paragraphs (e.g. NOTE:) can exceed the default footer limit.
    'footer-max-line-length': [0]
  }
};
