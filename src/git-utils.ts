import * as fs from 'fs-extra';
import simpleGit from 'simple-git';
import * as vscode from 'vscode';
import { Logger } from './logger';

/**
 * Retrieves the repository associated with the provided argument or active workspace.
 */
export async function getRepo(arg?: any): Promise<any> {
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (gitExtension && !gitExtension.isActive) {
    try {
      await gitExtension.activate();
    } catch {
      // Ignore activation error
    }
  }

  const gitApi = gitExtension?.exports?.getAPI ? gitExtension.exports.getAPI(1) : null;

  if (typeof arg === 'object' && arg?.rootUri && gitApi) {
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

  if (gitApi && gitApi.repositories && gitApi.repositories.length > 0) {
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

  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    return { rootUri: vscode.workspace.workspaceFolders[0].uri };
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

/**
 * Get details of the latest commit (HEAD)
 */
export async function getLatestCommit(
  repo: any
): Promise<{ hash: string; message: string; author_name: string; date: string } | null> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      return null;
    }
    const git = simpleGit(rootPath);
    const log = await git.log({ maxCount: 1 });
    if (log.latest) {
      return {
        hash: log.latest.hash,
        message: log.latest.message,
        author_name: log.latest.author_name,
        date: log.latest.date
      };
    }
    return null;
  } catch (error) {
    Logger.error('Error fetching latest commit:', error);
    return null;
  }
}

/**
 * Safely undo the latest commit, keeping all code modifications intact.
 */
export async function gitSafeUndoCommit(
  repo: any,
  mode: 'soft' | 'mixed' = 'soft'
): Promise<{ message: string; hash: string } | null> {
  const rootPath =
    repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!rootPath) {
    throw new Error('No workspace folder found');
  }
  const git = simpleGit(rootPath);
  const latest = await getLatestCommit(repo);
  if (!latest) {
    throw new Error('No commits available to undo.');
  }

  if (mode === 'soft') {
    await git.reset(['--soft', 'HEAD~1']);
  } else {
    await git.reset(['HEAD~1']);
  }

  return { message: latest.message, hash: latest.hash };
}

/**
 * Get list of currently conflicted file paths
 */
export async function getConflictedFiles(repo: any): Promise<string[]> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      return [];
    }
    const git = simpleGit(rootPath);
    const status = await git.status();
    return status.conflicted || [];
  } catch (error) {
    Logger.error('Error fetching conflicted files:', error);
    return [];
  }
}

/**
 * Get all tags sorted by creation date
 */
export async function getGitTags(repo: any): Promise<string[]> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      return [];
    }
    const git = simpleGit(rootPath);
    const tags = await git.tags({ '--sort': '-creatordate' });
    return tags.all || [];
  } catch (error) {
    Logger.error('Error fetching git tags:', error);
    return [];
  }
}

/**
 * Create a new git tag
 */
export async function gitCreateTag(repo: any, tagName: string, message?: string): Promise<void> {
  const rootPath =
    repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!rootPath) {
    throw new Error('No workspace folder found');
  }
  const git = simpleGit(rootPath);
  if (message) {
    await git.addAnnotatedTag(tagName, message);
  } else {
    await git.addTag(tagName);
  }
}

/**
 * Find local branches that have been merged into the base branch (main/master)
 */
export async function getMergedBranches(
  repo: any,
  baseBranch?: string
): Promise<Array<{ name: string; lastCommit: string }>> {
  const rootPath =
    repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!rootPath) {
    return [];
  }
  const git = simpleGit(rootPath);
  const branches = await git.branchLocal();
  const current = branches.current;

  let targetBase = baseBranch;
  if (!targetBase) {
    if (branches.all.includes('main')) {
      targetBase = 'main';
    } else if (branches.all.includes('master')) {
      targetBase = 'master';
    } else if (branches.all.includes('develop')) {
      targetBase = 'develop';
    } else {
      targetBase = current;
    }
  }

  try {
    const mergedOutput = await git.branch(['--merged', targetBase]);
    const protectedBranches = new Set(['main', 'master', 'develop', 'dev', 'staging', 'production', current]);

    const mergedList: Array<{ name: string; lastCommit: string }> = [];
    for (const b of mergedOutput.all) {
      const cleanName = b.trim().replace(/^\*\s*/, '');
      if (!protectedBranches.has(cleanName) && branches.all.includes(cleanName)) {
        let lastCommitMsg = '';
        try {
          const log = await git.log({ maxCount: 1, from: cleanName });
          if (log.latest) {
            lastCommitMsg = `${log.latest.message} (${log.latest.date.split('T')[0]})`;
          }
        } catch {
          // Ignore log retrieval failure
        }
        mergedList.push({ name: cleanName, lastCommit: lastCommitMsg });
      }
    }
    return mergedList;
  } catch (error) {
    Logger.error('Failed to get merged branches:', error);
    return [];
  }
}

/**
 * Deletes local branches by name
 */
