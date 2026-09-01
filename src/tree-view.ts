import * as vscode from 'vscode';
import { ConfigKeys, ConfigurationManager } from './config';
import { getRepo } from './git-utils';
import { getRepoGitStats } from './git-stats';

export class CommitCraftTreeItem extends vscode.TreeItem {
  public category?: 'gitStats' | 'commitGen' | 'codeSafety' | 'branchRelease' | 'activeSettings';

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    options?: {
      description?: string;
      tooltip?: string;
      iconPath?: vscode.ThemeIcon | string;
      command?: vscode.Command;
      contextValue?: string;
      category?: 'gitStats' | 'commitGen' | 'codeSafety' | 'branchRelease' | 'activeSettings';
    }
  ) {
    super(label, collapsibleState);
    if (options?.description) {
      this.description = options.description;
    }
    if (options?.tooltip) {
      this.tooltip = options.tooltip;
    }
    if (options?.iconPath) {
      this.iconPath = options.iconPath;
    }
    if (options?.command) {
      this.command = options.command;
    }
    if (options?.contextValue) {
      this.contextValue = options.contextValue;
    }
    if (options?.category) {
      this.category = options.category;
    }
  }
}

export class CommitCraftTreeDataProvider
  implements vscode.TreeDataProvider<CommitCraftTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    CommitCraftTreeItem | undefined | null | void
  > = new vscode.EventEmitter<CommitCraftTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    CommitCraftTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private configManager = ConfigurationManager.getInstance();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      this.configManager.onDidChangeConfig(() => this.refresh())
    );
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CommitCraftTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CommitCraftTreeItem): Promise<CommitCraftTreeItem[]> {
    const isThai = this.configManager.getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'th') === 'th';

    if (!element) {
      return [
        new CommitCraftTreeItem(
          'Commit Generation',
          vscode.TreeItemCollapsibleState.Expanded,
          {
            iconPath: new vscode.ThemeIcon('git-commit'),
            category: 'commitGen'
          }
        ),
        new CommitCraftTreeItem(
          'Code Safety & Stash',
          vscode.TreeItemCollapsibleState.Expanded,
          {
            iconPath: new vscode.ThemeIcon('shield'),
            category: 'codeSafety'
          }
        ),
        new CommitCraftTreeItem(
          'Branch & Release',
          vscode.TreeItemCollapsibleState.Expanded,
          {
            iconPath: new vscode.ThemeIcon('git-pull-request'),
            category: 'branchRelease'
          }
        ),
        new CommitCraftTreeItem(
          'Configuration & Settings',
          vscode.TreeItemCollapsibleState.Collapsed,
          {
            iconPath: new vscode.ThemeIcon('gear'),
            category: 'activeSettings'
          }
        )
      ];
    }

    // Category 1: Commit Generation
    if (element.category === 'commitGen') {
      return [
        new CommitCraftTreeItem(
          isThai ? 'สร้างข้อความ Commit (AI 1-Click)' : 'Generate Commit Message (1-Click)',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'วิเคราะห์ Diff' : 'AI 1-Click',
            tooltip: isThai ? 'วิเคราะห์การเปลี่ยนแปลงและใส่ข้อความลงใน Git Input Box ทันที' : 'Analyze staged changes and populate Git commit input box',
            iconPath: new vscode.ThemeIcon('sparkle'),
            command: {
              command: 'commitcraft.generate',
              title: 'Generate Commit Message'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'แปลโน้ตเป็น Commit อังกฤษ (TH → EN)' : 'Translate Notes to Conventional Commit',
          vscode.TreeItemCollapsibleState.None,
          {
            description: 'TH → EN',
            tooltip: isThai ? 'แปลงโน้ตภาษาไทยในช่อง Commit ให้เป็น Conventional Commit ภาษาอังกฤษสากล' : 'Translate informal commit notes into professional Conventional Commit',
            iconPath: new vscode.ThemeIcon('globe'),
            command: {
              command: 'commitcraft.translateCommit',
              title: 'Translate Commit Message'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'สร้าง Commit ออฟไลน์ (Offline Mode)' : 'Generate Offline Commit',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? '0 AI / ไม่ใช้เน็ต' : '0 AI / Offline',
            tooltip: isThai ? 'วิเคราะห์ไฟล์สร้างข้อความ Commit อัตโนมัติโดยตรงในเครื่อง ไม่พึ่งพา AI' : 'Generate commit message instantly without AI / Internet connection',
            iconPath: new vscode.ThemeIcon('plug'),
            command: {
              command: 'commitcraft.generateOffline',
              title: 'Generate Offline Commit'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'สร้าง 3 ตัวเลือกสไตล์ (3 Candidates)' : 'Generate 3 Commit Options',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'เลือกสไตล์' : 'Choose style',
            tooltip: isThai ? 'สร้างตัวเลือก 3 รูปแบบ (Conventional, สั้นกระชับ, ละเอียด)' : 'Generate Conventional, Concise, and Detailed candidate options',
            iconPath: new vscode.ThemeIcon('list-unordered'),
            command: {
              command: 'commitcraft.generateCandidates',
              title: 'Generate Multiple Options'
            }
          }
        )
      ];
    }

    // Category 2: Code Safety & Stash
    if (element.category === 'codeSafety') {
      return [
        new CommitCraftTreeItem(
          isThai ? 'เล่าประวัติโค้ดบรรทัดนี้ (AI Line Storyteller)' : 'Explain Line Story (AI Storyteller)',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'AI เล่าประวัติ' : 'Line backstory',
            tooltip: isThai ? 'วิเคราะห์ Git Blame และ Commit เล่าเบื้องหลังว่าทำไมบรรทัดนี้ถึงถูกเขียนขึ้นมาและใช้ Logic นี้' : 'Analyze Git blame and commit backstory of why this line was written and why this logic was chosen',
            iconPath: new vscode.ThemeIcon('book'),
            command: {
              command: 'commitcraft.tellLineStory',
              title: 'Explain Line Story'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'ตรวจทานโค้ดก่อน Commit (Code Review)' : 'Pre-Commit Code Review',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'ตรวจบั๊ก & ความปลอดภัย' : 'Audit diff',
            tooltip: isThai ? 'สแกนหาข้อผิดพลาด บั๊ก API Key หลุด และ console.log' : 'Audit staged code for bugs, secrets, and console.logs',
            iconPath: new vscode.ThemeIcon('shield'),
            command: {
              command: 'commitcraft.reviewChanges',
              title: 'Pre-Commit Code Review'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'ย้อนกลับ Commit ล่าสุด (Safe Undo)' : 'Safe Undo Last Commit',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'กู้คืนโค้ดปลอดภัย' : 'Zero data loss',
            tooltip: isThai ? 'ย้อนกลับ Commit ล่าสุดโดยคงโค้ดไว้ครบถ้วนและกู้ข้อความเดิมกลับมา' : 'Undo latest commit safely, keep modifications, and restore message',
            iconPath: new vscode.ThemeIcon('discard'),
            command: {
              command: 'commitcraft.safeUndo',
              title: 'Safe Undo Last Commit'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'แก้ Merge Conflict ด้วย AI' : 'Resolve Conflicts with AI',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'รวมโค้ดฉลาด' : 'Intelligent merge',
            tooltip: isThai ? 'ให้ AI วิเคราะห์โค้ดทั้งสองฝั่งและรวมแก้ปัญหา Conflict ให้อัตโนมัติ' : 'Analyze conflict blocks and auto-resolve logic cleanly with AI',
            iconPath: new vscode.ThemeIcon('git-pull-request-go-to-changes'),
            command: {
              command: 'commitcraft.resolveConflict',
              title: 'Resolve Conflicts with AI'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'บันทึกโค้ดชั่วคราว (Smart Stash WIP)' : 'Smart Git Stash WIP',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'AI บันทึก Stash' : 'AI Stash WIP',
            tooltip: isThai ? 'วิเคราะห์โค้ดที่ยังไม่เสร็จแล้วตั้งชื่อ Stash ให้อัตโนมัติใน 1 คลิก' : 'Analyze uncommitted code and create a WIP stash with AI in 1 click',
            iconPath: new vscode.ThemeIcon('archive'),
            command: {
              command: 'commitcraft.smartStash',
              title: 'Smart Git Stash'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'เรียกคืนโค้ดจาก Stash (Stash Pop)' : 'Restore Stash (Stash Pop)',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'ดึงโค้ดล่าสุด' : 'Pop latest',
            tooltip: isThai ? 'ดึงการแก้ไขที่บันทึกไว้ใน Stash ล่าสุดกลับมาทำงานต่อ' : 'Pop and apply latest git stash',
            iconPath: new vscode.ThemeIcon('history'),
            command: {
              command: 'commitcraft.popStash',
              title: 'Pop Stash'
            }
          }
        )
      ];
    }

    // Category 3: Branch & Release
    if (element.category === 'branchRelease') {
      return [
        new CommitCraftTreeItem(
          isThai ? 'จำลองการตรวจ PR จาก Senior Dev (PR Pre-Review)' : 'Simulate Senior PR Review',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'Senior Architect' : 'Senior Architect',
            tooltip: isThai ? 'ให้ Senior AI ตรวจสอบโค้ดทั้ง Branch ก่อนเปิด PR จริง (เช็กบั๊ก, ความปลอดภัย, ประสิทธิภาพ)' : 'Simulate full Senior Staff Code Review on whole branch before opening actual PR',
            iconPath: new vscode.ThemeIcon('shield'),
            command: {
              command: 'commitcraft.simulatePRReview',
              title: 'Simulate Senior PR Review'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'ตามล่าหาจุดเกิดบั๊ก (AI Git Bisect Bug Tracker)' : 'AI Git Bisect Bug Tracker',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'AI ชี้เป้าบั๊ก' : 'Pinpoint bug',
            tooltip: isThai ? 'ให้ AI ช่วยวิเคราะห์ Diff ทีละสเต็ปเพื่อหา Commit และคนที่ทำให้เกิดบั๊ก' : 'Step-by-step AI guided git bisect to find the culprit commit and author',
            iconPath: new vscode.ThemeIcon('bug'),
            command: {
              command: 'commitcraft.bisectBugTracker',
              title: 'AI Git Bisect Bug Tracker'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'แนะนำ Release Tag & ร่าง Release (Draft Release)' : 'Suggest Release Tag & Draft Release',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'SemVer & GitHub/GitLab' : 'SemVer & Web',
            tooltip: isThai ? 'วิเคราะห์ประวัติ Commit แนะนำเลขเวอร์ชัน และเปิดหน้าร่าง Release บนเว็บทันที' : 'Analyze commits to recommend SemVer bump and draft web release',
            iconPath: new vscode.ThemeIcon('tag'),
            command: {
              command: 'commitcraft.draftRelease',
              title: 'Suggest Release Tag & Draft Release'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'Sync & Rebase กับ Base Branch (Sync Branch)' : 'Sync & Rebase with Base Branch',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'Rebase / Merge' : 'Rebase / Merge',
            tooltip: isThai ? 'Sync อัปเดต Branch ปัจจุบันให้ทัน main/master ด้วย Rebase หรือ Merge พร้อม AI จัดการ Conflict' : 'Intelligently sync active branch with base branch using Rebase or Merge',
            iconPath: new vscode.ThemeIcon('git-pull-request-go-to-changes'),
            command: {
              command: 'commitcraft.syncBranch',
              title: 'Sync Branch'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'สร้างคำอธิบาย Pull Request (PR Description)' : 'Generate PR Description',
          vscode.TreeItemCollapsibleState.None,
          {
            description: 'Markdown',
            tooltip: isThai ? 'ร่างคำอธิบาย PR สำหรับ GitHub/GitLab จากประวัติ Commit' : 'Draft a full Pull Request description from branch history',
            iconPath: new vscode.ThemeIcon('git-pull-request'),
            command: {
              command: 'commitcraft.generatePR',
              title: 'Generate PR Description'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'สรุปรวมหลาย Commit (Squash & Rebase)' : 'Synthesize Squash Commits',
          vscode.TreeItemCollapsibleState.None,
          {
            description: 'AI Squash',
            tooltip: isThai ? 'วิเคราะห์รวมหลาย Commit ย่อยให้เป็น 1 Clean Commit สำหรับ Squash Merge' : 'Synthesize multiple WIP commits into 1 clean Conventional Commit',
            iconPath: new vscode.ThemeIcon('git-merge'),
            command: {
              command: 'commitcraft.squashSummary',
              title: 'Squash & Rebase Summarizer'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'ลบ Branch ที่ Merge แล้ว (Clean Ghost Branches)' : 'Clean Merged Branches',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'จัดระเบียบ Repo' : 'Repo hygiene',
            tooltip: isThai ? 'สแกนหา Local Branches ที่ Merge เข้า main/master แล้ว และลบทิ้งใน 1 คลิก' : 'Scan and delete merged local branches cleanly in 1 click',
            iconPath: new vscode.ThemeIcon('trash'),
            command: {
              command: 'commitcraft.cleanBranches',
              title: 'Clean Merged Branches'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'สร้าง/อัปเดต CHANGELOG.md' : 'Generate CHANGELOG.md',
          vscode.TreeItemCollapsibleState.None,
          {
            description: 'Keep a Changelog',
            tooltip: isThai ? 'สร้างหรืออัปเดตไฟล์ CHANGELOG.md ของเวอร์ชันนี้อัตโนมัติ' : 'Auto-generate or update CHANGELOG.md for this release',
            iconPath: new vscode.ThemeIcon('notebook'),
            command: {
              command: 'commitcraft.generateChangelog',
              title: 'Generate CHANGELOG.md'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'แนะนำชื่อ Branch (Suggest Branch)' : 'Suggest Branch Name',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'ชื่อมาตรฐาน' : 'Standard names',
            tooltip: isThai ? 'รับคำแนะนำชื่อ Git branch ตามมาตรฐานจากโค้ดที่แก้' : 'Get Git branch name suggestions based on code diff',
            iconPath: new vscode.ThemeIcon('git-branch'),
            command: {
              command: 'commitcraft.suggestBranch',
              title: 'Suggest Branch Name'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'อธิบาย Commit (Commit Explainer)' : 'Explain Commit',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'AI สรุปเจาะลึก' : 'Deep dive',
            tooltip: isThai ? 'ให้ AI ช่วยสรุปและอธิบายจุดประสงค์ของ Commit เก่าๆ ในประวัติ Git' : 'Have AI explain motivation, changes, and system impact of any commit',
            iconPath: new vscode.ThemeIcon('book'),
            command: {
              command: 'commitcraft.explainCommit',
              title: 'Explain Commit'
            }
          }
        )
      ];
    }

    // Category 4: Configuration & Settings
    if (element.category === 'activeSettings') {
      const provider = this.configManager.getActiveProvider();
      const activeModel = this.configManager.getActiveModel();
      const language = this.configManager.getConfig<string>(
        ConfigKeys.AI_COMMIT_LANGUAGE,
        'Thai'
      );
      const style = this.configManager.getConfig<string>(
        ConfigKeys.COMMIT_STYLE,
        'conventional'
      );
      const apiKey = await this.configManager.getEffectiveApiKey(provider.id);

      const items: CommitCraftTreeItem[] = [];

      items.push(
        new CommitCraftTreeItem(
          isThai ? `ผู้ให้บริการ AI: ${provider.name}` : `AI Provider: ${provider.name}`,
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'คลิกเพื่อเปลี่ยน' : 'Click to switch',
            tooltip: isThai ? `ปัจจุบันใช้งาน ${provider.name} (คลิกเพื่อเปลี่ยนผู้ให้บริการ)` : `Currently using ${provider.name}. Click to switch AI provider.`,
            iconPath: new vscode.ThemeIcon('hubot'),
            command: {
              command: 'commitcraft.switchProvider',
              title: 'Switch AI Provider'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? `โมเดล AI: ${activeModel}` : `Model: ${activeModel}`,
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'คลิกเพื่อเปลี่ยน' : 'Click to change',
            tooltip: isThai ? `โมเดลที่ใช้งาน: ${activeModel} (คลิกเพื่อเลือกรุ่นอื่น)` : `Active model: ${activeModel}. Click to choose another model.`,
            iconPath: new vscode.ThemeIcon('symbol-property'),
            command: {
              command: 'commitcraft.selectModel',
              title: 'Select Model'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? `ภาษาข้อความ: ${language}` : `Language: ${language}`,
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'คลิกเพื่อเปลี่ยน' : 'Click to change',
            tooltip: isThai ? `ภาษาของข้อความ Commit: ${language} (คลิกเพื่อเปลี่ยน)` : `Commit language: ${language}. Click to change language.`,
            iconPath: new vscode.ThemeIcon('globe'),
            command: {
              command: 'commitcraft.switchLanguage',
              title: 'Switch Language'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? `สไตล์ Commit: ${style}` : `Commit Style: ${style}`,
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'คลิกเพื่อเปลี่ยน' : 'Click to change',
            tooltip: isThai ? `สไตล์การเขียน Commit: ${style} (คลิกเพื่อเปลี่ยน)` : `Commit style: ${style}. Click to switch style.`,
            iconPath: new vscode.ThemeIcon('paintcan'),
            command: {
              command: 'commitcraft.switchStyle',
              title: 'Switch Commit Style'
            }
          }
        )
      );

      if (provider.requiresApiKey) {
        items.push(
          new CommitCraftTreeItem(
            isThai ? `API Key: ${apiKey ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ระบุ'}` : `API Key: ${apiKey ? 'Configured' : 'Missing'}`,
            vscode.TreeItemCollapsibleState.None,
            {
              description: isThai ? 'คลิกเพื่อแก้ไข' : 'Click to set',
              tooltip: apiKey
                ? isThai ? `ตั้งค่า API Key สำหรับ ${provider.name} แล้ว` : `API Key for ${provider.name} is configured.`
                : isThai ? `ยังไม่ได้ระบุ API Key สำหรับ ${provider.name}! คลิกเพื่อกรอก Key` : `API Key for ${provider.name} is not set! Click to enter key.`,
              iconPath: new vscode.ThemeIcon(apiKey ? 'key' : 'warning'),
              command: {
                command: 'commitcraft.setApiKey',
                title: 'Set API Key'
              }
            }
          )
        );
      }

      items.push(
        new CommitCraftTreeItem(
          isThai ? 'ตัวช่วยตั้งค่าด่วน (Setup Wizard)' : 'Quick Setup Wizard',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'ทีละขั้นตอน' : 'Step-by-step',
            tooltip: isThai ? 'เปิดตัวช่วยแนะนำการตั้งค่าทีละขั้นตอน' : 'Run step-by-step configuration wizard',
            iconPath: new vscode.ThemeIcon('sparkle'),
            command: {
              command: 'commitcraft.quickSetup',
              title: 'Quick Setup Wizard'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'เปิดหน้าตั้งค่า (Settings Panel)' : 'Open Settings Panel',
          vscode.TreeItemCollapsibleState.None,
          {
            description: isThai ? 'แผงควบคุม UI' : 'Interactive UI',
            tooltip: isThai ? 'เปิดหน้าต่างการตั้งค่า CommitCraft แบบละเอียด' : 'Open CommitCraft settings panel',
            iconPath: new vscode.ThemeIcon('gear'),
            command: {
              command: 'commitcraft.openSettings',
              title: 'Open Settings'
            }
          }
        )
      );

      return items;
    }

    return [];
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
