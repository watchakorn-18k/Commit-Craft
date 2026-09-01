import * as vscode from 'vscode';
import {
  getRepo,
  gitSyncBranch,
  getIncomingCommits,
  getAllUncommittedDiff,
  gitStashPush,
  gitStashPop
} from './git-utils';
import { resolveMergeConflicts } from './conflict-utils';
import { ConfigKeys, ConfigurationManager } from './config';
import { ProgressHandler } from './utils';
import { Logger } from './logger';

/**
 * Interactive Branch Sync & Rebase Assistant
 * Intelligently syncs the active branch with base branch (main/master) using Rebase or Merge.
 */
export async function smartSyncBranch(arg?: any, targetBaseBranch?: string): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const isThai = configManager.getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'th') === 'th';

  let repo: any;
  try {
    repo = await getRepo(arg);
  } catch (err: any) {
    vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
    return;
  }

  const baseBranch = targetBaseBranch || 'main';

  // Step 1: Prompt user for sync strategy
  const incoming = await getIncomingCommits(repo, baseBranch);
  const incomingCount = incoming.length;

  const choices = [
    {
      label: `$(git-pull-request-go-to-changes) Rebase onto ${baseBranch} (Recommended)`,
      description: isThai ? 'จัดระเบียบ Commit ให้เรียงต่อจาก Base Branch ล่าสุด' : 'Keeps clean linear commit history',
      strategy: 'rebase'
    },
    {
      label: `$(git-merge) Merge ${baseBranch} into current branch`,
      description: isThai ? 'รวมโค้ดแบบสร้าง Merge Commit' : 'Standard 3-way merge commit',
      strategy: 'merge'
    }
  ];

  if (incomingCount > 0) {
    choices.push({
      label: `$(history) Preview ${incomingCount} Incoming Commits`,
      description: isThai ? `ดูประวัติ ${incomingCount} Commit จาก ${baseBranch}` : `Inspect incoming commits from ${baseBranch}`,
      strategy: 'preview'
    });
  }

  const selected = await vscode.window.showQuickPick(choices, {
    title: isThai
      ? `CommitCraft: Sync & Rebase กับ ${baseBranch} (ล้าหลังอยู่ ${incomingCount || 'หลาย'} Commits)`
      : `CommitCraft: Sync & Rebase with ${baseBranch} (${incomingCount} commits behind)`,
    placeHolder: isThai ? 'เลือกรูปแบบการ Sync ที่ต้องการ' : 'Select sync strategy'
  });

  if (!selected) {
    return;
  }

  if (selected.strategy === 'preview') {
    const list = incoming
      .map((c) => `- \`${c.hash}\`: **${c.message}** (${c.author})`)
      .join('\n');
    const doc = await vscode.workspace.openTextDocument({
      content: `# 📥 Incoming Commits from \`${baseBranch}\` (${incomingCount} commits)\n\n${list}\n\n---\n*คุณสามารถกด Sync / Rebase จากเมนูได้ทันที*`,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
    return;
  }

  // Check dirty working directory
  const { diff } = await getAllUncommittedDiff(repo);
  let didAutoStash = false;

  if (diff && diff.trim() !== '') {
    const stashChoice = await vscode.window.showWarningMessage(
      isThai
        ? 'คุณมีไฟล์ที่ยังไม่ได้ Commit ในเครื่อง ต้องการให้ Smart Stash เก็บไว้ก่อน Rebase หรือไม่?'
        : 'You have uncommitted modifications. Smart Stash changes before rebasing?',
      { modal: true },
      isThai ? 'Smart Stash และทำต่อ' : 'Smart Stash and Continue'
    );

    if (!stashChoice) {
      return;
    }

    await gitStashPush(repo, `Auto-stash before sync with ${baseBranch}`, true);
    didAutoStash = true;
  }

  // Execute Rebase or Merge
  const strategyName = selected.strategy === 'rebase' ? 'Rebase' : 'Merge';

  await ProgressHandler.withProgress(
    isThai ? `กำลังดำเนินการ ${strategyName} กับ ${baseBranch}...` : `Executing ${strategyName} onto ${baseBranch}...`,
    async (progress) => {
      try {
        const result = await gitSyncBranch(repo, baseBranch, selected.strategy as 'rebase' | 'merge');

        if (result.success) {
          if (didAutoStash) {
            await gitStashPop(repo).catch(() => null);
          }

          // Trigger dashboard & sidebar refresh
          vscode.commands.executeCommand('commitcraft.openDashboard');

          vscode.window.showInformationMessage(
            isThai
              ? `🎉 ${strategyName} กับ ${baseBranch} สำเร็จเรียบร้อย! Branch เป็นปัจจุบันแล้ว`
              : `🎉 ${strategyName} with ${baseBranch} completed successfully!`
          );
        } else if (result.conflict) {
          const conflictChoice = await vscode.window.showErrorMessage(
            isThai
              ? `⚠️ พบ Merge Conflict ระหว่าง ${strategyName}! ต้องการให้ AI ช่วยวิเคราะห์และรวมโค้ดทันทีหรือไม่?`
              : `⚠️ Conflicts detected during ${strategyName}! Resolve with AI?`,
            isThai ? '🤖 เปิด AI Conflict Resolver' : 'Resolve with AI',
            isThai ? 'จัดการเอง' : 'Manual'
          );

          if (conflictChoice === '🤖 เปิด AI Conflict Resolver' || conflictChoice === 'Resolve with AI') {
            await resolveMergeConflicts();
          }
        } else {
          throw new Error(result.error || 'Unknown sync error');
        }
      } catch (err: any) {
        Logger.error('Sync branch failed:', err);
        vscode.window.showErrorMessage(`Git Sync error: ${err?.message || err}`);
      }
    }
  );
}