export async function deleteLocalBranches(
  repo: any,
  branchNames: string[],
  force: boolean = false
): Promise<{ success: string[]; failed: Array<{ branch: string; error: string }> }> {
  const rootPath =
    repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!rootPath) {
    throw new Error('No workspace folder found');
  }
  const git = simpleGit(rootPath);
  const success: string[] = [];
  const failed: Array<{ branch: string; error: string }> = [];

  for (const branch of branchNames) {
    try {
      await git.branch([force ? '-D' : '-d', branch]);
      success.push(branch);
    } catch (err: any) {
      failed.push({ branch, error: err?.message || String(err) });
    }
  }

  return { success, failed };
}

/**
 * Get commit list and cumulative diff for squashing
 */
export async function getCommitsForSquash(
  repo: any,
  count: number = 5
): Promise<{ commits: Array<{ hash: string; message: string; author: string }>; diff: string; error?: string | null }> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      throw new Error('No workspace folder found');
    }
    const git = simpleGit(rootPath);
    const log = await git.log({ maxCount: count });

    if (!log.all || log.all.length === 0) {
      return { commits: [], diff: '', error: 'No commits found.' };
    }

    const oldestHash = log.all[log.all.length - 1].hash;
    const diff = await git.diff([`${oldestHash}^...HEAD`]).catch(async () => {
      return await git.diff([`${oldestHash}...HEAD`]);
    });

    return {
      commits: log.all.map((c) => ({
        hash: c.hash.substring(0, 7),
        message: c.message,
        author: c.author_name
      })),
      diff: filterAndCompressDiff(diff || '', 30000),
      error: null
    };
  } catch (error: any) {
    Logger.error('Failed to get commits for squash:', error);
    return { commits: [], diff: '', error: error?.message || String(error) };
  }
}

/**
 * Get Remote Origin Web URL for GitHub or GitLab
 */
export async function getRemoteOriginUrl(repo: any): Promise<string> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      return '';
    }
    const git = simpleGit(rootPath);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === 'origin') || remotes[0];
    const fetchUrl = origin?.refs?.fetch || origin?.refs?.push || '';
    if (!fetchUrl) {
      return '';
    }

    // Convert SSH or Git URL to Web HTTPS URL
    // e.g. git@github.com:owner/repo.git -> https://github.com/owner/repo
    let webUrl = fetchUrl
      .replace(/^git@([^:]+):/, 'https://$1/')
      .replace(/\.git$/, '');
    return webUrl;
  } catch {
    return '';
  }
}

/**
 * Start a Git bisect session
 */
export async function gitBisectStart(
  repo: any,
  badCommit: string = 'HEAD',
  goodCommit: string
): Promise<string> {
  const rootPath =
    repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!rootPath) {
    throw new Error('No workspace folder found');
  }
  const git = simpleGit(rootPath);
  await git.raw(['bisect', 'reset']).catch(() => null);
  await git.raw(['bisect', 'start']);
  await git.raw(['bisect', 'bad', badCommit]);
  const output = await git.raw(['bisect', 'good', goodCommit]);
  return output;
}

/**
 * Mark current bisect commit as good, bad, or skip
 */
export async function gitBisectStep(
  repo: any,
  verdict: 'good' | 'bad' | 'skip'
): Promise<string> {
  const rootPath =
    repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!rootPath) {
    throw new Error('No workspace folder found');
  }
  const git = simpleGit(rootPath);
  const output = await git.raw(['bisect', verdict]);
  return output;
}

/**
 * Reset Git bisect back to original HEAD
 */
export async function gitBisectReset(repo: any): Promise<void> {
  const rootPath =
    repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!rootPath) {
    throw new Error('No workspace folder found');
  }
  const git = simpleGit(rootPath);
  await git.raw(['bisect', 'reset']).catch(() => null);
}

/**
 * Get list of incoming commits that the base branch has but current branch does not
 */
export async function getIncomingCommits(
  repo: any,
  baseBranch: string
): Promise<Array<{ hash: string; message: string; author: string }>> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      return [];
    }
    const git = simpleGit(rootPath);
    const log = await git.log({ from: 'HEAD', to: baseBranch, maxCount: 20 });
    return log.all.map((c) => ({
      hash: c.hash.substring(0, 7),
      message: c.message,
      author: c.author_name
    }));
  } catch {
    return [];
  }
}

/**
 * Sync branch using Rebase or Merge
 */
export async function gitSyncBranch(
  repo: any,
  baseBranch: string,
  strategy: 'rebase' | 'merge' = 'rebase'
): Promise<{ success: boolean; conflict: boolean; error?: string }> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      throw new Error('No workspace folder found');
    }
    const git = simpleGit(rootPath);

    // Fetch latest remote first if baseBranch is remote ref
    if (baseBranch.startsWith('origin/')) {
      await git.fetch().catch(() => null);
    }

    if (strategy === 'rebase') {
      try {
        await git.rebase([baseBranch]);
        return { success: true, conflict: false };
      } catch (err: any) {
        const status = await git.status().catch(() => null);
        if (status?.conflicted && status.conflicted.length > 0) {
          return { success: false, conflict: true, error: 'Rebase conflict detected' };
        }
        throw err;
      }
    } else {
      try {
        await git.merge([baseBranch]);
        return { success: true, conflict: false };
      } catch (err: any) {
        const status = await git.status().catch(() => null);
        if (status?.conflicted && status.conflicted.length > 0) {
          return { success: false, conflict: true, error: 'Merge conflict detected' };
        }
        throw err;
      }
    }
  } catch (err: any) {
    return { success: false, conflict: false, error: err?.message || String(err) };
  }
}

