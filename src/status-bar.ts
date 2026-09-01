import * as vscode from 'vscode';
import { ConfigKeys, ConfigurationManager } from './config';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = 'commitcraft.quickMenu';
    this.context.subscriptions.push(this.statusBarItem);

    const configManager = ConfigurationManager.getInstance();
    this.disposables.push(
      configManager.onDidChangeConfig(() => this.update())
    );

    this.update();
  }

  public update(): void {
    const configManager = ConfigurationManager.getInstance();
    const showStatusBar = configManager.getConfig<boolean>(
      ConfigKeys.SHOW_STATUS_BAR,
      true
    );

    if (!showStatusBar) {
      this.statusBarItem.hide();
      return;
    }

    const provider = configManager.getActiveProvider();
    const model = configManager.getActiveModel();

    this.statusBarItem.text = `$(git-commit) CommitCraft`;
    this.statusBarItem.tooltip = `CommitCraft (${provider.name}: ${model})\nClick for 1-Click Action Hub & Settings`;
    this.statusBarItem.show();
  }

  public dispose(): void {
    this.statusBarItem.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
