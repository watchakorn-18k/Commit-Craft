import * as vscode from 'vscode';
import { AIService } from './ai-service';
import { getDiffStaged, getRepo, hasUnstagedChanges } from './git-utils';
import { getBranchNamePrompt } from './prompts';
import { ProgressHandler } from './utils';
import { Logger } from './logger';

/**
 * Suggests branch names based on current staged/unstaged changes.
 */
export async function suggestBranchName(arg?: any): Promise<void> {
  let repo: any;
  try {
    repo = await getRepo(arg);
  } catch (err: any) {
    vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
    return;
  }

  let { diff } = await getDiffStaged(repo);
  if (!diff || diff === 'No changes staged.') {
    const hasChanges = await hasUnstagedChanges(repo);
    if (!hasChanges) {
      vscode.window.showInformationMessage('No git changes detected to base branch name suggestions on.');
      return;
    }
  }

  return ProgressHandler.withProgress('Suggesting branch names...', async (progress) => {
    try {
      progress.report({ message: 'Analyzing changes...' });
      const messages = getBranchNamePrompt(diff);
      const raw = await AIService.query(messages);

      let suggestions: string[] = [];
      try {
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[0]);
        }
      } catch {
        suggestions = raw.split('\n').filter((l) => l.trim().length > 0).map((l) => l.replace(/^[-*0-9.]+\s*/, '').trim());
      }

      if (suggestions.length === 0) {
        suggestions = ['feat/new-feature', 'fix/issue-fix', 'refactor/codebase-update'];
      }

      const selected = await vscode.window.showQuickPick(
        suggestions.map((name) => ({ label: name, branchName: name })),
        {
          title: 'Select a Suggested Branch Name',
          placeHolder: 'Pick a branch name to copy or create'
        }
      );

      if (selected) {
        await vscode.env.clipboard.writeText(selected.branchName);
        const action = await vscode.window.showInformationMessage(
          `Branch name "${selected.branchName}" copied to clipboard!`,
          'Create Branch Now'
        );

        if (action === 'Create Branch Now') {
          const terminal = vscode.window.activeTerminal || vscode.window.createTerminal('Git');
          terminal.show();
          terminal.sendText(`git checkout -b ${selected.branchName}`);
        }
      }
    } catch (err: any) {
      Logger.error('Suggest branch name failed:', err);
      vscode.window.showErrorMessage(`Failed to suggest branch name: ${err?.message || err}`);
    }
  });
}
