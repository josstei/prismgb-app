# AGENT.md

## Skills
A skill is a set of local instructions stored in a `SKILL.md` file.

### Available skills
- `skill-creator`: Guide for creating effective skills. Use when creating or updating a skill that extends Codex capabilities with specialized knowledge, workflows, or tool integrations. Source: `/Users/josstei/.codex/skills/.system/skill-creator/SKILL.md`
- `skill-installer`: Install Codex skills into `$CODEX_HOME/skills` from a curated list or a GitHub repo path. Use when listing installable skills, installing a curated skill, or installing a skill from another repo (including private repos). Source: `/Users/josstei/.codex/skills/.system/skill-installer/SKILL.md`

## How to use skills
- Discovery: Use the skills listed above (name + description + file path). Skill bodies live on disk at the listed paths.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text), or the task clearly matches a listed skill description, use that skill for the current turn. Multiple mentions mean use all relevant skills. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill is missing or the path cannot be read, state that briefly and continue with the best fallback.
- Progressive disclosure:
  1. After deciding to use a skill, open its `SKILL.md`.
  2. Resolve relative paths in `SKILL.md` relative to the skill directory first.
  3. If references are provided, load only the files needed for the task.
  4. If scripts exist, prefer running or patching them over retyping large blocks.
  5. Reuse assets/templates when available.
- Coordination: If multiple skills apply, choose the minimal set that covers the task and state the order used.
- Context hygiene: Keep context small, summarize long sections, and avoid unnecessary reference-chasing.
- Safety and fallback: If a skill cannot be applied cleanly (missing files, unclear instructions), state the issue, choose the next-best approach, and continue.
