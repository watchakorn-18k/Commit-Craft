import * as vscode from 'vscode';
import { generateCommitMsg, generateMultipleCandidates, generateOfflineCommit } from './generate-commit-msg';
import { reviewStagedChanges } from './review-utils';
import { generatePRDescription } from './pr-utils';
import { suggestBranchName } from './branch-utils';
import { generateChangelog } from './changelog-utils';
import { safeUndoCommit } from './undo-utils';
import { resolveMergeConflicts } from './conflict-utils';
import { suggestReleaseTag } from './tag-utils';
import { translateCommitMessage } from './translate-utils';
import { cleanGhostBranches } from './branch-cleaner';
import { summarizeSquashCommits } from './squash-utils';
import { runGitBisectAssistant } from './bisect-assistant';
import { smartSyncBranch } from './sync-utils';
import { tellLineStory } from './blame-storyteller';
import { simulatePRReview } from './pr-review-simulator';
import { GitStatsDashboardPanel } from './stats-dashboard-view';
import {
  ConfigKeys,
  ConfigurationManager,
  PROVIDERS,
  SUPPORTED_LANGUAGES,
  COMMIT_STYLES
} from './config';
import { fetchAvailableOpenAIModels } from './openai-utils';
import { getVSCodeLMModels, isVSCodeLMAvailable } from './vscode-lm-utils';
import { getRecentCommits, getCommitDetails, getRepo } from './git-utils';
import { smartStash, popStash } from './stash-utils';
import { getExplainCommitPrompt } from './prompts';
import { AIService } from './ai-service';
import { ProgressHandler } from './utils';
import { SettingsPanel } from './settings-view';
import { Logger } from './logger';

export class CommandManager {
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {}

