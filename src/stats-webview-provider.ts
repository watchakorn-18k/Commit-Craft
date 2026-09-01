import * as vscode from 'vscode';
import { getRepo } from './git-utils';
import { getRepoGitStats, GitStatsSummary } from './git-stats';
import { smartSyncBranch } from './sync-utils';
import { ConfigKeys, ConfigurationManager } from './config';

/**
 * WebviewViewProvider for displaying Git visual Donut Chart, Branch Divergence, Leaderboard, and stats in the sidebar.
 */
export class GitStatsWebviewViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'commitcraft.statsView';
  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    // Update whenever view becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.update();
      }
    }, null, this._disposables);

    // Update when active editor changes
    vscode.window.onDidChangeActiveTextEditor(() => {
      if (this._view?.visible) {
        this.update();
      }
    }, null, this._disposables);

    // Initial render & retry
    this.update();
    setTimeout(() => {
      if (this._view?.visible) {
        this.update();
      }
    }, 800);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.command) {
        case 'refresh':
          await this.update();
          break;
        case 'copyStandup':
          if (data.text) {
            await vscode.env.clipboard.writeText(data.text);
            vscode.window.showInformationMessage('CommitCraft: Standup summary copied to clipboard!');
          }
          break;
        case 'openFullDashboard':
          vscode.commands.executeCommand('commitcraft.openDashboard');
          break;
        case 'syncBranch':
          await smartSyncBranch(undefined, data.baseBranch);
          await this.update();
          break;
      }
    }, null, this._disposables);
  }

  public async update() {
    if (!this._view) {
      return;
    }

    let repo: any;
    try {
      repo = await getRepo();
    } catch {
      // Fallback
    }

    const stats = repo ? await getRepoGitStats(repo, 80) : null;
    this._view.webview.html = this._getHtml(stats);
  }

  public dispose() {
    this._disposables.forEach((d) => d.dispose());
  }

  private _getHtml(stats: GitStatsSummary | null): string {
    const isThai = ConfigurationManager.getInstance().getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'th') === 'th';

    const svgRefresh = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
    const svgCopy = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    const svgBranch = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>`;
    const svgUser = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    const svgLink = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
    const svgTrophy = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`;
    const svgMaximize = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

    if (!stats) {
      return `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: var(--vscode-font-family); padding: 16px; font-size: 12px; color: var(--vscode-descriptionForeground); text-align: center; }
          .btn-retry {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 10px;
            font-size: 11px;
            display: inline-flex;
            align-items: center;
            gap: 5px;
          }
        </style>
      </head>
      <body>
        <div>${isThai ? 'กำลังเชื่อมต่อ Git Repository...' : 'Connecting to Git repository...'}</div>
        <button class="btn-retry" onclick="vscode.postMessage({ command: 'refresh' })">
          ${svgRefresh} ${isThai ? 'รีเฟรชข้อมูล' : 'Refresh'}
        </button>
        <script>
          const vscode = acquireVsCodeApi();
          setTimeout(() => { vscode.postMessage({ command: 'refresh' }); }, 1200);
        </script>
      </body></html>`;
    }

    const total = (stats.commitTypes.feat + stats.commitTypes.fix + stats.commitTypes.refactor +
                   stats.commitTypes.docs + stats.commitTypes.chore + stats.commitTypes.test +
                   stats.commitTypes.style + stats.commitTypes.other) || 1;

    // SVG Donut calculation
    const data = [
      { label: 'Features (feat)', count: stats.commitTypes.feat, color: '#10b981' },
      { label: 'Bug Fixes (fix)', count: stats.commitTypes.fix, color: '#ef4444' },
      { label: 'Refactoring (refactor)', count: stats.commitTypes.refactor, color: '#3b82f6' },
      { label: 'Docs (docs)', count: stats.commitTypes.docs, color: '#06b6d4' },
      { label: 'Maintenance (chore)', count: stats.commitTypes.chore, color: '#8b5cf6' },
      { label: 'Tests (test)', count: stats.commitTypes.test, color: '#f59e0b' },
      { label: 'Styles (style)', count: stats.commitTypes.style, color: '#ec4899' },
      { label: 'Other', count: stats.commitTypes.other, color: '#6b7280' }
    ].filter(d => d.count > 0);

    let cumulativePercent = 0;
    const slices = data.map((slice) => {
      const percent = slice.count / total;
      const strokeDasharray = `${percent * 283} 283`;
      const strokeDashoffset = -cumulativePercent * 283;
      cumulativePercent += percent;
      return `<circle r="45" cx="50" cy="50" fill="transparent" stroke="${slice.color}" stroke-width="12" stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round" />`;
    }).join('');

    // Divergence badge styling
    const div = stats.divergence;
    let divBadgeClass = 'div-synced';
    let divBadgeText = `✓ Synced with ${div.baseBranch}`;
    if (div.behind > 0) {
      divBadgeClass = 'div-behind';
      divBadgeText = `⚠️ Behind ${div.behind} • Ahead ${div.ahead}`;
    } else if (div.ahead > 0) {
      divBadgeClass = 'div-ahead';
      divBadgeText = `↑ ${div.ahead} Ahead of ${div.baseBranch}`;
    }

    const standupMarkdown = `### Git Activity & Standup Summary
- **User**: \`${stats.userName || 'Unknown'}\` <${stats.userEmail || ''}>
- **Branch**: \`${stats.currentBranch}\` (${stats.divergence.statusText})
- **Total Analyzed Commits**: ${total}
- **Key Features (\`feat\`)**: ${stats.commitTypes.feat} (${stats.typePercentages.feat}%)
- **Bug Fixes (\`fix\`)**: ${stats.commitTypes.fix} (${stats.typePercentages.fix}%)
- **Refactoring (\`refactor\`)**: ${stats.commitTypes.refactor} (${stats.typePercentages.refactor}%)
- **Latest Commit**: \`${stats.latestCommit?.hash || ''}\` - ${stats.latestCommit?.message || ''}`;

    const cleanRemote = stats.remoteUrl
      ? stats.remoteUrl.replace(/^https?:\/\//, '').replace(/^git@github\.com:/, 'github.com/').replace(/^git@gitlab\.com:/, 'gitlab.com/')
      : '';

    // Heatmap level colors
    const heatmapColors = [
      'rgba(255,255,255,0.06)',
      '#0e4429',
      '#006d32',
      '#26a641',
      '#39d353'
    ];

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      padding: 10px 14px 16px 14px;
      margin: 0;
      font-size: 12px;
      line-height: 1.4;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
    }
    .branch-tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 11px;
    }
    .btn-group {
      display: flex;
      gap: 4px;
    }
    .icon-btn {
      background: transparent;
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.15));
      color: var(--vscode-foreground);
      border-radius: 4px;
      cursor: pointer;
      padding: 3px 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .icon-btn:hover {
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1));
    }
    .divergence-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 8px;
      border-radius: 4px;
      font-size: 11px;
      margin-bottom: 12px;
      font-weight: 500;
    }
    .div-synced {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.25);
    }
    .div-ahead {
      background: rgba(59, 130, 246, 0.12);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.25);
    }
    .div-behind {
      background: rgba(239, 68, 68, 0.12);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.25);
    }
    .btn-rebase-tag {
      background: #ef4444;
      color: #ffffff;
      border: none;
      border-radius: 3px;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.2);
    }
    .btn-rebase-tag:hover {
      opacity: 0.88;
      transform: scale(1.02);
    }
    .chart-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 12px;
    }
    .donut-svg {
      transform: rotate(-90deg);
      width: 130px;
      height: 130px;
    }
    .stats-subtitle {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      margin-top: 4px;
    }
    .legend-grid {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
      margin-bottom: 14px;
    }
    .legend-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11.5px;
    }
    .legend-label {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .legend-value {
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    
    /* 7-day Activity Heatmap */
    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .heatmap-row {
      display: flex;
      justify-content: space-between;
      gap: 4px;
      margin-bottom: 14px;
    }
    .heat-cell {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    .heat-box {
      width: 100%;
      height: 16px;
      border-radius: 3px;
    }
    .heat-day {
      font-size: 9px;
      color: var(--vscode-descriptionForeground);
    }

    /* Leaderboard list */
    .leader-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: 14px;
    }
    .leader-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 6px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.06));
      font-size: 11px;
    }
    .leader-rank {
      font-weight: 700;
      color: var(--vscode-descriptionForeground);
      margin-right: 4px;
    }

    .user-meta-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
      border-radius: 6px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
      white-space: nowrap;
    }
    .meta-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meta-user-name {
      color: var(--vscode-foreground);
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="branch-tag">
      ${svgBranch}
      <span>${stats.currentBranch}</span>
    </div>
    <div class="btn-group">
      <button class="icon-btn" title="${isThai ? 'เปิดแดชบอร์ดเต็ม' : 'Open full dashboard'}" onclick="vscode.postMessage({ command: 'openFullDashboard' })">
        ${svgMaximize}
      </button>
      <button class="icon-btn" title="${isThai ? 'รีเฟรชข้อมูล' : 'Refresh stats'}" onclick="vscode.postMessage({ command: 'refresh' })">
        ${svgRefresh}
      </button>
      <button class="icon-btn" title="${isThai ? 'คัดลอก Standup Summary' : 'Copy standup summary'}" onclick="copyStandup()">
        ${svgCopy}
      </button>
    </div>
  </div>

  <!-- Branch Divergence Meter Banner with Interactive Rebase Button -->
  <div class="divergence-banner ${divBadgeClass}">
    <span>${divBadgeText}</span>
    ${div.behind > 0 ? `
      <button class="btn-rebase-tag" title="${isThai ? 'คลิกเพื่อ Sync / Rebase อัตโนมัติ' : 'Click to Sync / Rebase'}" onclick="vscode.postMessage({ command: 'syncBranch', baseBranch: '${div.baseBranch}' })">
        ⚡ ${isThai ? 'Rebase' : 'Rebase'}
      </button>
    ` : `<span style="font-size:10px; opacity:0.8;">OK</span>`}
  </div>

  <!-- SVG Donut Chart -->
  <div class="chart-container">
    <svg class="donut-svg" viewBox="0 0 100 100">
      <circle r="45" cx="50" cy="50" fill="transparent" stroke="rgba(255,255,255,0.06)" stroke-width="12" />
      ${slices}
    </svg>
    <div class="stats-subtitle">${total} commits (${stats.stagedCount} staged / ${stats.unstagedCount} modified)</div>
  </div>

  <!-- Conventional Breakdown List -->
  <div class="legend-grid">
    ${data.map(d => `
      <div class="legend-row">
        <span class="legend-label">
          <span class="dot" style="background:${d.color}"></span>
          <span>${d.label}</span>
        </span>
        <span class="legend-value">${d.count} (${Math.round((d.count / total) * 100)}%)</span>
      </div>
    `).join('')}
  </div>

  <!-- 7-Day Velocity Activity Heatmap -->
  <div class="section-title">
    <span>7-Day Velocity Heatmap</span>
  </div>
  <div class="heatmap-row">
    ${stats.weeklyActivity.map(day => `
      <div class="heat-cell" title="${day.dateStr}: ${day.count} commits">
        <div class="heat-box" style="background:${heatmapColors[day.level]};"></div>
        <span class="heat-day">${day.dayLabel}</span>
      </div>
    `).join('')}
  </div>

  <!-- Team Leaderboard Preview -->
  ${stats.teamLeaderboard && stats.teamLeaderboard.length > 0 ? `
  <div class="section-title">
    ${svgTrophy}
    <span>${isThai ? 'Top Contributors' : 'Team Impact'}</span>
  </div>
  <div class="leader-list">
    ${stats.teamLeaderboard.slice(0, 3).map((author, idx) => `
      <div class="leader-item">
        <span><strong class="leader-rank">#${idx + 1}</strong> ${author.name}</span>
        <span>
          <span style="color:#10b981; margin-right:4px;">${author.feat}f</span>
          <span style="color:#ef4444; margin-right:4px;">${author.fix}b</span>
          <strong>${author.total}</strong>
        </span>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- Git Local User & Remote Info -->
  <div class="user-meta-card">
    ${stats.userName || stats.userEmail ? `
      <div class="meta-item" title="${stats.userName} &lt;${stats.userEmail}&gt;">
        ${svgUser}
        <span class="meta-text">
          <span class="meta-user-name">${stats.userName || 'Git User'}</span>
          ${stats.userEmail ? `&lt;${stats.userEmail}&gt;` : ''}
        </span>
      </div>
    ` : ''}
    ${cleanRemote ? `
      <div class="meta-item" title="${stats.remoteUrl}">
        ${svgLink}
        <span class="meta-text">${cleanRemote}</span>
      </div>
    ` : ''}
  </div>

  <div style="display:none;" id="standupText">${standupMarkdown}</div>

  <script>
    const vscode = acquireVsCodeApi();
    function copyStandup() {
      const text = document.getElementById('standupText').innerText;
      vscode.postMessage({ command: 'copyStandup', text: text });
    }
  </script>
</body>
</html>`;
  }
}
