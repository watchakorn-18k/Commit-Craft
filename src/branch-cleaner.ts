import * as vscode from 'vscode';
import { getRepo, getMergedBranches, deleteLocalBranches } from './git-utils';
import { ConfigKeys, ConfigurationManager } from './config';
import { Logger } from './logger';

/**
 * Scans for local branches that have been merged into main/master and allows 1-click safe cleanup.
 */
export async function cleanGhostBranches(arg?: any): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const isThai = configManager.getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'en') === 'th';

  let repo: any;
  try {
    repo = await getRepo(arg);
  } catch (err: any) {
    vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
    return;
  }

  const mergedBranches = await getMergedBranches(repo);

  if (mergedBranches.length === 0) {
    vscode.window.showInformationMessage(
      isThai
        ? 'ไม่พบ Local Branch ที่ Merge แล้วค้างอยู่ในเครื่อง Workspace สะอาดเรียบร้อย'
        : 'All clean! No merged local branches found in this repository.'
    );
    return;
  }

  const items = mergedBranches.map((b) => ({
    label: `$(git-branch) ${b.name}`,
    description: b.lastCommit ? `Latest: ${b.lastCommit}` : 'Merged',
    picked: true,
    branchName: b.name
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: isThai
      ? `CommitCraft: พบ ${mergedBranches.length} Merged Branch ที่สามารถลบได้`
      : `CommitCraft: Found ${mergedBranches.length} Merged Branches to Clean`,
    placeHolder: isThai
      ? 'เลือก Branch ที่ต้องการลบออกจากเครื่อง (กดเว้นวรรคเพื่อเลือก/ยกเลิก)'
      : 'Select merged branches to delete locally (Space to toggle)',
    canPickMany: true
  });

  if (!selected || selected.length === 0) {
    return;
  }

  const branchNames = selected.map((s) => s.branchName);

  const confirmMsg = isThai
    ? `คุณแน่ใจหรือไม่ว่าต้องการลบ ${branchNames.length} Branch ที่เลือกนี้?\n(${branchNames.join(', ')})`
    : `Are you sure you want to delete ${branchNames.length} selected branch(es)?\n(${branchNames.join(', ')})`;

  const btnDelete = isThai ? 'ยืนยันลบ Branch' : 'Delete Branch(es)';

  // Modal dialog automatically includes Cancel button in VS Code
  const choice = await vscode.window.showWarningMessage(confirmMsg, { modal: true }, btnDelete);
  if (choice !== btnDelete) {
    return;
  }

  const result = await deleteLocalBranches(repo, branchNames);

  if (result.success.length > 0) {
    const successText = isThai
      ? `ลบ Merged Branch สำเร็จ ${result.success.length} branch: ${result.success.join(', ')}`
      : `Successfully deleted ${result.success.length} merged branch(es): ${result.success.join(', ')}`;
    vscode.window.showInformationMessage(successText);
  }

  if (result.failed.length > 0) {
    const failedList = result.failed.map((f) => `${f.branch} (${f.error})`).join(', ');
    vscode.window.showErrorMessage(
      isThai
        ? `ไม่สามารถลบได้บาง branch: ${failedList}`
        : `Failed to delete some branches: ${failedList}`
    );
  }
}
