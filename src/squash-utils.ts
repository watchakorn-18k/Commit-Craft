import * as vscode from 'vscode';
import { getRepo, getCommitsForSquash } from './git-utils';
import { getSquashPrompt } from './prompts';
import { AIService } from './ai-service';
import { ConfigKeys, ConfigurationManager } from './config';
import { ProgressHandler } from './utils';
import { Logger } from './logger';

/**
 * Synthesizes multiple micro-commits from the current branch into 1 clean Conventional Commit message.
 */
export async function summarizeSquashCommits(arg?: any): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const provider = configManager.getActiveProvider();
  const isThai = configManager.getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'en') === 'th';
  const language = configManager.getConfig<string>(ConfigKeys.AI_COMMIT_LANGUAGE, 'English');

  let repo: any;
  try {
    repo = await getRepo(arg);
  } catch (err: any) {
    vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
    return;
  }

  // 1. Ask user how many recent commits to squash
  const countItems = [
    { label: '3 Commits ล่าสุด', count: 3, description: 'Squash last 3 commits' },
    { label: '5 Commits ล่าสุด', count: 5, description: 'Squash last 5 commits (Recommended)' },
    { label: '10 Commits ล่าสุด', count: 10, description: 'Squash last 10 commits' },
    { label: '15 Commits ล่าสุด', count: 15, description: 'Squash last 15 commits' },
    { label: 'ระบุจำนวนเอง...', count: -1, description: 'Custom commit count' }
  ];

  const selectedCount = await vscode.window.showQuickPick(countItems, {
    title: isThai
      ? 'CommitCraft: สรุปรวมข้อความ Commit (Git Squash & Rebase Summarizer)'
      : 'CommitCraft: Squash & Rebase Commit Summarizer',
    placeHolder: isThai ? 'เลือกจำนวน Commit ล่าสุดที่ต้องการนำมารวม' : 'Select how many recent commits to summarize'
  });

  if (!selectedCount) {
    return;
  }

  let finalCount = selectedCount.count;
  if (finalCount === -1) {
    const entered = await vscode.window.showInputBox({
      title: isThai ? 'ระบุจำนวน Commit ที่ต้องการรวม' : 'Enter Commit Count',
      prompt: isThai ? 'พิมพ์ตัวเลขจำนวน Commit เช่น 4, 7, 12' : 'Enter number of commits to squash',
      validateInput: (val) => (isNaN(Number(val)) || Number(val) <= 0 ? 'กรุณาระบุตัวเลขที่มากกว่า 0' : null)
    });
    if (!entered) {
      return;
    }
    finalCount = parseInt(entered.trim(), 10);
  }

  return ProgressHandler.withProgress(
    isThai
      ? `AI กำลังวิเคราะห์และสรุปรวม ${finalCount} Commits ด้วย ${provider.name}...`
      : `Summarizing ${finalCount} commits for squash with ${provider.name}...`,
    async (progress) => {
      try {
        progress.report({ message: 'Fetching commit history & diff...' });
        const squashData = await getCommitsForSquash(repo, finalCount);

        if (squashData.error || squashData.commits.length === 0) {
          throw new Error(squashData.error || 'No commits found to squash.');
        }

        const commitListFormatted = squashData.commits
          .map((c) => `- [${c.hash}] ${c.message} (${c.author})`)
          .join('\n');

        progress.report({ message: `Generating unified commit with ${provider.name}...` });
        const prompt = getSquashPrompt(commitListFormatted, squashData.diff, language);
        const raw = await AIService.query(prompt);

        if (!raw) {
          throw new Error('AI returned an empty response.');
        }

        let cleaned = raw.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
        }

        // Put synthesized message into Git SCM input box
        if (repo.inputBox) {
          repo.inputBox.value = cleaned;
        }

        await vscode.commands.executeCommand('workbench.view.scm');

        const firstLine = cleaned.split('\n')[0];
        vscode.window.showInformationMessage(
          isThai
            ? `สรุปรวม ${squashData.commits.length} Commits เรียบร้อยแล้ว:\n"${firstLine}"`
            : `Synthesized ${squashData.commits.length} commits for squash:\n"${firstLine}"`
        );
      } catch (err: any) {
        Logger.error('Squash commit summarizer failed:', err);
        vscode.window.showErrorMessage(`CommitCraft Squash: ${err?.message || err}`);
      }
    }
  );
}
