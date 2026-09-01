import simpleGit from 'simple-git';
import * as vscode from 'vscode';
import { Logger } from './logger';

export interface ContributorImpact {
  name: string;
  total: number;
  feat: number;
  fix: number;
  refactor: number;
  other: number;
  percentage: number;
}

export interface DayActivity {
  dayLabel: string;
  dateStr: string;
  count: number;
  level: number; // 0 to 4 for heatmap colors
}

export interface BranchDivergence {
  baseBranch: string;
  ahead: number;
  behind: number;
  isUpToDate: boolean;
  statusText: string;
}

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
  teamLeaderboard: ContributorImpact[];
  divergence: BranchDivergence;
  weeklyActivity: DayActivity[];
  latestCommit: { hash: string; message: string; author: string; date: string } | null;
}

// In-memory lightweight cache to prevent excessive git subprocess spawning and RAM churn
interface CachedStats {
  timestamp: number;
  data: GitStatsSummary;
}
const statsCache = new Map<string, CachedStats>();
const STATS_CACHE_TTL_MS = 6000; // 6 seconds

/**
 * Clears cached git stats (call after commit, branch change, or manual refresh)
 */
export function clearGitStatsCache(rootPath?: string): void {
  if (rootPath) {
    statsCache.delete(rootPath);
  } else {
    statsCache.clear();
  }
}

/**
 * Analyze recent Git commits, branch divergence, and contributor leaderboard.
 */
