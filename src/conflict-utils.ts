import * as vscode from 'vscode';
import * as fs from 'fs';
import { getRepo, getConflictedFiles } from './git-utils';
import { getMergeConflictPrompt } from './prompts';
import { AIService } from './ai-service';
import { ConfigKeys, ConfigurationManager } from './config';
import { ProgressHandler } from './utils';
import { Logger } from './logger';

/**
 * AI Merge Conflict Resolver
 * Automatically detects and resolves Git merge conflicts in active file or workspace.
 */
export async function resolveMergeConflicts(arg?: any): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const provider = configManager.getActiveProvider();
  const isThai = configManager.getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'th') === 'th';
  const language = configManager.getConfig<string>(ConfigKeys.AI_COMMIT_LANGUAGE, 'Thai');

  let repo: any;
  try {
    repo = await getRepo(arg);
  } catch (err: any) {
    vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
    return;
  }

  // 1. Identify target file
  let targetFilePath: string | null = null;
  const activeEditor = vscode.window.activeTextEditor;

  if (activeEditor && activeEditor.document.getText().includes('<<<<<<<')) {
    targetFilePath = activeEditor.document.uri.fsPath;
  } else {
    // Check repository for conflicted files
    const conflictedFiles = await getConflictedFiles(repo);
    if (conflictedFiles.length === 0) {
      vscode.window.showInformationMessage(
        isThai
          ? 'ไม่พบไฟล์ที่มี Merge Conflict ในโปรเจกต์นี้'
          : 'No Git merge conflicts found in this repository.'
      );
      return;
    }

    if (conflictedFiles.length === 1) {
      const rootPath = repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
      targetFilePath = vscode.Uri.joinPath(vscode.Uri.file(rootPath), conflictedFiles[0]).fsPath;
    } else {
      const selected = await vscode.window.showQuickPick(
        conflictedFiles.map((f) => ({
          label: `$(git-pull-request-go-to-changes) ${f}`,
          filePath: f
        })),
        {
          title: isThai ? 'เลือกไฟล์ที่มี Conflict ที่ต้องการให้ AI ช่วยแก้' : 'Select a conflicted file to resolve with AI',
          placeHolder: isThai ? 'เลือกไฟล์จากรายการ' : 'Pick a file'
        }
      );

      if (!selected) {
        return;
      }

      const rootPath = repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath;
      targetFilePath = vscode.Uri.joinPath(vscode.Uri.file(rootPath), selected.filePath).fsPath;
    }
  }

  if (!targetFilePath || !fs.existsSync(targetFilePath)) {
    vscode.window.showErrorMessage('Target conflicted file not found.');
    return;
  }

  const document = await vscode.workspace.openTextDocument(targetFilePath);
  const editor = await vscode.window.showTextDocument(document);
  const fileContent = document.getText();

  // 2. Find conflict markers regex: <<<<<<< ... ======= ... >>>>>>>
  const conflictRegex = /<<<<<<<[^\n]*\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>>[^\n]*/g;
  const conflicts = Array.from(fileContent.matchAll(conflictRegex));

  if (conflicts.length === 0) {
    vscode.window.showInformationMessage(
      isThai
        ? 'ไม่พบจุด Conflict (<<<<<<<) ในไฟล์ที่เปิดอยู่'
        : 'No conflict markers (<<<<<<<) found in the selected file.'
    );
    return;
  }

  const conflictCount = conflicts.length;
  const confirmMsg = isThai
    ? `พบ ${conflictCount} จุด Conflict ในไฟล์นี้ ต้องการให้ AI (${provider.name}) ช่วยวิเคราะห์และรวมโค้ดให้อัตโนมัติหรือไม่?`
    : `Found ${conflictCount} conflict block(s) in this file. Resolve them using AI (${provider.name})?`;

  const btnResolve = isThai ? 'แก้ Conflict ทั้งหมดด้วย AI' : 'Resolve All with AI';
  const choice = await vscode.window.showInformationMessage(confirmMsg, btnResolve, isThai ? 'ยกเลิก' : 'Cancel');

  if (choice !== btnResolve) {
    return;
  }

  return ProgressHandler.withProgress(
    isThai ? `AI กำลังวิเคราะห์และแก้ Merge Conflict (${conflictCount} จุด)...` : `Resolving ${conflictCount} merge conflicts with ${provider.name}...`,
    async (progress) => {
      try {
        let updatedContent = fileContent;
        let resolvedCount = 0;

        for (let i = 0; i < conflicts.length; i++) {
          const match = conflicts[i];
          const fullConflictBlock = match[0];
          progress.report({ message: `Resolving conflict ${i + 1} of ${conflictCount}...` });

          const prompt = getMergeConflictPrompt(targetFilePath, fullConflictBlock, language);
          const raw = await AIService.query(prompt);

          if (raw) {
            let cleanResolution = raw.trim();
            // Strip markdown fences if AI accidentally wrapped
            cleanResolution = cleanResolution.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
            updatedContent = updatedContent.replace(fullConflictBlock, cleanResolution);
            resolvedCount++;
          }
        }

        // Apply edits to document
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(fileContent.length)
        );

        await editor.edit((editBuilder) => {
          editBuilder.replace(fullRange, updatedContent);
        });

        vscode.window.showInformationMessage(
          isThai
            ? `AI แก้ไข Merge Conflict สำเร็จแล้ว (${resolvedCount}/${conflictCount} จุด)! กรุณาตรวจสอบโค้ดก่อนบันทึก`
            : `Successfully resolved ${resolvedCount}/${conflictCount} conflict block(s) with AI! Please review before saving.`
        );
      } catch (err: any) {
        Logger.error('Merge conflict resolution failed:', err);
        vscode.window.showErrorMessage(`CommitCraft Conflict Resolver: ${err?.message || err}`);
      }
    }
  );
}
