import * as vscode from 'vscode';
import { getRepo } from './git-utils';
import { getRepoGitStats, GitStatsSummary } from './git-stats';
import { ConfigKeys, ConfigurationManager } from './config';

/**
 * Visual Webview Dashboard displaying Git statistics, Donut/Pie Chart, Branch Divergence Meter, and Team Leaderboard.
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

    const standupMarkdown = `### Git Activity & Standup Summary
- **User**: \`${stats.userName || 'Unknown'}\` <${stats.userEmail || ''}>
- **Remote Origin**: \`${stats.remoteUrl || 'Local only'}\`
- **Branch**: \`${stats.currentBranch}\` (${stats.divergence.statusText})
- **Total Analyzed Commits**: ${total}
- **Key Features (\`feat\`)**: ${stats.commitTypes.feat} (${stats.typePercentages.feat}%)
- **Bug Fixes (\`fix\`)**: ${stats.commitTypes.fix} (${stats.typePercentages.fix}%)
- **Refactoring (\`refactor\`)**: ${stats.commitTypes.refactor} (${stats.typePercentages.refactor}%)
- **Documentation & Maintenance**: ${stats.commitTypes.docs + stats.commitTypes.chore} commits
- **Latest Commit**: \`${stats.latestCommit?.hash || ''}\` - ${stats.latestCommit?.message || ''}`;

    // Inline SVG Icons
    const svgBarChart = `<svg class="icon-svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>`;
    const svgRefresh = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
    const svgCopy = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    const svgBranch = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>`;
    const svgCommit = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><line x1="1.05" y1="12" x2="7" y2="12"></line><line x1="17.01" y1="12" x2="22.96" y2="12"></line></svg>`;
    const svgBug = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="14" x="8" y="6" rx="4"></rect><path d="m19 7-3 2M5 7l3 2M19 19l-3-2M5 19l3-2M20 13h-4M4 13h4M10 4v2M14 4v2"></path></svg>`;
    const svgUsers = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
    const svgPie = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>`;
    const svgActivity = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`;
    const svgSparkle = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`;
    const svgRefactor = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
    const svgDoc = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
    const svgWrench = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`;
    const svgUser = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    const svgLink = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
    const svgTrophy = `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`;
    const svgCompass = `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`;

    const div = stats.divergence;

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
      gap: 10px;
    }
    .icon-svg {
      vertical-align: middle;
      display: inline-block;
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
      display: inline-flex;
      align-items: center;
      gap: 6px;
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
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .card-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--text);
    }
    .meta-bar {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      font-size: 13px;
    }
    .meta-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-muted);
    }
    .meta-pill strong {
      color: var(--text);
    }

    /* Divergence Banner */
    .divergence-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .divergence-gauge {
      display: flex;
      gap: 24px;
    }
    .gauge-item {
      display: flex;
      flex-direction: column;
    }
    .gauge-num {
      font-size: 22px;
      font-weight: 700;
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
      margin-top: 6px;
      margin-bottom: 14px;
    }
    .progress-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    /* Leaderboard Table */
    .leader-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-top: 8px;
    }
    .leader-table th {
      text-align: left;
      padding: 8px 10px;
      border-bottom: 1px solid var(--card-border);
      color: var(--text-muted);
      font-weight: 600;
    }
    .leader-table td {
      padding: 10px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
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
      ${svgBarChart}
      <span>${isThai ? 'แดชบอร์ดสรุปสถิติ Git & Conventional Commits' : 'Git Visual Analytics & Insights'}</span>
    </div>
    <div>
      <button class="btn btn-secondary" onclick="vscode.postMessage({ command: 'refresh' })">
        ${svgRefresh} ${isThai ? 'รีเฟรช' : 'Refresh'}
      </button>
      <button class="btn" onclick="copyStandup()">
        ${svgCopy} ${isThai ? 'คัดลอก Standup Report' : 'Copy Standup Report'}
      </button>
    </div>
  </div>

  <!-- Git Local User & Remote Info Bar -->
  <div class="meta-bar">
    <div class="meta-pill">
      ${svgUser}
      <span>${isThai ? 'ผู้ใช้งาน Git Local' : 'Local User'}: <strong>${stats.userName || 'Git User'}</strong> ${stats.userEmail ? `&lt;${stats.userEmail}&gt;` : ''}</span>
    </div>
    ${stats.remoteUrl ? `
    <div class="meta-pill">
      ${svgLink}
      <span>${isThai ? 'Remote Origin' : 'Remote'}: <strong>${stats.remoteUrl}</strong></span>
    </div>` : ''}
  </div>

  <!-- Branch Divergence Meter Card -->
  <div class="divergence-box">
    <div>
      <div class="card-label">${svgCompass} ${isThai ? 'Branch Divergence Meter (วัดระยะห่างกับ Base Branch)' : 'Branch Divergence Meter'}</div>
      <div style="font-size: 16px; font-weight: 600; color: var(--text);">
        ${div.isUpToDate ? `🌿 ${isThai ? 'กิ่งนี้ตรงกับ' : 'Branch is perfectly in sync with'} ${div.baseBranch}` : `${stats.currentBranch} ➔ ${div.statusText}`}
      </div>
      <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
        ${div.behind > 0 ? (isThai ? '⚠️ แนะนำให้ Rebase หรือ Merge เพื่อป้องกัน Conflict ใหญ่' : '⚠️ Pull or Rebase recommended to avoid merge conflicts') : (isThai ? 'พร้อมสำหรับการ Push หรือสร้าง Pull Request' : 'Ready to push or create Pull Request')}
      </div>
    </div>
    <div class="divergence-gauge">
      <div class="gauge-item">
        <span style="font-size: 11px; color: #60a5fa;">AHEAD (นำหน้า)</span>
        <span class="gauge-num" style="color: #60a5fa;">↑ ${div.ahead}</span>
      </div>
      <div class="gauge-item">
        <span style="font-size: 11px; color: ${div.behind > 0 ? '#ef4444' : 'var(--text-muted)'};">BEHIND (ล้าหลัง)</span>
        <span class="gauge-num" style="color: ${div.behind > 0 ? '#ef4444' : 'var(--text-muted)'};">↓ ${div.behind}</span>
      </div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-label">${svgBranch} ${isThai ? 'Branch ปัจจุบัน' : 'Active Branch'}</div>
      <div class="card-value" style="font-size: 18px;">${stats.currentBranch}</div>
      <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
        ${stats.stagedCount} Staged / ${stats.unstagedCount} Modified
      </div>
    </div>
    <div class="card">
      <div class="card-label">${svgCommit} ${isThai ? 'Commits ตัวอย่าง' : 'Analyzed Commits'}</div>
      <div class="card-value">${total}</div>
      <div style="font-size: 12px; color: #10b981; margin-top: 4px;">${stats.commitTypes.feat} Features added</div>
    </div>
    <div class="card">
      <div class="card-label">${svgBug} ${isThai ? 'การแก้บั๊ก (Bug Fixes)' : 'Bug Fix Ratio'}</div>
      <div class="card-value">${stats.typePercentages.fix}%</div>
      <div style="font-size: 12px; color: #ef4444; margin-top: 4px;">${stats.commitTypes.fix} bug fix commits</div>
    </div>
    <div class="card">
      <div class="card-label">${svgUsers} ${isThai ? 'ผู้ร่วมทำโค้ด (Contributors)' : 'Contributors'}</div>
      <div class="card-value">${stats.topContributors.length}</div>
      <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
        Top: ${stats.topContributors[0]?.name || 'You'} (${stats.topContributors[0]?.count || 0})
      </div>
    </div>
  </div>

  <div class="main-section">
    <!-- Donut Chart -->
    <div class="card chart-box">
      <div class="card-label" style="align-self: flex-start;">${svgPie} ${isThai ? 'สัดส่วนประเภท Conventional Commits' : 'Commit Types Distribution'}</div>
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
      <div class="card-label">${svgActivity} ${isThai ? 'เจาะลึกประเภทงาน (Breakdown)' : 'Engineering Velocity Breakdown'}</div>
      
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
          <span style="display:inline-flex; align-items:center; gap:6px;">${svgSparkle} Features (\`feat\`)</span>
          <span>${stats.commitTypes.feat} commits (${stats.typePercentages.feat}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${stats.typePercentages.feat}%; background:#10b981;"></div>
        </div>
      </div>

      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
          <span style="display:inline-flex; align-items:center; gap:6px;">${svgBug} Bug Fixes (\`fix\`)</span>
          <span>${stats.commitTypes.fix} commits (${stats.typePercentages.fix}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${stats.typePercentages.fix}%; background:#ef4444;"></div>
        </div>
      </div>

      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
          <span style="display:inline-flex; align-items:center; gap:6px;">${svgRefactor} Code Refactoring (\`refactor\`)</span>
          <span>${stats.commitTypes.refactor} commits (${stats.typePercentages.refactor}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${stats.typePercentages.refactor}%; background:#3b82f6;"></div>
        </div>
      </div>

      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
          <span style="display:inline-flex; align-items:center; gap:6px;">${svgDoc} Documentation (\`docs\`)</span>
          <span>${stats.commitTypes.docs} commits (${stats.typePercentages.docs}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${stats.typePercentages.docs}%; background:#06b6d4;"></div>
        </div>
      </div>

      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
          <span style="display:inline-flex; align-items:center; gap:6px;">${svgWrench} Chores & Maintenance (\`chore\`)</span>
          <span>${stats.commitTypes.chore} commits (${stats.typePercentages.chore}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${stats.typePercentages.chore}%; background:#8b5cf6;"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Team Leaderboard & Code Impact Matrix Table -->
  <div class="card" style="margin-bottom: 24px;">
    <div class="card-label">${svgTrophy} ${isThai ? 'Team Leaderboard & Code Impact Matrix (จัดอันดับผลงานทีม)' : 'Team Leaderboard & Impact Matrix'}</div>
    <table class="leader-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Contributor</th>
          <th>Features</th>
          <th>Bug Fixes</th>
          <th>Refactor</th>
          <th>Total Commits</th>
          <th>Share</th>
        </tr>
      </thead>
      <tbody>
        ${stats.teamLeaderboard.map((item, idx) => `
          <tr>
            <td><strong>#${idx + 1}</strong></td>
            <td><strong>${item.name}</strong></td>
            <td><span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981;">+${item.feat} feat</span></td>
            <td><span class="badge" style="background:rgba(239,68,68,0.15); color:#ef4444;">${item.fix} fix</span></td>
            <td><span class="badge" style="background:rgba(59,130,246,0.15); color:#3b82f6;">${item.refactor} refactor</span></td>
            <td><strong>${item.total}</strong></td>
            <td>${item.percentage}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="standup-box">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
      <div class="card-label">${svgDoc} ${isThai ? 'ตัวอย่าง Daily / Sprint Standup Summary (พร้อมส่ง)' : 'Sprint / Standup Summary Markdown'}</div>
      <button class="btn" style="padding: 4px 10px; font-size: 12px;" onclick="copyStandup()">${svgCopy} Copy</button>
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