  registerCommands() {
    // 0. Visual Git Analytics Dashboard
    const runDashboard = () => {
      GitStatsDashboardPanel.createOrShow(this.context.extensionUri);
    };
    this.registerCommand('commitcraft.openDashboard', runDashboard);
    this.registerCommand('commit-craft-ai.openDashboard', runDashboard);
    this.registerCommand('ai-commit.openDashboard', runDashboard);

    // 1. Generate commit message
    this.registerCommand('commitcraft.generate', generateCommitMsg);
    this.registerCommand('commit-craft-ai.generate', generateCommitMsg);
    this.registerCommand('extension.ai-commit', generateCommitMsg);

    // 1.1. Generate Offline commit message (No AI required)
    this.registerCommand('commitcraft.generateOffline', generateOfflineCommit);
    this.registerCommand('commit-craft-ai.generateOffline', generateOfflineCommit);
    this.registerCommand('ai-commit.generateOffline', generateOfflineCommit);

    // 2. Generate multiple options
    this.registerCommand('commitcraft.generateCandidates', generateMultipleCandidates);
    this.registerCommand('commit-craft-ai.generateCandidates', generateMultipleCandidates);
    this.registerCommand('ai-commit.generateCandidates', generateMultipleCandidates);

    // 3. Pre-Commit Code Review
    this.registerCommand('commitcraft.reviewChanges', reviewStagedChanges);
    this.registerCommand('commit-craft-ai.reviewChanges', reviewStagedChanges);
    this.registerCommand('ai-commit.reviewChanges', reviewStagedChanges);

    // 4. Generate Pull Request Description
    this.registerCommand('commitcraft.generatePR', generatePRDescription);
    this.registerCommand('commit-craft-ai.generatePR', generatePRDescription);
    this.registerCommand('ai-commit.generatePR', generatePRDescription);

    // 5. Suggest Branch Name
    this.registerCommand('commitcraft.suggestBranch', suggestBranchName);
    this.registerCommand('commit-craft-ai.suggestBranch', suggestBranchName);
    this.registerCommand('ai-commit.suggestBranch', suggestBranchName);

    // 6. Generate CHANGELOG.md (Keep a Changelog)
    this.registerCommand('commitcraft.generateChangelog', generateChangelog);
    this.registerCommand('commit-craft-ai.generateChangelog', generateChangelog);
    this.registerCommand('ai-commit.generateChangelog', generateChangelog);

    // 6.1. Explain Commit (Timeline / Git History)
    const runExplain = async (arg?: any) => {
      await this.runExplainCommit(arg);
    };
    this.registerCommand('commitcraft.explainCommit', runExplain);
    this.registerCommand('commit-craft-ai.explainCommit', runExplain);
    this.registerCommand('ai-commit.explainCommit', runExplain);

    // 6.2. Smart Git Stash (AI Stash Generator)
    this.registerCommand('commitcraft.smartStash', smartStash);
    this.registerCommand('commit-craft-ai.smartStash', smartStash);
    this.registerCommand('ai-commit.smartStash', smartStash);

    this.registerCommand('commitcraft.popStash', popStash);
    this.registerCommand('commit-craft-ai.popStash', popStash);
    this.registerCommand('ai-commit.popStash', popStash);

    // 6.3. Git Safe Undo / Rollback
    this.registerCommand('commitcraft.safeUndo', safeUndoCommit);
    this.registerCommand('commit-craft-ai.safeUndo', safeUndoCommit);
    this.registerCommand('ai-commit.safeUndo', safeUndoCommit);

    // 6.4. AI Merge Conflict Resolver
    this.registerCommand('commitcraft.resolveConflict', resolveMergeConflicts);
    this.registerCommand('commit-craft-ai.resolveConflict', resolveMergeConflicts);
    this.registerCommand('ai-commit.resolveConflict', resolveMergeConflicts);

    // 6.5. Semantic Version & Tag Suggester
    this.registerCommand('commitcraft.suggestReleaseTag', suggestReleaseTag);
    this.registerCommand('commit-craft-ai.suggestReleaseTag', suggestReleaseTag);
    this.registerCommand('ai-commit.suggestReleaseTag', suggestReleaseTag);

    // 6.6. Instant TH -> EN Commit Translator
    this.registerCommand('commitcraft.translateCommit', translateCommitMessage);
    this.registerCommand('commit-craft-ai.translateCommit', translateCommitMessage);
    this.registerCommand('ai-commit.translateCommit', translateCommitMessage);

    // 6.7. Clean Ghost Branches (Merged)
    this.registerCommand('commitcraft.cleanBranches', cleanGhostBranches);
    this.registerCommand('commit-craft-ai.cleanBranches', cleanGhostBranches);
    this.registerCommand('ai-commit.cleanBranches', cleanGhostBranches);

    // 6.8. Git Squash & Rebase Summarizer
    this.registerCommand('commitcraft.squashSummary', summarizeSquashCommits);
    this.registerCommand('commit-craft-ai.squashSummary', summarizeSquashCommits);
    this.registerCommand('ai-commit.squashSummary', summarizeSquashCommits);

    // 6.9. AI Git Bisect Bug Tracker
    this.registerCommand('commitcraft.bisectBugTracker', runGitBisectAssistant);
    this.registerCommand('commit-craft-ai.bisectBugTracker', runGitBisectAssistant);
    this.registerCommand('ai-commit.bisectBugTracker', runGitBisectAssistant);

    // 6.10. GitHub / GitLab Release Auto-Draft
    this.registerCommand('commitcraft.draftRelease', suggestReleaseTag);
    this.registerCommand('commit-craft-ai.draftRelease', suggestReleaseTag);
    this.registerCommand('ai-commit.draftRelease', suggestReleaseTag);

    // 6.11. Smart Branch Sync & Rebase Assistant
    const runSync = async (arg?: any) => {
      await smartSyncBranch(arg);
    };
    this.registerCommand('commitcraft.syncBranch', runSync);
    this.registerCommand('commit-craft-ai.syncBranch', runSync);
    this.registerCommand('ai-commit.syncBranch', runSync);

    // 6.12. AI Git Blame & Line Storyteller
    this.registerCommand('commitcraft.tellLineStory', tellLineStory);
    this.registerCommand('commit-craft-ai.tellLineStory', tellLineStory);
    this.registerCommand('ai-commit.tellLineStory', tellLineStory);

    // 6.13. AI Pull Request Pre-Review Simulator
    this.registerCommand('commitcraft.simulatePRReview', simulatePRReview);
    this.registerCommand('commit-craft-ai.simulatePRReview', simulatePRReview);
    this.registerCommand('ai-commit.simulatePRReview', simulatePRReview);

    // 7. Quick Setup Wizard
    const runSetup = async () => {
      await this.runQuickSetupWizard();
    };
    this.registerCommand('commitcraft.quickSetup', runSetup);
    this.registerCommand('commit-craft-ai.quickSetup', runSetup);
    this.registerCommand('ai-commit.quickSetup', runSetup);

    // 8. Switch Provider
    const runSwitch = async () => {
      await this.runSwitchProvider();
    };
    this.registerCommand('commitcraft.switchProvider', runSwitch);
    this.registerCommand('commit-craft-ai.switchProvider', runSwitch);
    this.registerCommand('ai-commit.switchProvider', runSwitch);

    // 9. Select Model
    const runModel = async () => {
      await this.runSelectModel();
    };
    this.registerCommand('commitcraft.selectModel', runModel);
    this.registerCommand('commit-craft-ai.selectModel', runModel);
    this.registerCommand('ai-commit.selectModel', runModel);

    // 10. Switch Commit Style
    const runStyle = async () => {
      await this.runSwitchStyle();
    };
    this.registerCommand('commitcraft.switchStyle', runStyle);
    this.registerCommand('commit-craft-ai.switchStyle', runStyle);
    this.registerCommand('ai-commit.switchStyle', runStyle);

    // 11. Set API Key
    const runKey = async (targetProviderId?: string) => {
      await this.runSetApiKey(targetProviderId);
    };
    this.registerCommand('commitcraft.setApiKey', runKey);
    this.registerCommand('commit-craft-ai.setApiKey', runKey);
    this.registerCommand('ai-commit.setApiKey', runKey);

    // 12. Set API Base URL
    const runBase = async (targetProviderId?: string) => {
      await this.runSetBaseUrl(targetProviderId);
    };
    this.registerCommand('commitcraft.setBaseUrl', runBase);
    this.registerCommand('commit-craft-ai.setBaseUrl', runBase);
    this.registerCommand('ai-commit.setBaseUrl', runBase);

    // 13. Switch Language
    const runLang = async () => {
      await this.runSwitchLanguage();
    };
    this.registerCommand('commitcraft.switchLanguage', runLang);
    this.registerCommand('commit-craft-ai.switchLanguage', runLang);
    this.registerCommand('ai-commit.switchLanguage', runLang);

    // 14. Toggle Emoji
    const runEmoji = async () => {
      const configManager = ConfigurationManager.getInstance();
      const current = configManager.getConfig<boolean>(ConfigKeys.EMOJI_ENABLED, false);
      const next = !current;
      await configManager.updateConfig(ConfigKeys.EMOJI_ENABLED, next);
      vscode.window.showInformationMessage(
        `CommitCraft: Emojis are now ${next ? 'enabled' : 'disabled'}`
      );
    };
    this.registerCommand('commitcraft.toggleEmoji', runEmoji);
    this.registerCommand('commit-craft-ai.toggleEmoji', runEmoji);
    this.registerCommand('ai-commit.toggleEmoji', runEmoji);

    // 15. Open Settings
    const runSettings = () => {
      SettingsPanel.createOrShow(this.context.extensionUri);
    };
    this.registerCommand('commitcraft.openSettings', runSettings);
    this.registerCommand('commit-craft-ai.openSettings', runSettings);
    this.registerCommand('ai-commit.openSettings', runSettings);

    // 16. Quick Action Hub / Quick Menu (for 1-click UI without Command Palette)
    const runMenu = async () => {
      await this.runQuickMenu();
    };
    this.registerCommand('commitcraft.quickMenu', runMenu);
    this.registerCommand('commit-craft-ai.quickMenu', runMenu);
    this.registerCommand('ai-commit.quickMenu', runMenu);

    // Legacy showAvailableModels
    this.registerCommand('commitcraft.showAvailableModels', runModel);
    this.registerCommand('commit-craft-ai.showAvailableModels', runModel);
    this.registerCommand('ai-commit.showAvailableModels', runModel);
  }

