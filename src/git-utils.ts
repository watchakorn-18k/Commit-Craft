import * as fs from 'fs-extra';
import simpleGit from 'simple-git';
import * as vscode from 'vscode';
import { Logger } from './logger';

/**
 * Retrieves the repository associated with the provided argument or active workspace.
 */
export async function getRepo(arg?: any): Promise<any> {
  const gitApi = vscode.extensions.getExtension('vscode.git')?.exports.getAPI(1);
  if (!gitApi) {
    throw new Error('Git extension not found in VS Code');
  }

  if (typeof arg === 'object' && arg?.rootUri) {
    const resourceUri = arg.rootUri;
    try {
      const realResourcePath: string = fs.realpathSync(resourceUri.fsPath);
      for (let i = 0; i < gitApi.repositories.length; i++) {
        const repo = gitApi.repositories[i];
        if (realResourcePath.startsWith(repo.rootUri.fsPath)) {
          return repo;
        }
      }
    } catch {
      // Ignore resolution errors and fallback
    }
  }

  if (gitApi.repositories.length > 0) {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const activeFilePath = activeEditor.document.uri.fsPath;
      const matched = gitApi.repositories.find((r: any) =>
        activeFilePath.startsWith(r.rootUri.fsPath)
      );
      if (matched) {
        return matched;
      }
    }
    return gitApi.repositories[0];
  }

  throw new Error('No Git repository opened in current workspace');
}

/**
 * Get current active branch name
 */
export async function getCurrentBranch(repo: any): Promise<string> {
  try {
    const rootPath = repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      return '';
    }
    const git = simpleGit(rootPath);
    const branchSummary = await git.branch();
    return branchSummary.current || '';
  } catch (error) {
    Logger.error('Failed to get current branch:', error);
    return '';
  }
}

/**
 * Automatically extracts Issue / Ticket identifier from branch name
 * - Jira / Linear / ClickUp: "feature/PROJ-123-login" -> "PROJ-123"
 * - GitHub / GitLab Issues: "fix/issue-456" -> "#456", "feat/gh-789" -> "#789"
 * - Azure DevOps: "feat/ab#12345" -> "AB#12345"
 */
export function extractIssueFromBranch(branchName: string): string | null {
  if (!branchName) {
    return null;
  }

  // 1. Azure DevOps pattern: ab#12345 or ado-12345 or wi-12345
  const adoMatch = branchName.match(/(?:ab[#_-]|ado[-_]|wi[-_])(\d+)/i);
  if (adoMatch) {
    return `AB#${adoMatch[1]}`;
  }

  // 2. Jira / Linear / ClickUp / Shortcut style: PROJ-123, CORE-4567, ENG-101
  const jiraMatch = branchName.match(/\b([A-Za-z]{2,10}-\d+)\b/);
  if (jiraMatch) {
    return jiraMatch[1].toUpperCase();
  }

  // 3. GitHub / GitLab issue patterns: issue-123, gh-123, gl-123, bug-123, fix-123
  const ghMatch = branchName.match(/(?:issue|gh|gl|fix|bug)[-_/]?(\d+)/i);
  if (ghMatch) {
    return `#${ghMatch[1]}`;
  }

  // 4. Standalone hash pattern: feat/#123-login
  const hashMatch = branchName.match(/#(\d+)/);
  if (hashMatch) {
    return `#${hashMatch[1]}`;
  }

  return null;
}

/**
 * Filter and compress large diffs to avoid token overflows
 */
export function filterAndCompressDiff(rawDiff: string, maxChars: number = 24000): string {
  if (!rawDiff || rawDiff.length <= maxChars) {
    return rawDiff;
  }

  const lines = rawDiff.split('\n');
  const filteredLines: string[] = [];
  let skippingFile = false;

  const ignorePatterns = [
    /package-lock\.json/,
    /yarn\.lock/,
    /pnpm-lock\.yaml/,
    /Cargo\.lock/,
    /poetry\.lock/,
    /\.min\.js/,
    /\.min\.css/,
    /\.map$/,
    /\.svg$/,
    /\.png$/,
    /\.jpg$/,
    /\.jpeg$/,
    /\.ico$/,
    /\.woff2?$/
  ];

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      skippingFile = ignorePatterns.some((pattern) => pattern.test(line));
      if (skippingFile) {
        filteredLines.push(`${line} [LARGE/LOCK FILE DIFF OMITTED]`);
        continue;
      }
    }

    if (!skippingFile) {
      filteredLines.push(line);
    }
  }

  let result = filteredLines.join('\n');
  if (result.length > maxChars) {
    result = result.substring(0, maxChars) + '\n\n...[DIFF TRUNCATED DUE TO SIZE]...';
  }

  return result;
}

/**
 * Retrieves the staged changes from the Git repository.
 */
export async function getDiffStaged(
  repo: any
): Promise<{ diff: string; error?: string | null }> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;

    if (!rootPath) {
      throw new Error('No workspace folder found');
    }

    const git = simpleGit(rootPath);
    const rawDiff = await git.diff(['--staged']);
    const diff = filterAndCompressDiff(rawDiff || '');

    return {
      diff: diff || 'No changes staged.',
      error: null
    };
  } catch (error: any) {
    Logger.error('Error reading Git staged diff:', error);
    return { diff: '', error: error?.message || String(error) };
  }
}

