import { ConfigKeys, ConfigurationManager } from './config';

export interface PromptOptions {
  language?: string;
  emojiEnabled?: boolean;
  commitStyle?: string;
  issueTag?: string | null;
}

/**
 * Builds the system prompt for single commit message generation.
 */
export const getMainCommitPrompt = async (options?: PromptOptions) => {
  const configManager = ConfigurationManager.getInstance();
  const language = options?.language || configManager.getConfig<string>(ConfigKeys.AI_COMMIT_LANGUAGE, 'English');
  const emojiEnabled = options?.emojiEnabled ?? configManager.getConfig<boolean>(ConfigKeys.EMOJI_ENABLED, false);
  const commitStyle = options?.commitStyle || configManager.getConfig<string>(ConfigKeys.COMMIT_STYLE, 'conventional');
  const issueTag = options?.issueTag;

  const customPrompt = configManager.getConfig<string>(ConfigKeys.AI_COMMIT_SYSTEM_PROMPT);
  if (customPrompt && customPrompt.trim().length > 0) {
    return [{ role: 'system', content: customPrompt.trim() }];
  }

  const prefix = issueTag ? `[${issueTag}] ` : '';
  let styleInstruction = '';

  if (commitStyle === 'simple') {
    styleInstruction = `Generate a single concise one-line commit message without body. Format: ${prefix}<type>(<scope>): <subject>`;
  } else if (commitStyle === 'detailed') {
    styleInstruction = `Generate a structured commit message with a clear subject and concise bullet points explaining WHAT changed, WHY it changed, and technical details.`;
  } else {
    styleInstruction = `Generate a standard Conventional Commit message with a subject and 1-3 concise bullet points.`;
  }

  const emojiRule = emojiEnabled
    ? 'Prefix the subject line with a relevant Gitmoji (e.g. feat -> ✨, fix -> 🐛, docs -> 📝, refactor -> ♻️).'
    : 'Do NOT include any emoji in the commit message.';

  return [
    {
      role: 'system',
      content: `You are a Git commit generator. Analyze the diff and generate a clean, professional Conventional Commit message.

Rules:
1. Output ONLY the raw commit message text. No markdown code blocks, quotes, introductions, or explanations.
2. Subject line: maximum 60 characters, imperative present tense ("add" not "added"), no trailing period, written in ${language} (type and scope must remain standard English).
3. ${emojiRule}
4. ${issueTag ? `Include ticket tag '${issueTag}' in the subject.` : ''}
5. ${styleInstruction}

Format:
${prefix}<type>(<scope>): <subject>

- <bullet 1>
- <bullet 2>
`
    }
  ];
};

/**
 * Builds prompt to generate 3 distinct candidate commit messages for the user to pick from.
 */
export const getMultipleCandidatesPrompt = (
  diff: string,
  options?: PromptOptions
) => {
  const language = options?.language || 'English';
  const emoji = options?.emojiEnabled ? 'with Gitmoji' : 'without emoji';
  const issueTag = options?.issueTag ? `Ticket tag: ${options.issueTag}` : '';

  return [
    {
      role: 'system',
      content: `You are a Git commit generator.
Generate exactly 3 different commit message candidates for the provided diff in JSON format.
Language: ${language}.
Emoji: ${emoji}.
${issueTag}

Output MUST be a valid JSON array of objects:
[
  {
    "style": "Conventional",
    "message": "feat(scope): subject\\n\\n- detail 1\\n- detail 2"
  },
  {
    "style": "Concise",
    "message": "feat(scope): concise single line subject"
  },
  {
    "style": "Detailed",
    "message": "feat(scope): subject\\n\\n- detailed explanation of changes\\n- context and rationale"
  }
]
Output ONLY valid JSON.`
    },
    {
      role: 'user',
      content: `Git Diff:\n\n${diff}`
    }
  ];
};

/**
 * Builds prompt for Pre-Commit Code Review
 */
export const getPreCommitReviewPrompt = (diff: string, language: string = 'English') => {
  return [
    {
      role: 'system',
      content: `You are a senior software engineer and security auditor conducting a pre-commit review.
Analyze the following git diff carefully.

Review Areas:
1. Bugs & Logic Flaws: potential runtime errors, unhandled rejections, memory leaks, null/undefined safety.
2. Security & Credentials: hardcoded API keys, passwords, tokens, sensitive data exposure.
3. Leftover Debug Code: console.log, debugger, print statements, temporary hacks.
4. Performance: unnecessary computations, inefficient loops.

Language: ${language}.

Output format (clean Markdown, avoid decorative fluff):
## Pre-Commit Code Review

### Summary
[Verdict: Ready to commit / Needs attention / Critical issues found]

### Issues Detected
- [File & Line]: Description + recommended fix

### Recommendations
- [Concise improvement notes if any]

If no issues are found, state clearly that the staged changes look clean and ready to commit.`
    },
    {
      role: 'user',
      content: `Git Diff to Review:\n\n${diff}`
    }
  ];
};

/**
 * Builds prompt for Pull Request description generator
 */
export const getPRDescriptionPrompt = (diff: string, commits: string, language: string = 'English') => {
  return [
    {
      role: 'system',
      content: `You are a software engineer drafting a clean Pull Request description.
Language: ${language}.

Format (clean Markdown):
## Overview
[Concise summary of the PR's purpose]

## Changes
- **Module**: Brief description of change
- **Refactor/Fix**: Brief description of change

## Testing Instructions
1. Steps to verify changes locally
2. Key edge cases tested

## Checklist
- [x] Code adheres to repository guidelines
- [x] Tested locally and verified
- [ ] Relevant tests added or updated
`
    },
    {
      role: 'user',
      content: `Commits in Branch:\n${commits}\n\nBranch Diff:\n${diff}`
    }
  ];
};

/**
 * Builds prompt for branch name suggestions
 */
export const getBranchNamePrompt = (diff: string) => {
  return [
    {
      role: 'system',
      content: `Suggest 4 clean, standard git branch names based on the diff (e.g. feat/..., fix/..., refactor/..., chore/...).
Output ONLY a JSON array of strings:
["feat/user-auth", "feat/google-oauth", "fix/session-token-expiry", "chore/update-dependencies"]`
    },
    {
      role: 'user',
      content: `Git Diff:\n\n${diff}`
    }
  ];
};