  /**
   * Quick Action Hub Popup Menu (1-Click UI)
   */
  public async runQuickMenu() {
    const configManager = ConfigurationManager.getInstance();
    const provider = configManager.getActiveProvider();
    const activeModel = configManager.getActiveModel();
    const isThai = configManager.getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'th') === 'th';

    const items: (vscode.QuickPickItem & { action?: () => Promise<any> | any })[] = isThai
      ? [
          {
            label: 'Git Insights & Analytics',
            kind: vscode.QuickPickItemKind.Separator
          },
          {
            label: '$(pie-chart) เปิดแดชบอร์ดกราฟวงกลม & สถิติ (Visual Dashboard)',
            description: 'Donut Chart / Report',
            detail: 'เปิดหน้าต่างแดชบอร์ดดูกราฟวงกลม สัดส่วน Commit และ Standup Summary',
            action: async () => GitStatsDashboardPanel.createOrShow(this.context.extensionUri)
          },
          {
            label: 'Commit Generation',
            kind: vscode.QuickPickItemKind.Separator
          },
          {
            label: '$(sparkle) สร้างข้อความ Commit (AI 1-Click)',
            description: '1-Click',
            detail: 'วิเคราะห์การเปลี่ยนแปลงและใส่ข้อความลงใน Git commit input box ทันที',
            action: async () => vscode.commands.executeCommand('commitcraft.generate')
          },
          {
            label: '$(globe) แปลโน้ตเป็น Commit อังกฤษ (TH → EN Translator)',
            description: 'แปลภาษา',
            detail: 'แปลงโน้ตภาษาไทยในช่อง Commit ให้เป็น Conventional Commit ภาษาอังกฤษสากล',
            action: async () => translateCommitMessage()
          },
          {
            label: '$(plug) สร้างข้อความ Commit แบบออฟไลน์ (Offline Commit)',
            description: '0 AI / ไม่ใช้เน็ต',
            detail: 'วิเคราะห์ไฟล์สร้างข้อความ Commit อัตโนมัติโดยตรงในเครื่อง ไม่พึ่งพา AI',
            action: async () => vscode.commands.executeCommand('commitcraft.generateOffline')
          },
          {
            label: '$(list-unordered) สร้าง 3 ตัวเลือกสไตล์ (3 Candidates)',
            description: 'เลือกสไตล์',
            detail: 'สร้างตัวเลือก 3 รูปแบบ (Conventional, สั้นกระชับ, ละเอียด)',
            action: async () => vscode.commands.executeCommand('commitcraft.generateCandidates')
          },
          {
            label: 'Code Safety & Stash',
            kind: vscode.QuickPickItemKind.Separator
          },
          {
            label: '$(book) เล่าประวัติโค้ดบรรทัดนี้ (AI Line Storyteller)',
            description: 'AI เล่าประวัติ',
            detail: 'วิเคราะห์ประวัติ Git Blame และ Commit เล่าเบื้องหลังว่าทำไมบรรทัดนี้ถึงถูกเขียนขึ้นมา',
            action: async () => tellLineStory()
          },
          {
            label: '$(shield) ตรวจทานโค้ดก่อน Commit (Code Review)',
            description: 'ตรวจบั๊ก & ความปลอดภัย',
            detail: 'สแกนหาข้อผิดพลาด บั๊ก API Key หลุด และ console.log',
            action: async () => vscode.commands.executeCommand('commitcraft.reviewChanges')
          },
          {
            label: '$(discard) ย้อนกลับ Commit ล่าสุด (Safe Undo)',
            description: 'กู้คืนโค้ดปลอดภัย',
            detail: 'ย้อนกลับ Commit ล่าสุดโดยคงโค้ดไว้ครบถ้วนและกู้ข้อความเดิมกลับมา',
            action: async () => safeUndoCommit()
          },
          {
            label: '$(git-pull-request-go-to-changes) แก้ Merge Conflict ด้วย AI (Conflict Resolver)',
            description: 'Intelligent Merge',
            detail: 'ให้ AI วิเคราะห์โค้ดทั้งสองฝั่งและรวมแก้ปัญหา Conflict ให้อัตโนมัติ',
            action: async () => resolveMergeConflicts()
          },
          {
            label: '$(archive) บันทึกโค้ดชั่วคราว (Smart Stash WIP)',
            description: 'AI บันทึก Stash',
            detail: 'วิเคราะห์โค้ดที่ยังไม่เสร็จแล้วตั้งชื่อ Stash ให้อัตโนมัติใน 1 คลิก',
            action: async () => smartStash()
          },
          {
            label: '$(history) เรียกคืนโค้ดจาก Stash (Stash Pop)',
            description: 'ดึงโค้ดล่าสุด',
            detail: 'ดึงการแก้ไขที่บันทึกไว้ใน Stash ล่าสุดกลับมาทำงานต่อ',
            action: async () => popStash()
          },
          {
            label: 'Branch & Release',
            kind: vscode.QuickPickItemKind.Separator
          },
          {
            label: '$(shield) จำลองการตรวจ PR จาก Senior Dev (PR Pre-Review)',
            description: 'Senior Architect',
            detail: 'ให้ Senior AI ตรวจสอบโค้ดทั้ง Branch ก่อนเปิด PR จริง (เช็กบั๊ก, ความปลอดภัย, ประสิทธิภาพ)',
            action: async () => simulatePRReview()
          },
          {
            label: '$(git-pull-request-go-to-changes) Sync & Rebase กับ Base Branch (Sync Branch)',
            description: 'Rebase / Merge',
            detail: 'Sync อัปเดต Branch ปัจจุบันให้ทัน main/master ด้วย Rebase หรือ Merge',
            action: async () => smartSyncBranch()
          },
          {
            label: '$(bug) ตามล่าหาจุดเกิดบั๊ก (AI Git Bisect Bug Tracker)',
            description: 'AI ชี้เป้าบั๊ก',
            detail: 'ให้ AI ช่วยวิเคราะห์ Diff ทีละสเต็ปเพื่อหา Commit และคนที่ทำให้เกิดบั๊ก',
            action: async () => runGitBisectAssistant()
          },
          {
            label: '$(tag) แนะนำเลข Release Tag & ร่าง Release (Draft Release)',
            description: 'SemVer & GitHub/GitLab',
            detail: 'วิเคราะห์ประวัติ Commit แนะนำเลขเวอร์ชัน และเปิดหน้าร่าง Release บนเว็บทันที',
            action: async () => suggestReleaseTag()
          },
          {
            label: '$(git-pull-request) สร้างคำอธิบาย Pull Request (PR Description)',
            description: 'Markdown',
            detail: 'ร่างคำอธิบาย PR สำหรับ GitHub/GitLab จากประวัติ Commit',
            action: async () => vscode.commands.executeCommand('commitcraft.generatePR')
          },
          {
            label: '$(git-merge) สรุปรวมหลาย Commit (Squash & Rebase Summarizer)',
            description: 'AI รวม Commit',
            detail: 'วิเคราะห์รวมหลาย Commit ย่อยให้เป็น 1 Clean Commit สำหรับ Squash Merge',
            action: async () => summarizeSquashCommits()
          },
          {
            label: '$(trash) ลบ Branch ที่ Merge แล้ว (Clean Ghost Branches)',
            description: 'จัดระเบียบ Repo',
            detail: 'สแกนหา Local Branches ที่ Merge เข้า main/master แล้ว และลบทิ้งใน 1 คลิก',
            action: async () => cleanGhostBranches()
          },
          {
            label: '$(notebook) สร้าง/อัปเดต CHANGELOG.md',
            description: 'Keep a Changelog',
            detail: 'สร้างหรืออัปเดตไฟล์ CHANGELOG.md ของเวอร์ชันนี้อัตโนมัติ',
            action: async () => vscode.commands.executeCommand('commitcraft.generateChangelog')
          },
          {
            label: '$(git-branch) แนะนำชื่อ Branch (Suggest Branch)',
            description: 'ชื่อมาตรฐาน',
            detail: 'รับคำแนะนำชื่อ Git branch ตามมาตรฐานจากโค้ดที่แก้',
            action: async () => vscode.commands.executeCommand('commitcraft.suggestBranch')
          },
          {
            label: '$(book) อธิบาย Commit นี้ (Commit Explainer)',
            description: 'AI สรุปเจาะลึก',
            detail: 'ให้ AI ช่วยวิเคราะห์และอธิบายจุดประสงค์ของ Commit เก่าๆ ในประวัติ Git',
            action: async () => this.runExplainCommit()
          },
          {
            label: 'Configuration & Settings',
            kind: vscode.QuickPickItemKind.Separator
          },
          {
            label: '$(sparkle) ตัวช่วยตั้งค่าด่วน (Setup Wizard)',
            description: `ปัจจุบัน: ${provider.name} (${activeModel})`,
            detail: 'เปลี่ยน AI Provider, API key, โมเดล หรือภาษาทีละขั้นตอน',
            action: async () => this.runQuickSetupWizard()
          },
          {
            label: '$(hubot) สลับผู้ให้บริการ AI (Switch Provider)',
            description: provider.name,
            detail: 'สลับระหว่าง Gemini, Copilot, OpenAI, Claude, DeepSeek, Ollama...',
            action: async () => this.runSwitchProvider()
          },
          {
            label: '$(gear) เปิดหน้าตั้งค่า (Settings Panel)',
            description: 'แผงควบคุม UI',
            detail: 'เปิดหน้าต่างการตั้งค่า CommitCraft แบบละเอียด',
            action: () => SettingsPanel.createOrShow(this.context.extensionUri)
          }
        ]
      : [
          {
            label: 'Git Insights & Analytics',
            kind: vscode.QuickPickItemKind.Separator
          },
          {
            label: '$(pie-chart) Open Visual Analytics Dashboard',
            description: 'Donut Chart & Reports',
            detail: 'Open visual Donut Chart and repository statistics dashboard',
            action: async () => GitStatsDashboardPanel.createOrShow(this.context.extensionUri)
          },
          {
            label: 'Commit Generation',
            kind: vscode.QuickPickItemKind.Separator
          },
          {
            label: '$(sparkle) Generate Commit Message (AI 1-Click)',
            description: 'Default',
            detail: 'Analyze staged changes and populate Git commit input box',
            action: async () => vscode.commands.executeCommand('commitcraft.generate')
          },
          {
            label: '$(globe) Translate Notes to Conventional Commit',
            description: 'TH → EN',
            detail: 'Translate informal commit notes into professional Conventional Commit',
            action: async () => translateCommitMessage()
          },
          {
            label: '$(plug) Generate Offline Commit (No AI)',
            description: '0 AI tokens / Offline',
            detail: 'Instantly generate commit message locally from file diff without AI',
            action: async () => vscode.commands.executeCommand('commitcraft.generateOffline')
          },
          {
            label: '$(list-unordered) Generate 3 Commit Options',
            description: 'Conventional / Concise / Detailed',
            detail: 'Generate 3 candidate styles to choose from',
            action: async () => vscode.commands.executeCommand('commitcraft.generateCandidates')
          },
          {
            label: 'Code Safety & Stash',
            kind: vscode.QuickPickItemKind.Separator
          },
          {
            label: '$(book) Explain Line Story (AI Line Storyteller)',
            description: 'AI Line Narrative',
            detail: 'Analyze Git Blame and commit backstory on why this line was written and why this logic was chosen',
            action: async () => tellLineStory()
          },
          {
            label: '$(shield) Pre-Commit Code Review',
            description: 'Security & Bug Audit',
            detail: 'Review diff for runtime bugs, credential leaks, and console.logs',
            action: async () => vscode.commands.executeCommand('commitcraft.reviewChanges')
          },
          {
            label: '$(discard) Safe Undo Last Commit (Rollback)',
            description: 'Zero Data Loss',
            detail: 'Undo the last commit safely, keep modifications, and restore message',
            action: async () => safeUndoCommit()
          },
          {
            label: '$(git-pull-request-go-to-changes) Resolve Merge Conflicts with AI',
            description: 'Smart Merge',
            detail: 'Analyze conflict blocks and auto-resolve logic cleanly with AI',
            action: async () => resolveMergeConflicts()
          },
          {
            label: '$(archive) Smart Git Stash (WIP Stash Generator)',
            description: 'Save WIP with AI',
            detail: 'Analyze uncommitted changes and auto-generate stash message in 1 click',
            action: async () => smartStash()
          },
          {
            label: '$(history) Restore Stash (Stash Pop)',
            description: 'Pop latest',
            detail: 'Pop and apply latest uncommitted stash to workspace',
            action: async () => popStash()
          },
          {
            label: 'Branch & Release',
            kind: vscode.QuickPickItemKind.Separator
          },
          {
            label: '$(shield) Simulate Senior PR Code Review',
            description: 'Senior Architect',
            detail: 'Simulate full Senior Staff Code Review on whole branch before opening actual PR',
            action: async () => simulatePRReview()
          },
          {
            label: '$(git-pull-request-go-to-changes) Sync & Rebase with Base Branch',
            description: 'Rebase / Merge',
            detail: 'Intelligently sync active branch with base branch using Rebase or Merge',
            action: async () => smartSyncBranch()
          },
          {
            label: '$(bug) AI Git Bisect Bug Tracker',
            description: 'Pinpoint Bug Origin',
            detail: 'Step-by-step AI guided git bisect to find the exact culprit commit and author',
            action: async () => runGitBisectAssistant()
          },
          {
            label: '$(tag) Suggest Release Tag & Draft Release',
            description: 'SemVer & GitHub/GitLab',
            detail: 'Analyze commits to recommend SemVer bump and draft web release',
            action: async () => suggestReleaseTag()
          },
          {
            label: '$(git-pull-request) Generate PR Description',
            description: 'Markdown',
            detail: 'Generate full Pull Request markdown description from branch',
            action: async () => vscode.commands.executeCommand('commitcraft.generatePR')
          },
          {
            label: '$(git-merge) Synthesize Commits (Squash & Rebase Summarizer)',
            description: 'AI Squash',
            detail: 'Synthesize multiple WIP commits into 1 clean Conventional Commit message',
            action: async () => summarizeSquashCommits()
          },
          {
            label: '$(trash) Clean Merged Local Branches (Ghost Cleaner)',
            description: 'Repo hygiene',
            detail: 'Scan and delete merged local branches cleanly in 1 click',
            action: async () => cleanGhostBranches()
          },
          {
            label: '$(notebook) Generate CHANGELOG.md',
            description: 'Keep a Changelog',
            detail: 'Auto-generate or update CHANGELOG.md for this release',
            action: async () => vscode.commands.executeCommand('commitcraft.generateChangelog')
          },
          {
            label: '$(git-branch) Suggest Branch Name',
            description: 'Standard naming',
            detail: 'Get Git branch name suggestions from code changes',
            action: async () => vscode.commands.executeCommand('commitcraft.suggestBranch')
          },
          {
            label: '$(book) Explain Commit (Commit Explainer)',
            description: 'Deep Dive Analysis',
            detail: 'Have AI explain motivation, changes, and impact of any commit',
            action: async () => this.runExplainCommit()
          },
          {
            label: 'Configuration & Settings',
            kind: vscode.QuickPickItemKind.Separator
          },
          {
            label: '$(sparkle) Quick Setup Wizard',
            description: `Current: ${provider.name} (${activeModel})`,
            detail: 'Change AI Provider, API key, model, or language step-by-step',
            action: async () => this.runQuickSetupWizard()
          },
          {
            label: '$(hubot) Switch AI Provider',
            description: provider.name,
            detail: 'Switch between Gemini, Copilot, OpenAI, Claude, DeepSeek, Ollama...',
            action: async () => this.runSwitchProvider()
          },
          {
            label: '$(gear) Open Settings Panel',
            description: 'Interactive UI',
            detail: 'Open clean, dynamic provider settings panel',
            action: () => SettingsPanel.createOrShow(this.context.extensionUri)
          }
        ];