export async function getRepoGitStats(
  repo: any,
  sampleSize: number = 80,
  forceRefresh: boolean = false
): Promise<GitStatsSummary | null> {
  try {
    const rootPath =
      repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      return null;
    }

    const nowTime = Date.now();
    const cached = statsCache.get(rootPath);
    if (!forceRefresh && cached && nowTime - cached.timestamp < STATS_CACHE_TTL_MS) {
      return cached.data;
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

    // Calculate Branch Divergence (Ahead / Behind)
    const allBranches = branches?.all || [];
    let targetBase = 'main';
    if (!allBranches.includes(targetBase)) {
      if (allBranches.includes('master')) {
        targetBase = 'master';
      } else if (allBranches.includes('develop')) {
        targetBase = 'develop';
      } else {
        targetBase = currentBranch;
      }
    }

    let ahead = 0;
    let behind = 0;
    let divergenceBase = targetBase;

    try {
      if (currentBranch === targetBase) {
        // Compare with remote tracking if on main/master
        const remoteRef = `origin/${targetBase}`;
        const revCount = await git.raw(['rev-list', '--left-right', '--count', `${remoteRef}...${currentBranch}`]).catch(() => null);
        if (revCount) {
          const parts = revCount.trim().split(/\s+/);
          behind = parseInt(parts[0], 10) || 0;
          ahead = parseInt(parts[1], 10) || 0;
          divergenceBase = remoteRef;
        }
      } else {
        const revCount = await git.raw(['rev-list', '--left-right', '--count', `${targetBase}...${currentBranch}`]).catch(() => null);
        if (revCount) {
          const parts = revCount.trim().split(/\s+/);
          behind = parseInt(parts[0], 10) || 0;
          ahead = parseInt(parts[1], 10) || 0;
        }
      }
    } catch {
      // Divergence calculation fallback
    }

    const isUpToDate = ahead === 0 && behind === 0;
    let statusText = 'Synced with ' + divergenceBase;
    if (behind > 0 && ahead > 0) {
      statusText = `${ahead} ahead, ${behind} behind ${divergenceBase}`;
    } else if (behind > 0) {
      statusText = `${behind} commits behind ${divergenceBase}`;
    } else if (ahead > 0) {
      statusText = `${ahead} commits ahead of ${divergenceBase}`;
    }

    const divergence: BranchDivergence = {
      baseBranch: divergenceBase,
      ahead,
      behind,
      isUpToDate,
      statusText
    };

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

    // Leaderboard impact tracking
    const authorStatsMap: Record<string, { total: number; feat: number; fix: number; refactor: number; other: number }> = {};

    // 7-day Activity Heatmap
    const now = new Date();
    const dayBuckets: Record<string, number> = {};
    const dayLabels: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const past7Days: DayActivity[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dayBuckets[key] = 0;
      past7Days.push({
        dayLabel: dayLabels[d.getDay()],
        dateStr: key,
        count: 0,
        level: 0
      });
    }

    for (const c of commits) {
      const msg = c.message.toLowerCase().trim();
      const author = c.author_name || 'Unknown';

      if (!authorStatsMap[author]) {
        authorStatsMap[author] = { total: 0, feat: 0, fix: 0, refactor: 0, other: 0 };
      }
      authorStatsMap[author].total++;

      // Track commit types
      if (msg.startsWith('feat') || msg.includes('feature')) {
        commitTypes.feat++;
        authorStatsMap[author].feat++;
      } else if (msg.startsWith('fix') || msg.includes('bug') || msg.includes('hotfix')) {
        commitTypes.fix++;
        authorStatsMap[author].fix++;
      } else if (msg.startsWith('refactor') || msg.includes('cleanup') || msg.includes('restructure')) {
        commitTypes.refactor++;
        authorStatsMap[author].refactor++;
      } else if (msg.startsWith('docs') || msg.includes('readme') || msg.includes('documentation')) {
        commitTypes.docs++;
        authorStatsMap[author].other++;
      } else if (msg.startsWith('test') || msg.includes('coverage') || msg.includes('spec')) {
        commitTypes.test++;
        authorStatsMap[author].other++;
      } else if (msg.startsWith('style') || msg.includes('format') || msg.includes('lint') || msg.includes('css')) {
        commitTypes.style++;
        authorStatsMap[author].other++;
      } else if (msg.startsWith('chore') || msg.startsWith('build') || msg.startsWith('ci') || msg.startsWith('deps')) {
        commitTypes.chore++;
        authorStatsMap[author].other++;
      } else {
        commitTypes.other++;
        authorStatsMap[author].other++;
      }

      // Track daily activity
      const commitDateStr = c.date ? c.date.split('T')[0] : '';
      if (commitDateStr && dayBuckets[commitDateStr] !== undefined) {
        dayBuckets[commitDateStr]++;
      }
    }

    // Populate past7Days counts & levels
    past7Days.forEach((day) => {
      day.count = dayBuckets[day.dateStr] || 0;
      if (day.count === 0) {
        day.level = 0;
      } else if (day.count <= 2) {
        day.level = 1;
      } else if (day.count <= 5) {
        day.level = 2;
      } else if (day.count <= 10) {
        day.level = 3;
      } else {
        day.level = 4;
      }
    });

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

    const teamLeaderboard: ContributorImpact[] = Object.entries(authorStatsMap)
      .map(([name, stat]) => ({
        name,
        total: stat.total,
        feat: stat.feat,
        fix: stat.fix,
        refactor: stat.refactor,
        other: stat.other,
        percentage: Math.round((stat.total / totalSampled) * 100)
      }))
      .sort((a, b) => b.total - a.total);

    const topContributors = teamLeaderboard.slice(0, 5).map(t => ({ name: t.name, count: t.total }));

    const latest = log?.latest
      ? {
          hash: log.latest.hash.substring(0, 7),
          message: log.latest.message,
          author: log.latest.author_name,
          date: log.latest.date.split('T')[0]
        }
      : null;

    const summary: GitStatsSummary = {
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
      teamLeaderboard,
      divergence,
      weeklyActivity: past7Days,
      latestCommit: latest
    };

    statsCache.set(rootPath, {
      timestamp: Date.now(),
      data: summary
    });

    return summary;
  } catch (error) {
    Logger.error('Failed to compute Git repository statistics:', error);
    return null;
  }
}
