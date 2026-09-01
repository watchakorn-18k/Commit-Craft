import * as vscode from 'vscode';
import {
  getRepo,
  getGitTags,
  getRecentCommits,
  getCommitDetails,
  gitBisectStart,
  gitBisectStep,
  gitBisectReset
} from './git-utils';
import { AIService } from './ai-service';
import { ConfigKeys, ConfigurationManager } from './config';
import { ProgressHandler } from './utils';
import { Logger } from './logger';

/**
 * AI Git Bisect Bug Tracker Assistant
 * Guides developers step-by-step to pinpoint the exact commit and author that introduced a bug.
 */
export async function runGitBisectAssistant(arg?: any): Promise<void> {
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

  // Step 1: Bug symptom description
  const bugDescription = await vscode.window.showInputBox({
    title: isThai ? 'CommitCraft: AI Git Bisect Bug Tracker (1/3)' : 'CommitCraft: AI Git Bisect (1/3)',
    prompt: isThai ? 'อธิบายอาการบั๊กที่ต้องการตามล่า (เช่น API Login พัง, ปุ่มกดไม่ติด)' : 'Describe the bug you are hunting (e.g. Login endpoint returns 500 error)',
    placeHolder: isThai ? 'เช่น จังหวะ Login แล้วขึ้น error 500...' : 'e.g. Login button unresponsive after auth refactor...',
    ignoreFocusOut: true
  });

  if (!bugDescription || bugDescription.trim() === '') {
    return;
  }

  // Step 2: Choose Good Commit / Tag (Where code was known to work)
  const tags = await getGitTags(repo);
  const recentCommits = await getRecentCommits(repo, 30);

  const goodOptions = [
    ...tags.map((t) => ({ label: `$(tag) Tag: ${t}`, description: 'Release tag (known working)', hash: t })),
    ...recentCommits.map((c) => ({
      label: `$(git-commit) ${c.hash.substring(0, 7)} — ${c.message}`,
      description: `${c.author_name} (${c.date.split('T')[0]})`,
      hash: c.hash
    })),
    { label: '$(edit) Enter commit hash manually...', description: 'Type custom SHA hash', hash: 'CUSTOM' }
  ];

  const selectedGood = await vscode.window.showQuickPick(goodOptions, {
    title: isThai ? 'CommitCraft: เลือกจุดที่โค้ดยังทำงานปกติ (Good Commit/Tag) (2/3)' : 'CommitCraft: Select Known Good Commit/Tag (2/3)',
    placeHolder: isThai ? 'เลือก Tag หรือ Commit ที่มั่นใจว่ายังไม่พบบั๊ก' : 'Pick a tag or commit where the bug did not exist'
  });

  if (!selectedGood) {
    return;
  }

  let goodCommit = selectedGood.hash;
  if (selectedGood.hash === 'CUSTOM') {
    const customHash = await vscode.window.showInputBox({
      title: isThai ? 'กรอก Commit Hash ที่โค้ดปกติดี' : 'Enter Good Commit Hash',
      prompt: 'Enter commit hash or tag name',
      ignoreFocusOut: true
    });
    if (!customHash) {
      return;
    }
    goodCommit = customHash.trim();
  }

  // Step 3: Bad Commit (Default HEAD)
  const badCommit = 'HEAD';

  // Start bisect session
  try {
    await ProgressHandler.withProgress(
      isThai ? 'กำลังเริ่ม Git Bisect...' : 'Initializing Git Bisect session...',
      async () => {
        await gitBisectStart(repo, badCommit, goodCommit);
      }
    );
  } catch (err: any) {
    vscode.window.showErrorMessage(`Git Bisect Start Failed: ${err?.message || err}`);
    return;
  }

  // Interactive Bisect Loop
  let isFinished = false;
  let stepNumber = 1;

  while (!isFinished) {
    const activeCommits = await getRecentCommits(repo, 1);
    const currentTestCommit = activeCommits[0];

    if (!currentTestCommit) {
      break;
    }

    let aiAnalysis = '';
    await ProgressHandler.withProgress(
      isThai
        ? `[สเต็ป ${stepNumber}] AI กำลังวิเคราะห์ Diff ของ Commit ${currentTestCommit.hash.substring(0, 7)} (${provider.name})...`
        : `[Step ${stepNumber}] AI analyzing diff for commit ${currentTestCommit.hash.substring(0, 7)} (${provider.name})...`,
      async (progress) => {
        try {
          const details = await getCommitDetails(repo, currentTestCommit.hash);
          const prompt = `You are an expert Git software debugger. The developer is hunting this bug: "${bugDescription}".
The current checkout commit being tested in git bisect is:
- Commit Hash: ${currentTestCommit.hash}
- Author: ${currentTestCommit.author_name}
- Message: ${currentTestCommit.message}

Diff of this commit:
\`\`\`diff
${details.diff ? details.diff.substring(0, 10000) : 'No diff'}
\`\`\`

Task:
1. Explain concisely in 2-3 bullet points what this commit modified.
2. Give a probability rating (High / Medium / Low) on whether this commit could have introduced the reported bug, and why.
Respond in ${language}.`;

          aiAnalysis = await AIService.query([
            { role: 'system', content: 'You are an expert Git software debugger.' },
            { role: 'user', content: prompt }
          ]);
        } catch {
          aiAnalysis = isThai ? 'ไม่สามารถวิเคราะห์ Diff ด้วย AI ได้ในขณะนี้' : 'AI analysis unavailable.';
        }
      }
    );

    const choices = [
      {
        label: '$(check) Good — โค้ดยังปกติ (ไม่พบบั๊กในจุดนี้)',
        description: isThai ? 'บั๊กเกิดขึ้นหลังจุดนี้' : 'Bug not present here',
        action: 'good'
      },
      {
        label: '$(error) Bad — พบบั๊กแล้ว (บั๊กเกิดขึ้นในจุดนี้)',
        description: isThai ? 'บั๊กเริ่มตั้งแต่จุดนี้หรือก่อนหน้า' : 'Bug is present here',
        action: 'bad'
      },
      {
        label: '$(info) AI Analysis — อ่านบทวิเคราะห์ AI อย่างละเอียด',
        description: isThai ? 'ดูเหตุผลและความน่าจะเป็น' : 'Read full AI assessment',
        action: 'ai_view'
      },
      {
        label: '$(close) Abort — ยกเลิก Git Bisect และ Reset กลับ',
        description: isThai ? 'ยกเลิกการค้นหา' : 'Abort and reset to HEAD',
        action: 'abort'
      }
    ];

    const pick = await vscode.window.showQuickPick(choices, {
      title: isThai
        ? `🔍 Bisect สเต็ป ${stepNumber}: กำลังทดสอบ [${currentTestCommit.hash.substring(0, 7)}] — ${currentTestCommit.message}`
        : `🔍 Bisect Step ${stepNumber}: Testing [${currentTestCommit.hash.substring(0, 7)}] — ${currentTestCommit.message}`,
      placeHolder: isThai
        ? `ทดสอบรันแอปดูว่าพบบั๊กไหม? (ผู้เขียน: ${currentTestCommit.author_name})`
        : `Test your app: Is the bug present? (Author: ${currentTestCommit.author_name})`,
      ignoreFocusOut: true
    });

    if (!pick || pick.action === 'abort') {
      await gitBisectReset(repo);
      vscode.window.showInformationMessage(
        isThai ? 'ยกเลิก Git Bisect เรียบร้อยแล้ว (Reset กลับจุดเดิม)' : 'Git Bisect aborted and reset.'
      );
      return;
    }

    if (pick.action === 'ai_view') {
      const doc = await vscode.workspace.openTextDocument({
        content: `# 🔍 AI Bisect Analysis: Commit ${currentTestCommit.hash.substring(0, 7)}\n\n**Author**: ${currentTestCommit.author_name}\n**Message**: ${currentTestCommit.message}\n**Bug Target**: ${bugDescription}\n\n---\n\n${aiAnalysis}`,
        language: 'markdown'
      });
      await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
      continue;
    }

    // Step good or bad
    try {
      const output = await gitBisectStep(repo, pick.action as 'good' | 'bad');
      stepNumber++;

      if (output.includes('is the first bad commit') || output.includes('first bad commit')) {
        isFinished = true;
        // Bisect finished! Find culprit
        const culpritHashMatch = output.match(/([a-f0-9]{40})/);
        const culpritHash = culpritHashMatch ? culpritHashMatch[1] : currentTestCommit.hash;
        const culpritDetails = await getCommitDetails(repo, culpritHash);

        const summaryDoc = `# 🎯 BINGO! พบต้นเหตุของบั๊กแล้ว (Culprit Commit Found)

- **Commit**: \`${culpritHash.substring(0, 7)}\`
- **ผู้เขียน (Author)**: **${culpritDetails.author}**
- **วันที่ (Date)**: ${culpritDetails.date}
- **ข้อความ Commit**: \`${culpritDetails.message}\`
- **อาการบั๊กที่ตามล่า**: *"${bugDescription}"*

---

### 🤖 AI Root Cause Analysis:
${aiAnalysis}

---
*Git Bisect ทำงานเสร็จสมบูรณ์ ระบบได้ Reset Workspace กลับมาที่ Branch เดิมให้เรียบร้อยแล้ว*`;

        await gitBisectReset(repo);

        const doc = await vscode.workspace.openTextDocument({
          content: summaryDoc,
          language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });

        vscode.window.showInformationMessage(
          isThai
            ? `🎉 ยอดเยี่ยม! พบ Commit ต้นเหตุของบั๊กแล้ว: [${culpritHash.substring(0, 7)}] โดย ${culpritDetails.author}`
            : `🎉 Found culprit commit: [${culpritHash.substring(0, 7)}] by ${culpritDetails.author}`
        );
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Git Bisect step failed: ${err?.message || err}`);
      await gitBisectReset(repo);
      return;
    }
  }
}
