import * as vscode from 'vscode';
import { getRepo, getLatestCommit, gitSafeUndoCommit } from './git-utils';
import { ConfigKeys, ConfigurationManager } from './config';
import { Logger } from './logger';

/**
 * Safely undo the last Git commit without losing any code changes.
 * Restores the previous commit message back into the SCM input box.
 */
export async function safeUndoCommit(arg?: any): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const isThai = configManager.getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'en') === 'th';

  let repo: any;
  try {
    repo = await getRepo(arg);
  } catch (err: any) {
    vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
    return;
  }

  const latest = await getLatestCommit(repo);
  if (!latest) {
    vscode.window.showInformationMessage(
      isThai ? 'ไม่พบ Commit ในคลังเก็บโค้ดนี้ที่จะย้อนกลับ' : 'No commits found to undo.'
    );
    return;
  }

  const shortHash = latest.hash.substring(0, 7);
  const promptTitle = isThai
    ? `ต้องการย้อนกลับ Commit [${shortHash} — ${latest.message}] ใช่หรือไม่?`
    : `Undo commit [${shortHash} — ${latest.message}]?`;

  const optSoft = isThai
    ? 'Soft Undo (ย้อนกลับและคงสถานะ Staged ไว้)'
    : 'Soft Undo (Keep files staged)';
  const optMixed = isThai
    ? 'Mixed Undo (ย้อนกลับและเปลี่ยนเป็น Unstaged)'
    : 'Mixed Undo (Keep files unstaged)';
  const optCancel = isThai ? 'ยกเลิก' : 'Cancel';

  const choice = await vscode.window.showWarningMessage(
    promptTitle,
    { modal: true },
    optSoft,
    optMixed
  );

  if (!choice) {
    return;
  }

  try {
    const mode = choice === optSoft ? 'soft' : 'mixed';
    const result = await gitSafeUndoCommit(repo, mode);

    if (result) {
      // Put previous commit message back into SCM input box for editing
      if (repo.inputBox) {
        repo.inputBox.value = result.message;
      }

      await vscode.commands.executeCommand('workbench.view.scm');

      const successMsg = isThai
        ? `ย้อนกลับ Commit [${shortHash}] สำเร็จแล้ว! โค้ดทั้งหมดของคุณยังอยู่ครบ และข้อความเดิมถูกกู้คืนใส่ในช่อง Commit แล้ว`
        : `Safely undone commit [${shortHash}]. All code modifications are preserved and commit message restored.`;

      vscode.window.showInformationMessage(successMsg);
    }
  } catch (err: any) {
    Logger.error('Safe undo commit failed:', err);
    vscode.window.showErrorMessage(`CommitCraft: ${err?.message || err}`);
  }
}
