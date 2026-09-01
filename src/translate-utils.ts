import * as vscode from 'vscode';
import { getRepo, getCurrentBranch, extractIssueFromBranch, getStagedFilePaths } from './git-utils';
import { detectMonorepoScope } from './scope-detector';
import { getTranslateCommitPrompt } from './prompts';
import { AIService } from './ai-service';
import { ConfigKeys, ConfigurationManager } from './config';
import { ProgressHandler } from './utils';
import { Logger } from './logger';

/**
 * Translates informal Thai (or any language) commit notes into a professional English Conventional Commit message.
 */
export async function translateCommitMessage(arg?: any): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const provider = configManager.getActiveProvider();
  const isThai = configManager.getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'en') === 'th';
  const autoDetectIssue = configManager.getConfig<boolean>(ConfigKeys.AUTO_DETECT_ISSUE, true);
  const autoDetectScope = configManager.getConfig<boolean>(ConfigKeys.AUTO_DETECT_SCOPE, true);

  let repo: any;
  try {
    repo = await getRepo(arg);
  } catch (err: any) {
    vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
    return;
  }

  // 1. Get input text from SCM commit box, or ask user via input box
  let rawText = repo?.inputBox?.value?.trim() || '';

  if (!rawText) {
    const entered = await vscode.window.showInputBox({
      title: isThai ? 'Instant TH → EN Commit Translator' : 'Instant Commit Translator',
      prompt: isThai
        ? 'พิมพ์โน้ตการแก้ไขที่ต้องการแปลงเป็น Conventional Commit ภาษาอังกฤษ'
        : 'Enter your commit notes to translate into English Conventional Commit',
      placeHolder: isThai
        ? 'เช่น แก้บั๊กตอนล็อกอินแล้วค้าง, เพิ่มหน้า checkout กับปุ่ม stripe'
        : 'e.g. fix login freeze on token refresh, add checkout page with stripe',
      ignoreFocusOut: true
    });

    if (!entered || entered.trim() === '') {
      return;
    }
    rawText = entered.trim();
  }

  // 2. Extract branch and scope context
  let branchName: string | undefined;
  let issueTag = '';
  let detectedScope: string | null = null;

  try {
    branchName = await getCurrentBranch(repo);
    if (autoDetectIssue && branchName) {
      issueTag = extractIssueFromBranch(branchName);
    }
    if (autoDetectScope) {
      const stagedFiles = await getStagedFilePaths(repo);
      detectedScope = detectMonorepoScope(stagedFiles);
    }
  } catch {
    // Ignore context error
  }

  return ProgressHandler.withProgress(
    isThai
      ? `AI กำลังแปลและจัดรูปแบบ Conventional Commit ภาษาอังกฤษ (${provider.name})...`
      : `Translating and formatting Conventional Commit (${provider.name})...`,
    async (progress) => {
      try {
        progress.report({ message: 'Translating...' });
        const prompt = getTranslateCommitPrompt(rawText, branchName, detectedScope);
        const raw = await AIService.query(prompt);

        if (!raw) {
          throw new Error('AI returned an empty translation.');
        }

        let translated = raw.trim();
        // Remove accidental markdown backticks
        translated = translated.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();

        // Attach issue tag if available and not already present
        if (issueTag && !translated.startsWith(issueTag)) {
          translated = `${issueTag} ${translated}`;
        }

        if (repo.inputBox) {
          repo.inputBox.value = translated;
        }

        await vscode.commands.executeCommand('workbench.view.scm');

        const successMsg = isThai
          ? `แปลงเป็น Conventional Commit สำเร็จแล้ว:\n"${translated.split('\n')[0]}"`
          : `Translated to Conventional Commit:\n"${translated.split('\n')[0]}"`;

        vscode.window.showInformationMessage(successMsg);
      } catch (err: any) {
        Logger.error('Translate commit message failed:', err);
        vscode.window.showErrorMessage(`CommitCraft Translator: ${err?.message || err}`);
      }
    }
  );
}
