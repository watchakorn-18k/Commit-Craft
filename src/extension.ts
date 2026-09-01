import * as vscode from 'vscode';
import { CommandManager } from './commands';
import { ConfigurationManager } from './config';
import { Logger } from './logger';
import { StatusBarManager } from './status-bar';
import { CommitCraftTreeDataProvider } from './tree-view';
import { GitStatsWebviewViewProvider } from './stats-webview-provider';

/**
 * Activates the extension and registers commands, tree views, webview views, and status bar.
 *
 * @param {vscode.ExtensionContext} context - The context for the extension.
 */
export async function activate(context: vscode.ExtensionContext) {
  try {
    Logger.initialize();
    Logger.info('Activating CommitCraft extension...');

    const configManager = ConfigurationManager.getInstance(context);
    const commandManager = new CommandManager(context);
    commandManager.registerCommands();

    const statusBarManager = new StatusBarManager(context);

    // Register Git Visual Insights Webview View in the Sidebar
    const statsWebviewProvider = new GitStatsWebviewViewProvider(context.extensionUri);
    const statsWebviewDisposable = vscode.window.registerWebviewViewProvider(
      GitStatsWebviewViewProvider.viewType,
      statsWebviewProvider
    );

    // Register interactive tree view data provider in both SCM view and Activity Bar
    const treeProvider = new CommitCraftTreeDataProvider();
    const scmTreeView = vscode.window.registerTreeDataProvider('commitcraft.scmView', treeProvider);
    const sidebarTreeView = vscode.window.registerTreeDataProvider('commitcraft.sidebarView', treeProvider);

    context.subscriptions.push(statsWebviewDisposable);
    context.subscriptions.push(scmTreeView);
    context.subscriptions.push(sidebarTreeView);
    context.subscriptions.push({
      dispose: () => {
        configManager.dispose();
        commandManager.dispose();
        statusBarManager.dispose();
        treeProvider.dispose();
        Logger.dispose();
      }
    });

    Logger.info('CommitCraft extension activated successfully.');
  } catch (error) {
    Logger.error('Failed to activate CommitCraft extension:', error);
    throw error;
  }
}

/**
 * Deactivates the extension.
 */
export function deactivate() {}