    const selected = await vscode.window.showQuickPick(items, {
      title: isThai ? 'CommitCraft — เมนูด่วน (Quick Action Hub)' : 'CommitCraft — Quick Action Hub',
      placeHolder: isThai ? 'เลือกคำสั่งที่ต้องการ (คลิกเพื่อสั่งทำงาน)' : 'Select an action (Click to run)'
    });

    if (selected?.action) {
      await selected.action();
    }
  }

  /**
   * Explain a specific commit from Git history (Timeline, Git Graph, or recent commits picker)
   */
  public async runExplainCommit(arg?: any) {
    const configManager = ConfigurationManager.getInstance();
    const provider = configManager.getActiveProvider();
    const isThai = configManager.getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'th') === 'th';
    const language = configManager.getConfig<string>(ConfigKeys.AI_COMMIT_LANGUAGE, 'Thai');

    let repo: any;
    try {
      repo = await getRepo(arg);
    } catch (err: any) {
      vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
      return;
    }

    let targetHash = '';

    // If invoked from Timeline context menu or command with argument
    if (typeof arg === 'object' && arg?.id) {
      targetHash = String(arg.id);
    } else if (typeof arg === 'string') {
      targetHash = arg;
    } else {
      // Pick from recent commits
      const recentCommits = await getRecentCommits(repo, 30);
      if (recentCommits.length === 0) {
        vscode.window.showInformationMessage(
          isThai ? 'ไม่พบประวัติ Commit ในคลังเก็บโค้ดนี้' : 'No commit history found in this repository.'
        );
        return;
      }

      const items = recentCommits.map((c) => ({
        label: `$(git-commit) ${c.hash.substring(0, 7)} — ${c.message}`,
        description: `${c.author_name} (${new Date(c.date).toLocaleDateString()})`,
        hash: c.hash,
        message: c.message
      }));

      const selected = await vscode.window.showQuickPick(items, {
        title: isThai ? 'เลือก Commit ที่ต้องการให้ AI อธิบาย' : 'Select a commit to explain',
        placeHolder: isThai ? 'เลือก Commit จากรายการล่าสุด' : 'Choose from recent commits'
      });

      if (!selected) {
        return;
      }
      targetHash = selected.hash;
    }

    if (!targetHash) {
      return;
    }

    await ProgressHandler.withProgress(
      isThai ? `AI กำลังวิเคราะห์และอธิบาย Commit ${targetHash.substring(0, 7)}...` : `Explaining commit ${targetHash.substring(0, 7)}...`,
      async (progress) => {
        try {
          progress.report({ message: 'Fetching commit diff...' });
          const commitDetails = await getCommitDetails(repo, targetHash);
          if (commitDetails.error || !commitDetails.diff) {
            throw new Error(commitDetails.error || 'Failed to retrieve commit diff.');
          }

          progress.report({ message: `Generating explanation with ${provider.name}...` });
          const prompt = getExplainCommitPrompt(
            commitDetails.message,
            commitDetails.author,
            commitDetails.date,
            commitDetails.diff,
            language
          );

          const raw = await AIService.query(prompt);
          if (!raw) {
            throw new Error('AI returned an empty explanation.');
          }

          // Open markdown document preview
          const shortHash = targetHash.substring(0, 7);
          const doc = await vscode.workspace.openTextDocument({
            content: raw,
            language: 'markdown'
          });
          await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
        } catch (err: any) {
          Logger.error('Explain commit failed:', err);
          vscode.window.showErrorMessage(`CommitCraft: ${err?.message || err}`);
        }
      }
    );
  }

  /**
   * Interactive step-by-step Setup Wizard
   */
  private async runQuickSetupWizard() {
    const configManager = ConfigurationManager.getInstance();

    // Step 1: Select Provider
    const providerItems = Object.values(PROVIDERS).map((p) => ({
      label: `${p.icon} ${p.name}`,
      description: p.id === 'gemini' ? `${p.description} (Recommended)` : p.description,
      provider: p
    }));

    const selectedProviderItem = await vscode.window.showQuickPick(providerItems, {
      title: 'CommitCraft Setup (1/4): Choose AI Provider',
      placeHolder: 'Select AI provider'
    });

    if (!selectedProviderItem) {
      return;
    }

    const provider = selectedProviderItem.provider;
    await configManager.updateConfig(ConfigKeys.AI_PROVIDER, provider.id);

    // Step 2: Base URL if Ollama or Custom
    if (provider.id === 'ollama' || provider.id === 'custom') {
      const defaultUrl = provider.defaultBaseUrl || 'http://localhost:11434/v1';
      const configKey = provider.id === 'ollama' ? ConfigKeys.OLLAMA_BASE_URL : ConfigKeys.CUSTOM_BASE_URL;
      const currentUrl = configManager.getConfig<string>(configKey, defaultUrl);

      const enteredUrl = await vscode.window.showInputBox({
        title: `CommitCraft Setup: Base URL for ${provider.name}`,
        prompt: 'Enter API Base URL endpoint',
        value: currentUrl || defaultUrl,
        ignoreFocusOut: true
      });

      if (enteredUrl !== undefined) {
        await configManager.updateConfig(configKey, enteredUrl.trim());
      }
    }

    // Step 3: API Key (if required or custom)
    if (provider.requiresApiKey || provider.id === 'custom' || provider.configApiKey) {
      const existingKey = await configManager.getEffectiveApiKey(provider.id);
      const maskedKey = existingKey ? `${existingKey.slice(0, 4)}...${existingKey.slice(-4)}` : '';

      const enteredKey = await vscode.window.showInputBox({
        title: `CommitCraft Setup (2/4): API Key for ${provider.name}`,
        prompt: existingKey
          ? `Current key: [${maskedKey}]. Enter a new key, or press Enter to keep current (Leave empty if not required).`
          : `Enter API Key for ${provider.name} (Optional if server requires no auth, press Enter to skip)`,
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'Paste API key here (Optional)...'
      });

      if (enteredKey !== undefined && enteredKey.trim() !== '') {
        await configManager.setSecretApiKey(provider.id, enteredKey.trim());
        if (provider.configApiKey) {
          await configManager.updateConfig(provider.configApiKey, enteredKey.trim());
        }
      }
    }

    // Step 4: Model Selection
    const modelItems = provider.presetModels.map((m) => ({
      label: m.label,
      description: m.description
    }));

    if (provider.id === 'copilot' && isVSCodeLMAvailable()) {
      const lmModels = await getVSCodeLMModels();
      lmModels.forEach((lm) => {
        if (!modelItems.some((m) => m.label === lm.id)) {
          modelItems.push({ label: lm.id, description: lm.name });
        }
      });
    }

    modelItems.push({
      label: 'Enter custom model name...',
      description: 'Specify model identifier manually'
    });

    const selectedModel = await vscode.window.showQuickPick(modelItems, {
      title: `CommitCraft Setup (3/4): Select Model for ${provider.name}`,
      placeHolder: `Default: ${provider.defaultModel}`
    });

    if (selectedModel) {
      let finalModelName = selectedModel.label;
      if (selectedModel.label === 'Enter custom model name...') {
        const customName = await vscode.window.showInputBox({
          title: 'Custom Model Name',
          prompt: 'Enter model identifier (e.g. gpt-4o, gemini-2.5-flash)',
          value: provider.defaultModel,
          ignoreFocusOut: true
        });
        if (customName) {
          finalModelName = customName.trim();
        }
      }
      await configManager.updateConfig(provider.configModel, finalModelName);
    }

    // Step 5: Language Selection
    const currentLang = configManager.getConfig<string>(
      ConfigKeys.AI_COMMIT_LANGUAGE,
      'English'
    );
    const langItems = SUPPORTED_LANGUAGES.map((l) => ({
      label: l.label,
      description: l.label === currentLang ? `${l.description} (Current)` : l.description
    }));

    const selectedLang = await vscode.window.showQuickPick(langItems, {
      title: 'CommitCraft Setup (4/4): Commit Message Language',
      placeHolder: `Select language (Current: ${currentLang})`
    });

    if (selectedLang) {
      await configManager.updateConfig(
        ConfigKeys.AI_COMMIT_LANGUAGE,
        selectedLang.label
      );
    }

    const activeModel = configManager.getActiveModel(provider.id);
    const choice = await vscode.window.showInformationMessage(
      `CommitCraft configured successfully with ${provider.name} (${activeModel}).`,
      'Generate Commit Message',
      'Done'
    );

    if (choice === 'Generate Commit Message') {
      await vscode.commands.executeCommand('extension.ai-commit');
    }
  }

  /**
   * Switch active AI provider
   */
  private async runSwitchProvider() {
    const configManager = ConfigurationManager.getInstance();
    const currentProvider = configManager.getActiveProvider();

    const providerItems = Object.values(PROVIDERS).map((p) => ({
      label: `${p.icon} ${p.name}`,
      description: p.id === currentProvider.id ? `${p.description} (Active)` : p.description,
      provider: p
    }));

    const selected = await vscode.window.showQuickPick(providerItems, {
      title: 'Switch AI Provider',
      placeHolder: `Currently using: ${currentProvider.name}`
    });

    if (!selected) {
      return;
    }

    const provider = selected.provider;
    await configManager.updateConfig(ConfigKeys.AI_PROVIDER, provider.id);

    const apiKey = await configManager.getEffectiveApiKey(provider.id);
    if (!apiKey && provider.requiresApiKey) {
      const setKeyChoice = await vscode.window.showWarningMessage(
        `Switched to ${provider.name}, but API Key is missing.`,
        'Enter API Key Now',
        'Later'
      );
      if (setKeyChoice === 'Enter API Key Now') {
        await this.runSetApiKey(provider.id);
      }
    } else {
      const activeModel = configManager.getActiveModel(provider.id);
      vscode.window.showInformationMessage(
        `AI Provider switched to ${provider.name} (${activeModel})`
      );
    }
  }

  /**
   * Select model for active provider
   */
  private async runSelectModel() {
    const configManager = ConfigurationManager.getInstance();
    const provider = configManager.getActiveProvider();
    const currentModel = configManager.getActiveModel(provider.id);

    const modelItems: { label: string; description?: string }[] = [];

    provider.presetModels.forEach((m) => {
      modelItems.push({
        label: m.label,
        description: m.label === currentModel ? `${m.description || ''} (Active)` : m.description
      });
    });

    if (provider.id === 'openai') {
      try {
        const onlineModels = await fetchAvailableOpenAIModels('openai');
        onlineModels.forEach((m) => {
          if (!modelItems.some((item) => item.label === m)) {
            modelItems.push({ label: m, description: 'Available from OpenAI API' });
          }
        });
      } catch {
        // Ignore fallback
      }
    } else if (provider.id === 'copilot' && isVSCodeLMAvailable()) {
      const lmModels = await getVSCodeLMModels();
      lmModels.forEach((lm) => {
        if (!modelItems.some((item) => item.label === lm.id)) {
          modelItems.push({ label: lm.id, description: lm.name });
        }
      });
    }

    modelItems.push({
      label: 'Enter custom model name...',
      description: 'Type model name manually'
    });

    const selected = await vscode.window.showQuickPick(modelItems, {
      title: `Select Model for ${provider.name}`,
      placeHolder: `Current model: ${currentModel}`
    });

    if (!selected) {
      return;
    }

    let finalModel = selected.label;
    if (selected.label === 'Enter custom model name...') {
      const customName = await vscode.window.showInputBox({
        title: `Custom Model for ${provider.name}`,
        prompt: 'Enter model identifier',
        value: currentModel,
        ignoreFocusOut: true
      });
      if (!customName) {
        return;
      }
      finalModel = customName.trim();
    }

    await configManager.updateConfig(provider.configModel, finalModel);
    vscode.window.showInformationMessage(
      `CommitCraft: ${provider.name} model set to "${finalModel}"`
    );
  }

  /**
   * Switch commit style
   */
  private async runSwitchStyle() {
    const configManager = ConfigurationManager.getInstance();
    const currentStyle = configManager.getConfig<string>(ConfigKeys.COMMIT_STYLE, 'conventional');

    const items = COMMIT_STYLES.map((s) => ({
      label: s.label,
      description: s.id === currentStyle ? `${s.description} (Current)` : s.description,
      styleId: s.id
    }));

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Select Commit Message Style',
      placeHolder: 'Pick preferred format style'
    });

    if (selected) {
      await configManager.updateConfig(ConfigKeys.COMMIT_STYLE, selected.styleId);
      vscode.window.showInformationMessage(`Commit style set to: ${selected.label}`);
    }
  }

  /**
   * Set API Key for a provider
   */
  private async runSetApiKey(targetProviderId?: string) {
    const configManager = ConfigurationManager.getInstance();
    let provider = targetProviderId ? PROVIDERS[targetProviderId] : configManager.getActiveProvider();

    if (!provider) {
      const items = Object.values(PROVIDERS)
        .filter((p) => p.requiresApiKey)
        .map((p) => ({
          label: `${p.icon} ${p.name}`,
          provider: p
        }));
      const chosen = await vscode.window.showQuickPick(items, {
        title: 'Select Provider to set API Key'
      });
      if (!chosen) {
        return;
      }
      provider = chosen.provider;
    }

    const existingKey = await configManager.getEffectiveApiKey(provider.id);
    const masked = existingKey ? `${existingKey.slice(0, 4)}...${existingKey.slice(-4)}` : '';

    const enteredKey = await vscode.window.showInputBox({
      title: `Set API Key for ${provider.name}`,
      prompt: existingKey
        ? `Current key: [${masked}]. Enter new key, or leave empty to clear.`
        : `Enter your API key for ${provider.name}`,
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'Paste API key here...'
    });

    if (enteredKey === undefined) {
      return;
    }

    await configManager.setSecretApiKey(provider.id, enteredKey.trim());
    if (provider.configApiKey) {
      await configManager.updateConfig(provider.configApiKey, enteredKey.trim());
    }

    if (enteredKey.trim() === '') {
      vscode.window.showInformationMessage(`API Key for ${provider.name} cleared.`);
    } else {
      vscode.window.showInformationMessage(`API Key for ${provider.name} saved securely!`);
    }
  }

  /**
   * Set API Base URL for a provider (Ollama, OpenAI, Custom, etc.)
   */
  private async runSetBaseUrl(targetProviderId?: string) {
    const configManager = ConfigurationManager.getInstance();
    let provider = targetProviderId ? PROVIDERS[targetProviderId] : configManager.getActiveProvider();

    if (!provider) {
      const items = Object.values(PROVIDERS).map((p) => ({
        label: `${p.icon} ${p.name}`,
        provider: p
      }));
      const chosen = await vscode.window.showQuickPick(items, {
        title: 'Select Provider to set API Base URL'
      });
      if (!chosen) {
        return;
      }
      provider = chosen.provider;
    }

    let configKey = provider.configBaseUrl;
    if (!configKey) {
      if (provider.id === 'openai') {
        configKey = ConfigKeys.OPENAI_BASE_URL;
      } else if (provider.id === 'ollama') {
        configKey = ConfigKeys.OLLAMA_BASE_URL;
      } else if (provider.id === 'custom') {
        configKey = ConfigKeys.CUSTOM_BASE_URL;
      } else {
        configKey = ConfigKeys.CUSTOM_BASE_URL;
      }
    }

    const currentUrl = configManager.getConfig<string>(configKey, provider.defaultBaseUrl || 'http://localhost:8000/v1');

    const enteredUrl = await vscode.window.showInputBox({
      title: `Set API Base URL for ${provider.name}`,
      prompt: 'Enter Base URL endpoint (e.g. http://localhost:11434/v1, https://api.openai.com/v1)',
      value: currentUrl,
      ignoreFocusOut: true,
      placeHolder: 'http://localhost:11434/v1'
    });

    if (enteredUrl === undefined) {
      return;
    }

    await configManager.updateConfig(configKey, enteredUrl.trim());
    vscode.window.showInformationMessage(
      `CommitCraft: Base URL for ${provider.name} set to "${enteredUrl.trim()}"`
    );
  }

  /**
   * Switch commit message language
   */
  private async runSwitchLanguage() {
    const configManager = ConfigurationManager.getInstance();
    const currentLang = configManager.getConfig<string>(
      ConfigKeys.AI_COMMIT_LANGUAGE,
      'English'
    );

    const items = SUPPORTED_LANGUAGES.map((l) => ({
      label: l.label,
      description: l.label === currentLang ? `${l.description} (Current)` : l.description
    }));

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Select Commit Message Language',
      placeHolder: `Current: ${currentLang}`
    });

    if (!selected) {
      return;
    }

    await configManager.updateConfig(
      ConfigKeys.AI_COMMIT_LANGUAGE,
      selected.label
    );
    vscode.window.showInformationMessage(
      `CommitCraft: Language set to "${selected.label}"`
    );
  }

  private registerCommand(command: string, handler: (...args: any[]) => any) {
    const disposable = vscode.commands.registerCommand(command, async (...args) => {
      try {
        Logger.info(`Executing command: ${command}`);
        await handler(...args);
      } catch (error: any) {
        Logger.error(`Command '${command}' failed:`, error);
        vscode.window.showErrorMessage(`CommitCraft error: ${error?.message || error}`);
      }
    });

    this.disposables.push(disposable);
    this.context.subscriptions.push(disposable);
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
