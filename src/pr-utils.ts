import * as vscode from 'vscode';
import { AIService } from './ai-service';
import { ConfigKeys, ConfigurationManager } from './config';
import { getBranchDiff, getRepo } from './git-utils';
import { getPRDescriptionPrompt } from './prompts';
import { ProgressHandler } from './utils';
import { Logger } from './logger';

/**
 * Generates a comprehensive Pull Request (PR/MR) description in Markdown.
 */
export async function generatePRDescription(arg?: any): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const provider = configManager.getActiveProvider();

  let repo: any;
  try {
    repo = await getRepo(arg);
  } catch (err: any) {
    vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
    return;
  }

  const baseBranch = await vscode.window.showInputBox({
    title: 'Generate PR Description',
    prompt: 'Enter base target branch to compare against (e.g. main, master, develop)',
    value: 'main',
    ignoreFocusOut: true
  });

  if (!baseBranch) {
    return;
  }

  const language = configManager.getConfig<string>(ConfigKeys.AI_COMMIT_LANGUAGE, 'English');

  return ProgressHandler.withProgress(
    `Generating PR Description (${provider.name})...`,
    async (progress) => {
      try {
        progress.report({ message: `Fetching diff against '${baseBranch}'...` });
        const { diff, commits, error } = await getBranchDiff(repo, baseBranch);

        if (error) {
          throw new Error(error);
        }

        if (!diff || diff.trim() === '') {
          vscode.window.showInformationMessage(`No differences found between current branch and '${baseBranch}'.`);
          return;
        }

        progress.report({ message: 'Generating PR Markdown description...' });
        const messages = getPRDescriptionPrompt(diff, commits, language);
        const prMarkdown = await AIService.query(messages);

        if (!prMarkdown) {
          throw new Error('AI returned an empty PR response.');
        }

        const doc = await vscode.workspace.openTextDocument({
          content: prMarkdown,
          language: 'markdown'
        });

        await vscode.window.showTextDocument(doc, {
          preview: false,
          viewColumn: vscode.ViewColumn.Beside
        });

        const copyChoice = await vscode.window.showInformationMessage(
          'CommitCraft: PR description generated.',
          'Copy to Clipboard'
        );

        if (copyChoice === 'Copy to Clipboard') {
          await vscode.env.clipboard.writeText(prMarkdown);
          vscode.window.showInformationMessage('Copied PR description to clipboard!');
        }
      } catch (err: any) {
        Logger.error('Generate PR Description failed:', err);
        vscode.window.showErrorMessage(`PR generation failed: ${err?.message || err}`);
      }
    }
  );
}
