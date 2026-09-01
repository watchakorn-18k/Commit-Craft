import * as vscode from 'vscode';
import { AIService } from './ai-service';
import { ConfigKeys, ConfigurationManager } from './config';
import {
  getAllUncommittedDiff,
  getCurrentBranch,
  getRepo,
  gitStashPush,
  gitStashPop
} from './git-utils';
import { detectMonorepoScope } from './scope-detector';
import { getStashMessagePrompt } from './prompts';
import { ProgressHandler } from './utils';
import { Logger } from './logger';

/**
 * Smart Stash Generator:
 * Analyzes uncommitted code, generates a clean WIP stash message,
 * and allows user to confirm/edit before stashing!
 */
export async function smartStash(arg?: any): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const provider = configManager.getActiveProvider();
  const isThai = configManager.getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'th') === 'th';
  const language = configManager.getConfig<string>(ConfigKeys.AI_COMMIT_LANGUAGE, 'English');

  let repo: any;
  try {
    repo = await getRepo(arg);
  } catch (err: any) {
    vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
    return;
  }

  const { diff, files, error } = await getAllUncommittedDiff(repo);
  if (error || !diff || diff.trim() === '') {
    vscode.window.showInformationMessage(
      isThai ? 'ไม่มีโค้ดที่ถูกแก้ไขให้ Stash ในขณะนี้' : 'No uncommitted changes to stash.'
    );
    return;
  }

  const branchName = await getCurrentBranch(repo);
  const detectedScope = detectMonorepoScope(files);

  await ProgressHandler.withProgress(
    isThai ? `AI กำลังวิเคราะห์โค้ดเพื่อสร้างชื่อ Stash (${provider.name})...` : `Analyzing changes for Smart Stash (${provider.name})...`,
    async (progress) => {
      try {
        progress.report({ message: 'Generating stash message...' });
        const messages = getStashMessagePrompt(diff, branchName, detectedScope, language);
        const raw = await AIService.query(messages);

        let suggestedMessage = raw ? raw.trim().replace(/^["'`]|["'`]$/g, '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim() : '';
        if (!suggestedMessage) {
          suggestedMessage = `WIP${detectedScope ? `(${detectedScope})` : ''}: save progress on ${branchName || 'branch'}`;
        }

        // Show InputBox with the suggested message pre-filled
        const confirmedMessage = await vscode.window.showInputBox({
          title: isThai ? 'Git Smart Stash (บันทึกโค้ดชั่วคราวด้วย AI)' : 'Git Smart Stash (Save WIP with AI)',
          prompt: isThai
            ? 'กด Enter เพื่อบันทึก Stash ทันที หรือแก้ไขข้อความตามต้องการ'
            : 'Press Enter to stash with this message, or edit as needed',
          value: suggestedMessage,
          ignoreFocusOut: true,
          placeHolder: 'Enter stash message...'
        });

        if (confirmedMessage === undefined) {
          // User cancelled
          return;
        }

        const finalMessage = confirmedMessage.trim() || suggestedMessage;

        progress.report({ message: 'Stashing changes...' });
        await gitStashPush(repo, finalMessage, true);

        const popOption = isThai ? 'เรียกคืนโค้ด (Stash Pop)' : 'Stash Pop';
        const choice = await vscode.window.showInformationMessage(
          isThai
            ? `บันทึก Stash เรียบร้อยแล้ว: "${finalMessage}"`
            : `Stash saved successfully: "${finalMessage}"`,
          popOption
        );

        if (choice === popOption || choice === 'Stash Pop') {
          await gitStashPop(repo);
          vscode.window.showInformationMessage(
            isThai ? 'เรียกคืนโค้ดจาก Stash สำเร็จแล้ว!' : 'Stash popped successfully!'
          );
        }
      } catch (err: any) {
        Logger.error('Smart Stash failed:', err);
        vscode.window.showErrorMessage(`Smart Stash failed: ${err?.message || err}`);
      }
    }
  );
}

/**
 * Quick Stash Pop
 */
export async function popStash(arg?: any): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const isThai = configManager.getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'th') === 'th';

  try {
    const repo = await getRepo(arg);
    await gitStashPop(repo);
    vscode.window.showInformationMessage(
      isThai ? 'เรียกคืนโค้ดจาก Stash ล่าสุดสำเร็จแล้ว!' : 'Latest stash popped successfully!'
    );
  } catch (err: any) {
    Logger.error('Stash Pop failed:', err);
    vscode.window.showErrorMessage(`Stash Pop error: ${err?.message || err}`);
  }
}
