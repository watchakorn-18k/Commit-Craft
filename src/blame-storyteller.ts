import * as vscode from 'vscode';
import { getRepo, getGitBlameForLine } from './git-utils';
import { AIService } from './ai-service';
import { ConfigKeys, ConfigurationManager } from './config';
import { ProgressHandler } from './utils';
import { Logger } from './logger';

/**
 * AI Git Blame & Line Storyteller
 * Analyzes Git history and commit context to narrate why a specific line of code was created and how its logic works.
 */
export async function tellLineStory(arg?: any): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const provider = configManager.getActiveProvider();
  const isThai = configManager.getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'en') === 'th';
  const language = configManager.getConfig<string>(ConfigKeys.AI_COMMIT_LANGUAGE, 'English');

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage(
      isThai ? 'กรุณาเปิดไฟล์และวางเคอร์เซอร์ที่บรรทัดที่ต้องการเล่าประวัติ' : 'Please open a file and place cursor on the line to analyze.'
    );
    return;
  }

  const document = editor.document;
  if (document.isUntitled) {
    vscode.window.showInformationMessage(
      isThai ? 'ไฟล์นี้ยังไม่ได้ถูกบันทึกใน Git' : 'This untitled file is not in Git.'
    );
    return;
  }

  const filePath = document.uri.fsPath;
  const lineIndex = editor.selection.active.line;
  const lineNumber = lineIndex + 1;
  const selectedText = document.lineAt(lineIndex).text.trim();

  let repo: any;
  try {
    repo = await getRepo(arg);
  } catch (err: any) {
    vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
    return;
  }

  await ProgressHandler.withProgress(
    isThai
      ? `AI กำลังอ่านประวัติ Git Blame บรรทัดที่ ${lineNumber} (${provider.name})...`
      : `AI reading Git Blame history for line ${lineNumber} (${provider.name})...`,
    async (progress) => {
      try {
        progress.report({ message: 'Fetching Git blame and commit diff...' });
        const blame = await getGitBlameForLine(repo, filePath, lineNumber);

        if (blame.error || !blame.commitHash) {
          throw new Error(blame.error || 'Failed to retrieve Git blame data.');
        }

        if (blame.commitHash.startsWith('0000000')) {
          vscode.window.showInformationMessage(
            isThai
              ? `บรรทัดที่ ${lineNumber} เป็นโค้ดใหม่ที่ยังไม่ได้ถูก Commit ลงใน Git`
              : `Line ${lineNumber} contains uncommitted local changes.`
          );
          return;
        }

        progress.report({ message: `Generating backstory with ${provider.name}...` });

        const prompt = `You are an elite Software Historian and Senior Code Archeologist.
Your mission is to tell the deep, insightful backstory of why a specific line of code was created in this repository.

Target Line Context:
- File: \`${filePath.split('/').pop() || filePath}\` (Line ${lineNumber})
- Code snippet:
\`\`\`
${blame.lineContent || selectedText}
\`\`\`

Historical Commit Metadata:
- Commit Hash: \`${blame.commitHash}\`
- Author: ${blame.author} ${blame.authorEmail ? `<${blame.authorEmail}>` : ''}
- Date: ${blame.authorDate}
- Commit Message: "${blame.summary}"

Commit Diff & Scope:
\`\`\`diff
${blame.commitDiff ? blame.commitDiff.substring(0, 12000) : 'No diff available'}
\`\`\`

Task:
Write a comprehensive, engaging story in Markdown format answering:
1. 🎯 **Context & Motivation**: What problem, bug, or business requirement prompted this commit?
2. 💡 **Why this Logic was Chosen**: Explain why this specific line of code or algorithm was written this way, and what it achieves.
3. 👤 **Author & Timeline Story**: Brief historical narrative of the change author and timeline.
4. 🔍 **System Impact**: How this line coordinates with the rest of the commit and related files.
5. 🛡️ **Modern Perspective & Caution**: Are there any edge cases, potential pitfalls, or modern refactoring suggestions for this line today?

Format the output cleanly in ${language}. Use structured Markdown with emojis, bold headings, and callout boxes.`;

        const raw = await AIService.query([
          {
            role: 'system',
            content: 'You are an elite Software Historian, Senior Git Archeologist, and Code Auditor.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]);

        if (!raw) {
          throw new Error('AI returned an empty story.');
        }

        const fileName = filePath.split('/').pop() || 'file';
        const doc = await vscode.workspace.openTextDocument({
          content: `# 📜 AI Git Storyteller: \`${fileName}\` (Line ${lineNumber})\n\n> **Target Code**: \`${blame.lineContent || selectedText}\`\n> **Commit**: \`${blame.commitHash.substring(0, 7)}\` by **${blame.author}** on ${blame.authorDate}\n> **Message**: "${blame.summary}"\n\n---\n\n${raw}`,
          language: 'markdown'
        });

        await vscode.window.showTextDocument(doc, {
          preview: true,
          viewColumn: vscode.ViewColumn.Beside
        });
      } catch (err: any) {
        Logger.error('AI Line Storyteller failed:', err);
        vscode.window.showErrorMessage(`AI Line Storyteller error: ${err?.message || err}`);
      }
    }
  );
}