/**
 * Get Git Blame information for a specific line number in a file
 */
export async function getGitBlameForLine(
  repo: any,
  filePath: string,
  lineNumber: number
): Promise<{
  commitHash: string;
  author: string;
  authorEmail: string;
  authorDate: string;
  summary: string;
  lineContent: string;
  commitDiff: string;
  error?: string | null;
}> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      throw new Error('No workspace folder found');
    }
    const git = simpleGit(rootPath);
    const relativePath = filePath.startsWith(rootPath)
      ? filePath.substring(rootPath.length + 1)
      : filePath;

    const rawBlame = await git.raw([
      'blame',
      '-L',
      `${lineNumber},${lineNumber}`,
      '--line-porcelain',
      relativePath
    ]);

    const lines = rawBlame.split('\n');
    let commitHash = '';
    let author = 'Unknown';
    let authorEmail = '';
    let authorDate = '';
    let summary = '';
    let lineContent = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0) {
        commitHash = line.split(' ')[0] || '';
      } else if (line.startsWith('author ')) {
        author = line.substring(7);
      } else if (line.startsWith('author-mail ')) {
        authorEmail = line.substring(12).replace(/^<|>$/g, '');
      } else if (line.startsWith('author-time ')) {
        const timeSec = parseInt(line.substring(12), 10);
        if (!isNaN(timeSec)) {
          authorDate = new Date(timeSec * 1000).toLocaleString();
        }
      } else if (line.startsWith('summary ')) {
        summary = line.substring(8);
      } else if (line.startsWith('\t')) {
        lineContent = line.substring(1);
      }
    }

    let commitDiff = '';
    if (commitHash && !commitHash.startsWith('0000000')) {
      const details = await getCommitDetails(repo, commitHash);
      commitDiff = details.diff || '';
    }

    return {
      commitHash,
      author,
      authorEmail,
      authorDate,
      summary,
      lineContent,
      commitDiff: filterAndCompressDiff(commitDiff, 20000),
      error: null
    };
  } catch (error: any) {
    Logger.error('Failed to get git blame for line:', error);
    return {
      commitHash: '',
      author: '',
      authorEmail: '',
      authorDate: '',
      summary: '',
      lineContent: '',
      commitDiff: '',
      error: error?.message || String(error)
    };
  }
}

/**
 * Get cumulative Branch Diff and commits for Pull Request Review Simulator
 */
export async function getBranchDiffForPR(
  repo: any,
  baseBranch?: string
): Promise<{
  baseBranch: string;
  currentBranch: string;
  diff: string;
  commits: Array<{ hash: string; message: string; author: string }>;
  files: string[];
  error?: string | null;
}> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      throw new Error('No workspace folder found');
    }
    const git = simpleGit(rootPath);
    const branches = await git.branchLocal();
    const currentBranch = branches.current;

    let targetBase = baseBranch;
    if (!targetBase) {
      if (branches.all.includes('main')) {
        targetBase = 'main';
      } else if (branches.all.includes('master')) {
        targetBase = 'master';
      } else if (branches.all.includes('develop')) {
        targetBase = 'develop';
      } else {
        targetBase = 'origin/main';
      }
    }

    // Fetch commit logs between base and current branch
    let commits: Array<{ hash: string; message: string; author: string }> = [];
    try {
      const log = await git.log({ from: targetBase, to: currentBranch, maxCount: 40 });
      commits = log.all.map((c) => ({
        hash: c.hash.substring(0, 7),
        message: c.message,
        author: c.author_name
      }));
    } catch {
      // Fallback
    }

    // Get branch diff
    let diff = await git.diff([`${targetBase}...${currentBranch}`]).catch(async () => {
      return await git.diff([`${targetBase}..${currentBranch}`]);
    }).catch(async () => {
      return await git.diff(['HEAD~5']);
    });

    // Get summary of changed files
    const statusSummary = await git.diffSummary([`${targetBase}...${currentBranch}`]).catch(() => null);
    const files = statusSummary?.files.map((f) => f.file) || [];

    return {
      baseBranch: targetBase,
      currentBranch,
      diff: filterAndCompressDiff(diff || '', 35000),
      commits,
      files,
      error: null
    };
  } catch (error: any) {
    Logger.error('Failed to get branch diff for PR:', error);
    return {
      baseBranch: 'main',
      currentBranch: 'HEAD',
      diff: '',
      commits: [],
      files: [],
      error: error?.message || String(error)
    };
  }
}
