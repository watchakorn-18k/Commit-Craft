import simpleGit from 'simple-git';
import * as vscode from 'vscode';
import { Logger } from './logger';

export interface GitStatsSummary {
  currentBranch: string;
  userName?: string;
  userEmail?: string;
  remoteUrl?: string;
  stagedCount: number;
  unstagedCount: number;
  totalCommits: number;
  commitTypes: {
    feat: number;
    fix: number;
    refactor: number;
    docs: number;
    chore: number;
    test: number;
    style: number;
    other: number;
  };
  typePercentages: {
    feat: number;
    fix: number;
    refactor: number;
    docs: number;
    chore: number;
    test: number;
    style: number;
    other: number;
  };
  topContributors: Array<{ name: string; count: number }>;
  latestCommit: { hash: string; message: string; author: string; date: string } | null;
}

/**
 * Analyze recent Git commits and working directory to produce repository statistics.
 */
export async function getRepoGitStats(repo: any, sampleSize: number = 60): Promise<GitStatsSummary | null> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      return null;
    }

    const git = simpleGit(rootPath);
    const [status, branches, log, config, remotes] = await Promise.all([
      git.status().catch(() => null),
      git.branch().catch(() => null),
      git.log({ maxCount: sampleSize }).catch(() => null),
      git.listConfig().catch(() => null),
      git.getRemotes(true).catch(() => null)
    ]);

    const currentBranch = branches?.current || 'main';
    const stagedCount = status?.staged?.length || 0;
    const unstagedCount = (status?.modified?.length || 0) + (status?.not_added?.length || 0);

    // Git local user and remote info
    const userName = (config?.all?.['user.name'] as string) || '';
    const userEmail = (config?.all?.['user.email'] as string) || '';
    const originRemote = remotes?.find((r: any) => r.name === 'origin') || remotes?.[0];
    const remoteUrl = originRemote?.refs?.fetch || originRemote?.refs?.push || '';

    const commits = log?.all || [];
    const totalCommits = log?.total || commits.length;

    const commitTypes = {
      feat: 0,
      fix: 0,
      refactor: 0,
      docs: 0,
      chore: 0,
      test: 0,
      style: 0,
      other: 0
    };

    const contributorMap: Record<string, number> = {};

    for (const c of commits) {
      const msg = c.message.toLowerCase().trim();
      const author = c.author_name || 'Unknown';
      contributorMap[author] = (contributorMap[author] || 0) + 1;

      if (msg.startsWith('feat') || msg.includes('feature')) {
        commitTypes.feat++;
      } else if (msg.startsWith('fix') || msg.includes('bug') || msg.includes('hotfix')) {
        commitTypes.fix++;
      } else if (msg.startsWith('refactor') || msg.includes('cleanup') || msg.includes('restructure')) {
        commitTypes.refactor++;
      } else if (msg.startsWith('docs') || msg.includes('readme') || msg.includes('documentation')) {
        commitTypes.docs++;
      } else if (msg.startsWith('test') || msg.includes('coverage') || msg.includes('spec')) {
        commitTypes.test++;
      } else if (msg.startsWith('style') || msg.includes('format') || msg.includes('lint') || msg.includes('css')) {
        commitTypes.style++;
      } else if (msg.startsWith('chore') || msg.startsWith('build') || msg.startsWith('ci') || msg.startsWith('deps')) {
        commitTypes.chore++;
      } else {
        commitTypes.other++;
      }
    }

    const totalSampled = commits.length || 1;
    const typePercentages = {
      feat: Math.round((commitTypes.feat / totalSampled) * 100),
      fix: Math.round((commitTypes.fix / totalSampled) * 100),
      refactor: Math.round((commitTypes.refactor / totalSampled) * 100),
      docs: Math.round((commitTypes.docs / totalSampled) * 100),
      chore: Math.round((commitTypes.chore / totalSampled) * 100),
      test: Math.round((commitTypes.test / totalSampled) * 100),
      style: Math.round((commitTypes.style / totalSampled) * 100),
      other: Math.round((commitTypes.other / totalSampled) * 100)
    };

    const topContributors = Object.entries(contributorMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const latest = log?.latest
      ? {
          hash: log.latest.hash.substring(0, 7),
          message: log.latest.message,
          author: log.latest.author_name,
          date: log.latest.date.split('T')[0]
        }
      : null;

    return {
      currentBranch,
      userName,
      userEmail,
      remoteUrl,
      stagedCount,
      unstagedCount,
      totalCommits,
      commitTypes,
      typePercentages,
      topContributors,
      latestCommit: latest
    };
  } catch (error) {
    Logger.error('Failed to compute Git repository statistics:', error);
    return null;
  }
}
