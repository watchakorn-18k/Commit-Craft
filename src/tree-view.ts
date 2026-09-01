import * as vscode from 'vscode';
import { ConfigKeys, ConfigurationManager } from './config';

export class CommitCraftTreeItem extends vscode.TreeItem {
  public category?: 'quickActions' | 'activeSettings';

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    options?: {
      description?: string;
      tooltip?: string;
      iconPath?: vscode.ThemeIcon | string;
      command?: vscode.Command;
      contextValue?: string;
      category?: 'quickActions' | 'activeSettings';
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
          isThai ? 'คำสั่งด่วน (Quick Actions)' : 'Quick Actions',
          vscode.TreeItemCollapsibleState.Expanded,
          {
            iconPath: new vscode.ThemeIcon('zap'),
            category: 'quickActions'
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'การตั้งค่าปัจจุบัน (Active Settings)' : 'Active Settings',
          vscode.TreeItemCollapsibleState.Expanded,
          {
            iconPath: new vscode.ThemeIcon('settings'),
            category: 'activeSettings'
          }
        )
      ];
    }

    if (element.category === 'quickActions' || element.label?.toString().includes('Quick Actions') || element.label?.toString().includes('คำสั่งด่วน')) {
      return [
        new CommitCraftTreeItem(
          isThai ? 'สร้างข้อความ Commit (Generate)' : 'Generate Commit Message',
          vscode.TreeItemCollapsibleState.None,
          {
            description: '1-Click',
            tooltip: isThai ? 'วิเคราะห์การเปลี่ยนแปลงและใส่ข้อความลงใน Git Input Box ทันที' : 'Analyze staged changes and populate Git commit input box',
            iconPath: new vscode.ThemeIcon('git-commit'),
            command: {
              command: 'commitcraft.generate',
              title: 'Generate Commit Message'
            }
          }
        ),
        new CommitCraftTreeItem(
          isThai ? 'สร้าง 3 ตัวเลือก Commit (3 Options)' : 'Generate 3 Commit Options',
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

    if (element.category === 'activeSettings' || element.label?.toString().includes('Active Settings') || element.label?.toString().includes('การตั้งค่าปัจจุบัน')) {
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