/**
 * Retrieves the list of staged file paths from Git repository
 */
export async function getStagedFilePaths(repo: any): Promise<string[]> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      return [];
    }
    const git = simpleGit(rootPath);
    const status = await git.status();
    return status.staged || [];
  } catch (error) {
    Logger.error('Error fetching staged file paths:', error);
    return [];
  }
}

/**
 * Get diff for the current branch compared to base branch (e.g. main/master) for PR creation
 */
export async function getBranchDiff(
  repo: any,
  baseBranch: string = 'main'
): Promise<{ diff: string; commits: string; error?: string | null }> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      throw new Error('No workspace folder found');
    }

    const git = simpleGit(rootPath);
    const branches = await git.branchLocal();

    let targetBase = baseBranch;
    if (!branches.all.includes(targetBase)) {
      if (branches.all.includes('master')) {
        targetBase = 'master';
      } else if (branches.all.includes('develop')) {
        targetBase = 'develop';
      } else {
        targetBase = branches.current;
      }
    }

    let diff = '';
    let commits = '';

    try {
      diff = await git.diff([`${targetBase}...HEAD`]);
      const log = await git.log({ from: targetBase, to: 'HEAD' });
      commits = log.all.map((c) => `- ${c.message} (${c.hash.substring(0, 7)})`).join('\n');
    } catch {
      diff = await git.diff(['HEAD~5']);
      const log = await git.log({ maxCount: 5 });
      commits = log.all.map((c) => `- ${c.message} (${c.hash.substring(0, 7)})`).join('\n');
    }

    return {
      diff: filterAndCompressDiff(diff, 30000),
      commits: commits || 'No recent commits found.',
      error: null
    };
  } catch (error: any) {
    Logger.error('Error getting branch diff for PR:', error);
    return { diff: '', commits: '', error: error?.message || String(error) };
  }
}

/**
 * Check if the repository has any unstaged changes or untracked files
 */
export async function hasUnstagedChanges(repo: any): Promise<boolean> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      return false;
    }
    const git = simpleGit(rootPath);
    const status = await git.status();
    return (
      status.not_added.length > 0 ||
      status.modified.length > 0 ||
      status.deleted.length > 0 ||
      status.created.length > 0
    );
  } catch (error: any) {
    Logger.error('Error checking Git status:', error);
    return false;
  }
}

/**
 * Stages all changes in the repository (`git add -A`)
 */
export async function stageAllChanges(repo: any): Promise<void> {
  const rootPath =
    repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!rootPath) {
    throw new Error('No workspace folder found');
  }
  const git = simpleGit(rootPath);
  await git.add(['-A']);
}

/**
 * Retrieves commit history for changelog generation (from previous tag to HEAD, or all commits)
 */
