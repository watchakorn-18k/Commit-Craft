import * as vscode from 'vscode';
import { getRepo, getCommitsForChangelog, getGitTags, gitCreateTag } from './git-utils';
import { getReleaseTagPrompt } from './prompts';
import { AIService } from './ai-service';
import { ConfigKeys, ConfigurationManager } from './config';
import { ProgressHandler } from './utils';
import { Logger } from './logger';

/**
 * AI Semantic Version & Release Tag Suggester
 * Analyzes commit history to recommend the next SemVer release tag and notes.
 */
export async function suggestReleaseTag(arg?: any): Promise<void> {
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

  const tags = await getGitTags(repo);
  const currentTag = tags.length > 0 ? tags[0] : 'v0.0.0';

  const commitsData = await getCommitsForChangelog(repo);
  if (!commitsData.commits || commitsData.commits === 'No commits found.') {
    vscode.window.showInformationMessage(
      isThai
        ? 'ไม่พบประวัติ Commit ใหม่หลังจาก Tag ล่าสุด'
        : 'No new commits found since the latest release tag.'
    );
    return;
  }

  return ProgressHandler.withProgress(
    isThai
      ? `AI กำลังวิเคราะห์ประวัติ Commit เพื่อแนะนำเลข Version Release (${provider.name})...`
      : `Analyzing commits to recommend SemVer release tag (${provider.name})...`,
    async (progress) => {
      try {
        progress.report({ message: 'Calculating SemVer bump...' });
        const prompt = getReleaseTagPrompt(currentTag, commitsData.commits, language);
        const raw = await AIService.query(prompt);

        let result: {
          recommendedTag?: string;
          bumpType?: string;
          reason?: string;
          highlights?: string[];
        } = {};

        try {
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
          }
        } catch {
          // Fallback
        }

        const nextTag = result.recommendedTag || 'v0.1.0';
        const bumpType = result.bumpType || 'minor';
        const reason = result.reason || 'New changes added';
        const highlights = result.highlights || [];

        const highlightsText = highlights.length > 0
          ? `\n\n📌 ไฮไลท์:\n${highlights.map((h) => `• ${h}`).join('\n')}`
          : '';

        const infoMsg = isThai
          ? `🏷️ Tag ปัจจุบัน: ${currentTag}\n🚀 AI แนะนำ: ${nextTag} (${bumpType.toUpperCase()} Bump)\n💡 เหตุผล: ${reason}${highlightsText}`
          : `Current Tag: ${currentTag}\nRecommended: ${nextTag} (${bumpType.toUpperCase()} Bump)\nReason: ${reason}`;

        const optCreate = isThai ? `สร้าง Git Tag ${nextTag} ทันที` : `Create Tag ${nextTag}`;
        const optCustom = isThai ? 'กำหนดเลข Tag เอง...' : 'Custom Tag...';
        const optCancel = isThai ? 'ยกเลิก' : 'Cancel';

        const choice = await vscode.window.showInformationMessage(
          infoMsg,
          { modal: true },
          optCreate,
          optCustom
        );

        if (!choice || choice === optCancel) {
          return;
        }

        let finalTag = nextTag;
        if (choice === optCustom) {
          const entered = await vscode.window.showInputBox({
            title: isThai ? 'ระบุชื่อ Git Tag' : 'Enter Git Tag Name',
            value: nextTag,
            prompt: isThai ? 'เช่น v1.0.0, v0.2.0' : 'e.g. v1.0.0, v0.2.0',
            ignoreFocusOut: true
          });
          if (!entered || entered.trim() === '') {
            return;
          }
          finalTag = entered.trim();
        }

        await gitCreateTag(repo, finalTag, reason);

        vscode.window.showInformationMessage(
          isThai
            ? `สร้าง Git Tag [${finalTag}] ในเครื่องสำเร็จแล้ว!`
            : `Git tag [${finalTag}] created successfully!`
        );
      } catch (err: any) {
        Logger.error('Suggest release tag failed:', err);
        vscode.window.showErrorMessage(`CommitCraft Tag Suggester: ${err?.message || err}`);
      }
    }
  );
}
