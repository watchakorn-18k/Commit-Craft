import * as vscode from 'vscode';
import { getRepo } from './git-utils';
import { getRepoGitStats, GitStatsSummary } from './git-stats';
import { ConfigKeys, ConfigurationManager } from './config';

/**
 * Visual Webview Dashboard displaying Git statistics, Donut/Pie Chart, and Insights.
 */
export class GitStatsDashboardPanel {
  public static currentPanel: GitStatsDashboardPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static async createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (GitStatsDashboardPanel.currentPanel) {
      GitStatsDashboardPanel.currentPanel._panel.reveal(column);
      await GitStatsDashboardPanel.currentPanel.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'commitcraftStatsDashboard',
      'CommitCraft — Git Visual Dashboard',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'images')]
      }
    );

    GitStatsDashboardPanel.currentPanel = new GitStatsDashboardPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this.update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'refresh':
            await this.update();
            vscode.window.showInformationMessage('CommitCraft: Dashboard refreshed!');
            break;
          case 'copyStandup':
            if (message.text) {
              await vscode.env.clipboard.writeText(message.text);
              vscode.window.showInformationMessage('CommitCraft: Standup summary copied to clipboard!');
            }
            break;
          case 'openSettings':
            vscode.commands.executeCommand('commitcraft.openSettings');
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public async update() {
    let repo: any;
    try {
      repo = await getRepo();
    } catch {
      // Fallback
    }

    const stats = repo ? await getRepoGitStats(repo, 80) : null;
    this._panel.webview.html = this._getHtmlForWebview(stats);
  }

  public dispose() {
    GitStatsDashboardPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview(stats: GitStatsSummary | null): string {
    const isThai = ConfigurationManager.getInstance().getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'th') === 'th';

    if (!stats) {
      return `<!DOCTYPE html>
      <html>
      <head><style>body { font-family: var(--vscode-font-family); padding: 30px; text-align: center; color: var(--vscode-foreground); }</style></head>
      <body>
        <h2>${isThai ? 'ไม่พบข้อมูล Git Repository ใน Workspace นี้' : 'No Git Repository detected in active workspace.'}</h2>
        <p>${isThai ? 'กรุณาเปิดโฟลเดอร์ที่มี Git อยู่' : 'Please open a valid Git workspace folder.'}</p>
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
      return `<circle r="45" cx="50" cy="50" fill="transparent" stroke="${slice.color}" stroke-width="10" stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round" />`;
    }).join('');

    const standupMarkdown = `### 📊 Daily / Weekly Standup Report
- **Branch**: \`${stats.currentBranch}\`
- **Total Analyzed Commits**: ${total}
- **Key Features (\`feat\`)**: ${stats.commitTypes.feat} (${stats.typePercentages.feat}%)
- **Bug Fixes (\`fix\`)**: ${stats.commitTypes.fix} (${stats.typePercentages.fix}%)
- **Refactoring (\`refactor\`)**: ${stats.commitTypes.refactor} (${stats.typePercentages.refactor}%)
- **Documentation & Maintenance**: ${stats.commitTypes.docs + stats.commitTypes.chore} commits
- **Latest Commit**: \`${stats.latestCommit?.hash || ''}\` - ${stats.latestCommit?.message || ''}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CommitCraft Git Dashboard</title>
  <style>
    :root {
      --card-bg: var(--vscode-editor-background);
      --card-border: var(--vscode-widget-border, rgba(255, 255, 255, 0.1));
      --text: var(--vscode-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --accent: #3b82f6;
    }
    body {
      font-family: var(--vscode-font-family);
      background-color: var(--vscode-sideBar-background);
      color: var(--text);
      margin: 0;
      padding: 24px;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 16px;
    }
    .title {
      font-size: 20px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      font-size: 13px;
    }
    .btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      margin-right: 8px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .card-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .card-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--text);
    }
    .main-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }
    @media (max-width: 768px) {
      .main-section { grid-template-columns: 1fr; }
    }
    .chart-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .donut-svg {
      transform: rotate(-90deg);
      width: 180px;
      height: 180px;
    }
    .legend-list {
      width: 100%;
      margin-top: 16px;
    }
    .legend-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      margin-bottom: 8px;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 8px;
    }
    .progress-bar-bg {
      background: rgba(255,255,255,0.08);
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 4px;
      margin-bottom: 12px;
    }
    .progress-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .standup-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 16px;
    }
    pre {
      background: rgba(0,0,0,0.2);
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 12px;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <span>📊</span>
      <span>${isThai ? 'แดชบอร์ดสรุปสถิติ Git & Conventional Commits' : 'Git Visual Analytics & Insights'}</span>
    </div>
    <div>
      <button class="btn btn-secondary" onclick="vscode.postMessage({ command: 'refresh' })">🔄 ${isThai ? 'รีเฟรช' : 'Refresh'}</button>
      <button class="btn" onclick="copyStandup()">📋 ${isThai ? 'คัดลอก Standup Report' : 'Copy Standup Report'}</button>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-label">🌿 ${isThai ? 'กิ่งปัจจุบัน (Branch)' : 'Active Branch'}</div>
      <div class="card-value" style="font-size: 18px;">${stats.currentBranch}</div>
      <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
        ${stats.stagedCount} Staged / ${stats.unstagedCount} Modified
      </div>
    </div>
    <div class="card">
      <div class="card-label">⚡ ${isThai ? 'Commits ตัวอย่าง' : 'Analyzed Commits'}</div>
      <div class="card-value">${total}</div>
      <div style="font-size: 12px; color: #10b981; margin-top: 4px;">${stats.commitTypes.feat} Features added</div>
    </div>
    <div class="card">
      <div class="card-label">🐛 ${isThai ? 'การแก้บั๊ก (Bug Fixes)' : 'Bug Fix Ratio'}</div>
      <div class="card-value">${stats.typePercentages.fix}%</div>
      <div style="font-size: 12px; color: #ef4444; margin-top: 4px;">${stats.commitTypes.fix} bug fix commits</div>
    </div>
    <div class="card">
      <div class="card-label">👥 ${isThai ? 'ผู้ร่วมทำโค้ด (Contributors)' : 'Contributors'}</div>
      <div class="card-value">${stats.topContributors.length}</div>
      <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
        Top: ${stats.topContributors[0]?.name || 'You'} (${stats.topContributors[0]?.count || 0})
      </div>
    </div>
  </div>

  <div class="main-section">
    <!-- Donut Chart -->
    <div class="card chart-box">
      <div class="card-label" style="align-self: flex-start;">🍩 ${isThai ? 'กราฟสัดส่วนประเภท Conventional Commits' : 'Commit Types Distribution'}</div>
      <svg class="donut-svg" viewBox="0 0 100 100">
        <circle r="45" cx="50" cy="50" fill="transparent" stroke="rgba(255,255,255,0.05)" stroke-width="10" />
        ${slices}
      </svg>
      <div class="legend-list">
        ${data.map(d => `
          <div class="legend-item">
            <span><span class="legend-dot" style="background:${d.color}"></span>${d.label}</span>
            <span style="font-weight:600">${d.count} (${Math.round((d.count / total) * 100)}%)</span>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Breakdown Bars -->
    <div class="card">
      <div class="card-label">📈 ${isThai ? 'เจาะลึกประเภทงาน (Breakdown)' : 'Engineering Velocity Breakdown'}</div>
      
      <div>
        <div style="display:flex; justify-content:space-between; font-size:13px;">
          <span>✨ Features (\`feat\`)</span>
          <span>${stats.commitTypes.feat} commits (${stats.typePercentages.feat}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${stats.typePercentages.feat}%; background:#10b981;"></div>
        </div>
      </div>

      <div>
        <div style="display:flex; justify-content:space-between; font-size:13px;">
          <span>🐛 Bug Fixes (\`fix\`)</span>
          <span>${stats.commitTypes.fix} commits (${stats.typePercentages.fix}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${stats.typePercentages.fix}%; background:#ef4444;"></div>
        </div>
      </div>

      <div>
        <div style="display:flex; justify-content:space-between; font-size:13px;">
          <span>♻️ Code Refactoring (\`refactor\`)</span>
          <span>${stats.commitTypes.refactor} commits (${stats.typePercentages.refactor}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${stats.typePercentages.refactor}%; background:#3b82f6;"></div>
        </div>
      </div>

      <div>
        <div style="display:flex; justify-content:space-between; font-size:13px;">
          <span>📝 Documentation (\`docs\`)</span>
          <span>${stats.commitTypes.docs} commits (${stats.typePercentages.docs}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${stats.typePercentages.docs}%; background:#06b6d4;"></div>
        </div>
      </div>

      <div>
        <div style="display:flex; justify-content:space-between; font-size:13px;">
          <span>🔧 Chores & Maintenance (\`chore\`)</span>
          <span>${stats.commitTypes.chore} commits (${stats.typePercentages.chore}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${stats.typePercentages.chore}%; background:#8b5cf6;"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="standup-box">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
      <div class="card-label">📝 ${isThai ? 'ตัวอย่าง Daily / Sprint Standup Summary (พร้อมส่ง)' : 'Sprint / Standup Summary Markdown'}</div>
      <button class="btn" style="padding: 4px 10px; font-size: 12px;" onclick="copyStandup()">📋 Copy</button>
    </div>
    <pre id="standupText">${standupMarkdown}</pre>
  </div>

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