export async function getCommitsForChangelog(
  repo: any
): Promise<{ commits: string; lastTag: string | null; error?: string | null }> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      throw new Error('No workspace folder found');
    }
    const git = simpleGit(rootPath);

    let lastTag: string | null = null;
    try {
      const tagResult = await git.tags({ '--sort': '-creatordate' });
      if (tagResult.all.length > 0) {
        lastTag = tagResult.all[0];
      }
    } catch {
      // Ignore tag listing error
    }

    let logResult: any;
    if (lastTag) {
      try {
        logResult = await git.log({ from: lastTag, to: 'HEAD' });
      } catch {
        logResult = await git.log({ maxCount: 50 });
      }
    } else {
      logResult = await git.log({ maxCount: 50 });
    }

    const commits = logResult.all
      .map((c: any) => `- ${c.message} (${c.hash.substring(0, 7)})`)
      .join('\n');

    return {
      commits: commits || 'No commits found.',
      lastTag,
      error: null
    };
  } catch (error: any) {
    Logger.error('Error fetching commits for changelog:', error);
    return { commits: '', lastTag: null, error: error?.message || String(error) };
  }
}

/**
 * Get recent commits list
 */
export async function getRecentCommits(
  repo: any,
  maxCount: number = 30
): Promise<Array<{ hash: string; message: string; author_name: string; date: string }>> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      return [];
    }
    const git = simpleGit(rootPath);
    const log = await git.log({ maxCount });
    return log.all.map((c) => ({
      hash: c.hash,
      message: c.message,
      author_name: c.author_name,
      date: c.date
    }));
  } catch (error) {
    Logger.error('Error fetching recent commits:', error);
    return [];
  }
}

/**
 * Get commit details and full diff for a given commit hash
 */
export async function getCommitDetails(
  repo: any,
  commitHash: string
): Promise<{ diff: string; message: string; author: string; date: string; error?: string | null }> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      throw new Error('No workspace folder found');
    }
    const git = simpleGit(rootPath);
    const showOutput = await git.show([commitHash, '--stat', '-p']);
    const log = await git.log({ maxCount: 1, from: commitHash + '^', to: commitHash }).catch(async () => {
      return await git.log({ maxCount: 1 });
    });
    const commitMeta = log.all.find((c) => c.hash.startsWith(commitHash) || commitHash.startsWith(c.hash)) || log.latest;

    return {
      diff: filterAndCompressDiff(showOutput, 30000),
      message: commitMeta?.message || commitHash,
      author: commitMeta?.author_name || 'Unknown',
      date: commitMeta?.date || '',
      error: null
    };
  } catch (error: any) {
    Logger.error(`Error getting commit details for ${commitHash}:`, error);
    return {
      diff: '',
      message: commitHash,
      author: '',
      date: '',
      error: error?.message || String(error)
    };
  }
}

/**
 * Get all uncommitted changes diff (both staged and unstaged)
 */
export async function getAllUncommittedDiff(
  repo: any
): Promise<{ diff: string; files: string[]; error?: string | null }> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      throw new Error('No workspace folder found');
    }
    const git = simpleGit(rootPath);
    let diff = await git.diff(['HEAD']).catch(async () => {
      return await git.diff();
    });

    const status = await git.status();
    const files = [
      ...status.modified,
      ...status.not_added,
      ...status.created,
      ...status.deleted,
      ...status.staged
    ];

    return {
      diff: filterAndCompressDiff(diff || '', 25000),
      files: Array.from(new Set(files)),
      error: null
    };
  } catch (error: any) {
    Logger.error('Error fetching uncommitted diff for stash:', error);
    return { diff: '', files: [], error: error?.message || String(error) };
  }
}

/**
 * Save stash with custom message
 */
export async function gitStashPush(
  repo: any,
  message: string,
  includeUntracked: boolean = true
): Promise<void> {
  const rootPath =
    repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!rootPath) {
    throw new Error('No workspace folder found');
  }
  const git = simpleGit(rootPath);
  const args = ['push', '-m', message];
  if (includeUntracked) {
    args.push('-u');
  }
  await git.stash(args);
}

/**
 * Pop latest stash
 */
export async function gitStashPop(repo: any): Promise<void> {
  const rootPath =
    repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!rootPath) {
    throw new Error('No workspace folder found');
  }
  const git = simpleGit(rootPath);
  await git.stash(['pop']);
}

