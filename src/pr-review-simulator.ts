import * as vscode from 'vscode';
import { getRepo, getBranchDiffForPR } from './git-utils';
import { AIService } from './ai-service';
import { ConfigKeys, ConfigurationManager } from './config';
import { ProgressHandler } from './utils';
import { Logger } from './logger';

/**
 * AI Pull Request Pre-Review Simulator
 * Simulates a thorough Senior Staff Engineer / Security Architect code review before opening an actual PR.
 */
export async function simulatePRReview(arg?: any): Promise<void> {
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

  // Step 1: Base branch selection (default main / master)
  const branchData = await getBranchDiffForPR(repo);
  if (branchData.error) {
    vscode.window.showErrorMessage(`Failed to calculate branch diff: ${branchData.error}`);
    return;
  }

  if (!branchData.diff || branchData.diff.trim() === '') {
    vscode.window.showInformationMessage(
      isThai
        ? `Branch "${branchData.currentBranch}" ไม่มีโค้ดที่แตกต่างจาก "${branchData.baseBranch}" ในขณะนี้`
        : `Branch "${branchData.currentBranch}" has no differences from "${branchData.baseBranch}".`
    );
    return;
  }

  await ProgressHandler.withProgress(
    isThai
      ? `Senior AI Architect กำลังตรวจรีวิวโค้ดทั้ง Branch (${provider.name})...`
      : `Senior AI Architect is simulating PR code review (${provider.name})...`,
    async (progress) => {
      try {
        progress.report({ message: 'Analyzing branch diff and commit history...' });

        const commitsList = branchData.commits
          .map((c) => `- \`${c.hash}\`: ${c.message} (${c.author})`)
          .join('\n');

        const filesList = branchData.files.map((f) => `- \`${f}\``).join('\n');

        progress.report({ message: `Generating Senior Code Review with ${provider.name}...` });

        const prompt = `You are a Senior Staff Software Engineer and Principal Security Architect at a top-tier tech company.
You are performing a rigorous, constructive, and comprehensive Pre-Pull Request Code Review.

Pull Request Context:
- Target Base Branch: \`${branchData.baseBranch}\`
- Source Branch: \`${branchData.currentBranch}\`
- Changed Files (${branchData.files.length}):
${filesList || 'No file summary'}

Branch Commits (${branchData.commits.length}):
${commitsList || 'No commits listed'}

Branch Cumulative Code Diff:
\`\`\`diff
${branchData.diff.substring(0, 25000)}
\`\`\`

Review Structure Required:
1. 📋 **Executive Summary**: High-level overview of the architectural changes in 2-3 sentences.
2. 🚨 **Critical Bugs & Edge Cases**:
   - Specific potential runtime errors, null/undefined crashes, state leaks, or boundary flaws.
3. ⚡ **Performance & Scalability**:
   - Computational complexity, memory overhead, redundant operations, or database/network efficiency.
4. 🛡️ **Security & Secrets Check**:
   - Token/credential leak risks, injection points, unsanitized inputs, or authorization gaps.
5. 🏗️ **Architecture & Clean Code**:
   - Adherence to SOLID/DRY principles, readability, naming conventions, and modularity.
6. 🧪 **Test Coverage Recommendations**:
   - List 3-4 specific unit/integration test cases that MUST be covered before merging.
7. 🌟 **Senior Verdict**:
   - Choose one: \`[✅ APPROVED]\`, \`[⚠️ APPROVED WITH SUGGESTIONS]\`, or \`[❌ REQUEST CHANGES]\`
   - Provide a bulleted checklist of actionable improvements before merging.

Respond in ${language}. Use clear GitHub Flavored Markdown with syntax highlights, emojis, and professional tone.`;

        const raw = await AIService.query([
          {
            role: 'system',
            content:
              'You are a Senior Staff Software Engineer and Principal Security Architect performing a meticulous Pre-PR review.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]);

        if (!raw) {
          throw new Error('AI returned an empty review.');
        }

        const header = `# 🧐 Senior AI Pull Request Review Simulator\n\n> **PR Target**: \`${branchData.baseBranch}\` ⟵ \`${branchData.currentBranch}\`\n> **Modified Files**: ${branchData.files.length} files • **Commits**: ${branchData.commits.length} commits\n\n---\n\n`;

        const doc = await vscode.workspace.openTextDocument({
          content: header + raw,
          language: 'markdown'
        });

        await vscode.window.showTextDocument(doc, {
          preview: true,
          viewColumn: vscode.ViewColumn.Beside
        });

        vscode.window.showInformationMessage(
          isThai
            ? 'Senior AI Review สำเร็จแล้ว! คุณสามารถอ่านคำแนะนำในหน้าต่างข้างๆ ได้ทันที'
            : 'Senior AI Review completed! See the report in the side panel.'
        );
      } catch (err: any) {
        Logger.error('PR Review Simulator failed:', err);
        vscode.window.showErrorMessage(`PR Review Simulator error: ${err?.message || err}`);
      }
    }
  );
}
