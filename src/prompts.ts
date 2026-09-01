import { ConfigKeys, ConfigurationManager } from './config';

export interface PromptOptions {
  language?: string;
  emojiEnabled?: boolean;
  commitStyle?: string;
  issueTag?: string | null;
  detectedScope?: string | null;
}

/**
 * Builds the system prompt for single commit message generation.
 */
export const getMainCommitPrompt = async (options?: PromptOptions) => {
  const configManager = ConfigurationManager.getInstance();
  const language = options?.language || configManager.getConfig<string>(ConfigKeys.AI_COMMIT_LANGUAGE, 'English');
  const commitStyle = options?.commitStyle || configManager.getConfig<string>(ConfigKeys.COMMIT_STYLE, 'conventional');
  const issueTag = options?.issueTag;
  const detectedScope = options?.detectedScope;

  const customPrompt = configManager.getConfig<string>(ConfigKeys.AI_COMMIT_SYSTEM_PROMPT);
  if (customPrompt && customPrompt.trim().length > 0) {
    return [{ role: 'system', content: customPrompt.trim() }];
  }

  const prefix = issueTag ? `[${issueTag}] ` : '';
  const scopePlaceholder = detectedScope ? `(${detectedScope})` : '(<scope>)';
  let styleInstruction = '';

  if (commitStyle === 'simple') {
    styleInstruction = `Generate a single concise one-line commit message without body. Format: ${prefix}<type>${scopePlaceholder}: <subject>`;
  } else if (commitStyle === 'detailed') {
    styleInstruction = `Generate a structured commit message with a clear subject and concise bullet points explaining WHAT changed, WHY it changed, and technical details.`;
  } else {
    styleInstruction = `Generate a standard Conventional Commit message with a subject and 1-3 concise bullet points.`;
  }

  const emojiRule = 'CRITICAL: Do NOT include any emojis or icons. Keep all output strictly professional and technical.';
  const scopeRule = detectedScope
    ? `Monorepo / Module Scope detected: "${detectedScope}". Use "${detectedScope}" as the scope: <type>(${detectedScope}): <subject>.`
    : 'Infer an appropriate concise scope in English from modified file paths if applicable.';

  return [
    {
      role: 'system',
      content: `You are an expert Git commit generator. Analyze the diff and generate a clean, professional Conventional Commit message.

Rules:
1. Output ONLY the raw commit message text. No markdown code blocks, quotes, introductions, or explanations.
2. Subject line: maximum 60 characters, imperative present tense ("add" not "added"), no trailing period, written in ${language} (type and scope must remain standard English).
3. ${emojiRule}
4. ${scopeRule}
5. ${issueTag ? `Include ticket tag '${issueTag}' in the subject.` : ''}
6. ${styleInstruction}

Format:
${prefix}<type>${scopePlaceholder}: <subject>

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
  const issueTag = options?.issueTag ? `Ticket tag: ${options.issueTag}` : '';
  const detectedScope = options?.detectedScope ? `Detected scope: "${options.detectedScope}" (use this scope in conventional and detailed candidates)` : '';

  return [
    {
      role: 'system',
      content: `You are an expert Git commit generator.
Generate exactly 3 different clean, professional commit message candidates for the provided diff in JSON format.
Language: ${language}.
Rules: Strictly NO emojis, icons, or decorative fluff. Professional engineering standards.
${detectedScope}
${issueTag}

Output MUST be a valid JSON array of objects:
[
  {
    "style": "Conventional",
    "message": "feat(${options?.detectedScope || 'scope'}): subject\\n\\n- detail 1\\n- detail 2"
  },
  {
    "style": "Concise",
    "message": "feat(${options?.detectedScope || 'scope'}): concise single line subject"
  },
  {
    "style": "Detailed",
    "message": "feat(${options?.detectedScope || 'scope'}): subject\\n\\n- detailed explanation of changes\\n- context and rationale"
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

/**
 * Builds prompt for Keep a Changelog markdown generation
 */
export const getChangelogPrompt = (
  commits: string,
  version: string,
  date: string,
  language: string = 'English'
) => {
  return [
    {
      role: 'system',
      content: `You are a release manager generating a CHANGELOG entry adhering strictly to the "Keep a Changelog" standard (https://keepachangelog.com/).

Target Version: [${version}] - ${date}
Language: ${language}.

Rules:
1. Group items under standard categories ONLY if there are matching changes:
   - ### Added (for new features)
   - ### Changed (for changes in existing functionality)
   - ### Deprecated (for soon-to-be removed features)
   - ### Removed (for now removed features)
   - ### Fixed (for any bug fixes)
   - ### Security (in case of vulnerabilities)
2. Be concise, technical, and accurate based solely on the provided commit list.
3. Do NOT include empty categories.
4. Output ONLY the markdown entry for this version (starting with "## [${version}] - ${date}"). Do NOT output top-level "# Changelog" header or markdown fences.

Example output:
## [${version}] - ${date}

### Added
- Multi-provider support for Google Gemini, OpenAI, Claude, and DeepSeek
- Dedicated Sidebar and Source Control TreeView panel

### Changed
- Refactored configuration management to utilize SecretStorage

### Fixed
- Resolved API endpoint timeout issues on slow connections
`
    },
    {
      role: 'user',
      content: `Commits for Version ${version}:\n\n${commits}`
    }
  ];
};

/**
 * Builds prompt for explaining a specific commit in Git history
 */
export const getExplainCommitPrompt = (
  commitMessage: string,
  author: string,
  date: string,
  diff: string,
  language: string = 'English'
) => {
  return [
    {
      role: 'system',
      content: `You are a senior software architect and code reviewer.
Explain the following Git commit clearly, accurately, and concisely.

Language: ${language}.
Rules: Strictly NO emojis, icons, or decorative fluff. Senior-level professional engineering tone.

Format your explanation in clean Markdown:
## Commit Overview
- **Message**: ${commitMessage}
- **Author**: ${author} | **Date**: ${date}

### 1. Purpose & Motivation (จุดประสงค์หลัก)
[Explain WHY this commit was made and what problem it solves in 2-3 clear sentences]

### 2. Key Code Changes (จุดเปลี่ยนแปลงสำคัญ)
- [Bullet points explaining specific functions, components, or files modified and how they work]

### 3. Architecture & System Impact (ผลกระทบต่อระบบ)
- [Explain how this change affects other modules, performance, security, or API contracts]

### 4. Summary & Verdict
[Concise 1-sentence takeaway summary]
`
    },
    {
      role: 'user',
      content: `Commit Diff & Details:\n\n${diff}`
    }
  ];
};

/**
 * Builds prompt for smart Git Stash message generation
 */
export const getStashMessagePrompt = (
  diff: string,
  branchName?: string,
  detectedScope?: string | null,
  language: string = 'English'
) => {
  const scopeText = detectedScope ? `(${detectedScope})` : '';
  return [
    {
      role: 'system',
      content: `You are an expert Git assistant.
Analyze the uncommitted changes and generate a single, concise WIP (Work In Progress) Git stash description (max 50 characters).
Branch: ${branchName || 'current'}
Scope: ${detectedScope || 'general'}
Language: ${language}.
Rules:
1. Format: WIP${scopeText}: <brief description of what is being worked on>
2. Strictly NO emojis, quotes, prefixes, markdown, or trailing periods. Output ONLY the one-line stash message text.

Example outputs:
- WIP(auth): refactor oauth token expiration
- WIP(web): payment checkout form validation
- WIP(api): add stripe webhook handler
`
    },
    {
      role: 'user',
      content: `Current Uncommitted Changes Diff:\n\n${diff}`
    }
  ];
};

/**
 * Builds prompt for resolving Git Merge Conflict blocks
 */
export const getMergeConflictPrompt = (
  filePath: string,
  conflictSnippet: string,
  language: string = 'English'
) => {
  return [
    {
      role: 'system',
      content: `You are a Principal Software Engineer resolving a Git merge conflict in file: "${filePath}".
Analyze the conflict block containing "<<<<<<< HEAD", "=======", and ">>>>>>>":
- Understand the intent of the Current change (HEAD)
- Understand the intent of the Incoming change
- Produce a clean, syntactically correct, and bug-free merged resolution that combines the logic of both sides without losing vital functionality.

Language for any explanation: ${language}.
Rules:
1. Remove all conflict markers (<<<<<<<, =======, >>>>>>>).
2. Output ONLY the resolved code block. Do NOT include explanations, markdown code block backticks, or notes.
`
    },
    {
      role: 'user',
      content: `Conflicted Code Block:\n\n${conflictSnippet}`
    }
  ];
};

/**
 * Builds prompt for Semantic Versioning and Git Tag recommendations
 */
export const getReleaseTagPrompt = (
  currentTag: string,
  commits: string,
  language: string = 'English'
) => {
  return [
    {
      role: 'system',
      content: `You are a DevOps and release release engineering expert adhering to Semantic Versioning (SemVer 2.0.0).
Analyze the commits since current tag "${currentTag || 'none'}":
- If there are breaking changes (e.g. BREAKING CHANGE or feat!/fix!), recommend a MAJOR bump.
- If there are new features (feat/feature), recommend a MINOR bump.
- If there are only bug fixes, chores, refactors, docs, recommend a PATCH bump.

Current Tag: ${currentTag || 'v0.0.0'}
Language: ${language}.
Rules: Strictly NO emojis.

Output valid JSON matching this schema:
{
  "recommendedTag": "v1.2.0",
  "bumpType": "minor",
  "reason": "Brief explanation of why this version bump is recommended",
  "highlights": [
    "Key feature 1",
    "Key fix 1"
  ]
}
`
    },
    {
      role: 'user',
      content: `Commit Log since ${currentTag || 'initial commit'}:\n\n${commits}`
    }
  ];
};


