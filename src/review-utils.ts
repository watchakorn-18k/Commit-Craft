import * as vscode from 'vscode';
import { AIService } from './ai-service';
import { ConfigKeys, ConfigurationManager } from './config';
import { getDiffStaged, getRepo, hasUnstagedChanges, stageAllChanges } from './git-utils';
import { getPreCommitReviewPrompt } from './prompts';
import { ProgressHandler } from './utils';
import { Logger } from './logger';

/**
 * Conducts an AI pre-commit code review on staged changes and opens a Markdown report.
 */
export async function reviewStagedChanges(arg?: any): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const provider = configManager.getActiveProvider();

  let repo: any;
  try {
    repo = await getRepo(arg);
  } catch (err: any) {
    vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
    return;
  }

  let diffResult = await getDiffStaged(repo);
  let diff = diffResult.diff;

  if (!diff || diff === 'No changes staged.') {
    const hasChanges = await hasUnstagedChanges(repo);
    if (hasChanges) {
      const choice = await vscode.window.showInformationMessage(
        'No staged changes found. Would you like to stage all changes and run the AI Code Review?',
        'Stage All & Review',
        'Cancel'
      );
      if (choice === 'Stage All & Review') {
        await stageAllChanges(repo);
        diffResult = await getDiffStaged(repo);
        diff = diffResult.diff;
      } else {
        return;
      }
    } else {
      vscode.window.showInformationMessage('No git changes to review.');
      return;
    }
  }

  const language = configManager.getConfig<string>(ConfigKeys.AI_COMMIT_LANGUAGE, 'English');

  return ProgressHandler.withProgress(
    `AI Pre-Commit Review (${provider.name})...`,
    async (progress) => {
      try {
        progress.report({ message: 'Analyzing diff for bugs, security & quality...' });
        const messages = getPreCommitReviewPrompt(diff, language);
        const reviewMarkdown = await AIService.query(messages);

        if (!reviewMarkdown) {
          throw new Error('AI returned an empty review response.');
        }

        // Open review in a new untitled Markdown editor
        const doc = await vscode.workspace.openTextDocument({
          content: reviewMarkdown,
          language: 'markdown'
        });

        await vscode.window.showTextDocument(doc, {
          preview: true,
          viewColumn: vscode.ViewColumn.Beside
        });

        vscode.window.showInformationMessage('CommitCraft: Pre-commit code review completed.');
      } catch (err: any) {
        Logger.error('AI Code Review failed:', err);
        vscode.window.showErrorMessage(`AI Code Review failed: ${err?.message || err}`);
      }
    }
  );
}
