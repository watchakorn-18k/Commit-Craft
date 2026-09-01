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
 * e.g. "feature/PROJ-123-login" -> "PROJ-123"
 * e.g. "fix/issue-456" -> "#456"
 * e.g. "feat/gh-789-api" -> "#789"
 */
export function extractIssueFromBranch(branchName: string): string | null {
  if (!branchName) {
    return null;
  }

  // Matches Jira-style tickets like PROJ-123, ABC-4567
  const jiraMatch = branchName.match(/([A-Z]{2,10}-\d+)/i);
  if (jiraMatch) {
    return jiraMatch[1].toUpperCase();
  }

  // Matches GitHub/GitLab issue patterns like issue-123, gh-123, #123
  const ghMatch = branchName.match(/(?:issue|gh|fix|bug)[-_/]?(\d+)/i);
  if (ghMatch) {
    return `#${ghMatch[1]}`;
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
