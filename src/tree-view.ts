import * as vscode from 'vscode';
import { ConfigKeys, ConfigurationManager } from './config';

export class CommitCraftTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    options?: {
      description?: string;
      tooltip?: string;
      iconPath?: vscode.ThemeIcon | string;
      command?: vscode.Command;
      contextValue?: string;
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
    if (!element) {
      return [
        new CommitCraftTreeItem(
          'Quick Actions',
          vscode.TreeItemCollapsibleState.Expanded,
          {
            iconPath: new vscode.ThemeIcon('zap')
          }
        ),
        new CommitCraftTreeItem(
          'Active Settings',
          vscode.TreeItemCollapsibleState.Expanded,
          {
            iconPath: new vscode.ThemeIcon('settings')
          }
        )
      ];
    }

    if (element.label === 'Quick Actions') {
      return [
        new CommitCraftTreeItem('Generate Commit Message', vscode.TreeItemCollapsibleState.None, {
          description: '1-Click',
          tooltip: 'Analyze staged changes and populate Git commit input box',
          iconPath: new vscode.ThemeIcon('git-commit'),
          command: {
            command: 'commitcraft.generate',
            title: 'Generate Commit Message'
          }
        }),
        new CommitCraftTreeItem('Generate 3 Commit Options', vscode.TreeItemCollapsibleState.None, {
          description: 'Choose style',
          tooltip: 'Generate Conventional, Concise, and Detailed candidate options',
          iconPath: new vscode.ThemeIcon('list-unordered'),
          command: {
            command: 'commitcraft.generateCandidates',
            title: 'Generate Multiple Options'
          }
        }),
        new CommitCraftTreeItem('Pre-Commit Code Review', vscode.TreeItemCollapsibleState.None, {
          description: 'Audit diff',
          tooltip: 'Audit staged code for bugs, secrets, and console.logs',
          iconPath: new vscode.ThemeIcon('shield'),
          command: {
            command: 'commitcraft.reviewChanges',
            title: 'Pre-Commit Code Review'
          }
        }),
        new CommitCraftTreeItem('Generate PR Description', vscode.TreeItemCollapsibleState.None, {
          description: 'Markdown',
          tooltip: 'Draft a full Pull Request description from branch history',
          iconPath: new vscode.ThemeIcon('git-pull-request'),
          command: {
            command: 'commitcraft.generatePR',
            title: 'Generate PR Description'
          }
        }),
        new CommitCraftTreeItem('Suggest Branch Name', vscode.TreeItemCollapsibleState.None, {
          description: 'Standard names',
          tooltip: 'Get Git branch name suggestions based on code diff',
          iconPath: new vscode.ThemeIcon('git-branch'),
          command: {
            command: 'commitcraft.suggestBranch',
            title: 'Suggest Branch Name'
          }
        }),
        new CommitCraftTreeItem('Generate CHANGELOG.md', vscode.TreeItemCollapsibleState.None, {
          description: 'Keep a Changelog',
          tooltip: 'Auto-generate or update CHANGELOG.md for this release',
          iconPath: new vscode.ThemeIcon('notebook'),
          command: {
            command: 'commitcraft.generateChangelog',
            title: 'Generate CHANGELOG.md'
          }
        })
      ];
    }

    if (element.label === 'Active Settings') {
      const provider = this.configManager.getActiveProvider();
      const activeModel = this.configManager.getActiveModel();
      const language = this.configManager.getConfig<string>(
        ConfigKeys.AI_COMMIT_LANGUAGE,
        'English'
      );
      const style = this.configManager.getConfig<string>(
        ConfigKeys.COMMIT_STYLE,
        'conventional'
      );
      const apiKey = await this.configManager.getEffectiveApiKey(provider.id);

      const items: CommitCraftTreeItem[] = [];

      items.push(
        new CommitCraftTreeItem(`AI Provider: ${provider.name}`, vscode.TreeItemCollapsibleState.None, {
          description: 'Click to switch',
          tooltip: `Currently using ${provider.name}. Click to switch AI provider.`,
          iconPath: new vscode.ThemeIcon('hubot'),
          command: {
            command: 'commitcraft.switchProvider',
            title: 'Switch AI Provider'
          }
        }),
        new CommitCraftTreeItem(`Model: ${activeModel}`, vscode.TreeItemCollapsibleState.None, {
          description: 'Click to change',
          tooltip: `Active model: ${activeModel}. Click to choose another model.`,
          iconPath: new vscode.ThemeIcon('symbol-property'),
          command: {
            command: 'commitcraft.selectModel',
            title: 'Select Model'
          }
        }),
        new CommitCraftTreeItem(`Language: ${language}`, vscode.TreeItemCollapsibleState.None, {
          description: 'Click to change',
          tooltip: `Commit language: ${language}. Click to change language.`,
          iconPath: new vscode.ThemeIcon('globe'),
          command: {
            command: 'commitcraft.switchLanguage',
            title: 'Switch Language'
          }
        }),
        new CommitCraftTreeItem(`Commit Style: ${style}`, vscode.TreeItemCollapsibleState.None, {
          description: 'Click to change',
          tooltip: `Commit style: ${style}. Click to switch style.`,
          iconPath: new vscode.ThemeIcon('paintcan'),
          command: {
            command: 'commitcraft.switchStyle',
            title: 'Switch Commit Style'
          }
        })
      );

      if (provider.requiresApiKey) {
        items.push(
          new CommitCraftTreeItem(
            `API Key: ${apiKey ? 'Configured' : 'Missing'}`,
            vscode.TreeItemCollapsibleState.None,
            {
              description: 'Click to set',
              tooltip: apiKey
                ? `API Key for ${provider.name} is configured. Click to update.`
                : `API Key for ${provider.name} is not set! Click to enter key.`,
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
        new CommitCraftTreeItem('Quick Setup Wizard', vscode.TreeItemCollapsibleState.None, {
          description: 'Step-by-step',
          tooltip: 'Run step-by-step configuration wizard',
          iconPath: new vscode.ThemeIcon('sparkle'),
          command: {
            command: 'commitcraft.quickSetup',
            title: 'Quick Setup Wizard'
          }
        }),
        new CommitCraftTreeItem('Open Full Settings UI', vscode.TreeItemCollapsibleState.None, {
          description: 'VS Code Settings',
          tooltip: 'Open CommitCraft settings page in VS Code',
          iconPath: new vscode.ThemeIcon('gear'),
          command: {
            command: 'commitcraft.openSettings',
            title: 'Open Settings'
          }
        })
      );

      return items;
    }

    return [];
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
