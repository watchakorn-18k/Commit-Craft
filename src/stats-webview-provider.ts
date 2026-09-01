import * as vscode from 'vscode';
import { getRepo } from './git-utils';
import { getRepoGitStats, GitStatsSummary } from './git-stats';
import { ConfigKeys, ConfigurationManager } from './config';

/**
 * WebviewViewProvider for displaying Git visual Donut Chart and statistics directly in the sidebar.
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

    // Initial render & retry after brief delay to ensure Git extension initialization
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

    const stats = repo ? await getRepoGitStats(repo, 60) : null;
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
          // Auto retry once in case Git extension finished loading
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

    const standupMarkdown = `### Git Activity & Standup Summary
- **Branch**: \`${stats.currentBranch}\`
- **Total Analyzed Commits**: ${total}
- **Key Features (\`feat\`)**: ${stats.commitTypes.feat} (${stats.typePercentages.feat}%)
- **Bug Fixes (\`fix\`)**: ${stats.commitTypes.fix} (${stats.typePercentages.fix}%)
- **Refactoring (\`refactor\`)**: ${stats.commitTypes.refactor} (${stats.typePercentages.refactor}%)
- **Latest Commit**: \`${stats.latestCommit?.hash || ''}\` - ${stats.latestCommit?.message || ''}`;

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
      margin-bottom: 12px;
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
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="branch-tag">
      ${svgBranch}
      <span>${stats.currentBranch}</span>
    </div>
    <div class="btn-group">
      <button class="icon-btn" title="${isThai ? 'รีเฟรชข้อมูล' : 'Refresh stats'}" onclick="vscode.postMessage({ command: 'refresh' })">
        ${svgRefresh}
      </button>
      <button class="icon-btn" title="${isThai ? 'คัดลอก Standup Summary' : 'Copy standup summary'}" onclick="copyStandup()">
        ${svgCopy}
      </button>
    </div>
  </div>

  <div class="chart-container">
    <svg class="donut-svg" viewBox="0 0 100 100">
      <circle r="45" cx="50" cy="50" fill="transparent" stroke="rgba(255,255,255,0.06)" stroke-width="12" />
      ${slices}
    </svg>
    <div class="stats-subtitle">${total} commits (${stats.stagedCount} staged / ${stats.unstagedCount} modified)</div>
  </div>

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
