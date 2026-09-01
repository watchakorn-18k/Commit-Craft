import * as vscode from 'vscode';
import { AIService } from './ai-service';
import { ConfigKeys, ConfigurationManager } from './config';
import {
  extractIssueFromBranch,
  getCurrentBranch,
  getDiffStaged,
  getStagedFilePaths,
  getRepo,
  hasUnstagedChanges,
  stageAllChanges
} from './git-utils';
import { detectMonorepoScope } from './scope-detector';
import { getMainCommitPrompt, getMultipleCandidatesPrompt } from './prompts';
import { ProgressHandler } from './utils';
import { Logger } from './logger';

/**
 * Clean up raw AI output into a clean commit message
 */
function cleanCommitMessage(raw: string): string {
  let cleaned = raw;

  // 1. Remove thinking / reasoning tags (DeepSeek R1, OpenAI reasoning, etc.)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Remove markdown code blocks if AI wrapped output in ``` or ```git
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  }

  // 3. Remove leading quotes if wrapped in quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith('\'') && cleaned.endsWith('\''))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned.trim();
}

/**
 * Ensure repo has staged changes, prompting user if necessary
 */
async function prepareDiff(repo: any): Promise<string | null> {
  const configManager = ConfigurationManager.getInstance();
  let diffResult = await getDiffStaged(repo);
  let diff = diffResult.diff;

  if (!diff || diff === 'No changes staged.') {
    const hasChanges = await hasUnstagedChanges(repo);
    if (hasChanges) {
      const autoStage = configManager.getConfig<boolean>(ConfigKeys.AUTO_STAGE, false);
      let shouldStage = autoStage;

      if (!shouldStage) {
        const isThai = configManager.getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'th') === 'th';
        const msg = isThai
          ? 'ไม่พบไฟล์ที่ Stage ไว้ คุณต้องการ Stage ไฟล์ที่แก้ไขทั้งหมดแล้วสร้าง Commit ทันทีหรือไม่?'
          : 'No staged changes found. Would you like to stage all changes and generate a commit message?';
        const optStage = isThai ? 'Stage ทั้งหมด & สร้างข้อความ' : 'Stage All & Generate';
        const optAlways = isThai ? 'Stage อัตโนมัติเสมอ' : 'Always Stage Automatically';
        const optCancel = isThai ? 'ยกเลิก' : 'Cancel';

        const choice = await vscode.window.showInformationMessage(
          msg,
          optStage,
          optAlways,
          optCancel
        );

        if (choice === optAlways || choice === 'Always Stage Automatically') {
          await configManager.updateConfig(ConfigKeys.AUTO_STAGE, true);
          shouldStage = true;
        } else if (choice === optStage || choice === 'Stage All & Generate') {
          shouldStage = true;
        }
      }

      if (shouldStage) {
        await stageAllChanges(repo);
        diffResult = await getDiffStaged(repo);
        diff = diffResult.diff;
      } else {
        return null;
      }
    } else {
      vscode.window.showInformationMessage('No git changes detected in this repository.');
      return null;
    }
  }

  return diff;
}

/**
 * Generates a single commit message and sets it in the SCM input box.
 */
export async function generateCommitMsg(arg?: any): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const provider = configManager.getActiveProvider();

  // Validate API key if required
  const apiKey = await configManager.getEffectiveApiKey(provider.id);
  if (!apiKey && provider.requiresApiKey) {
    const choice = await vscode.window.showWarningMessage(
      `API Key for ${provider.name} is not configured.`,
      'Quick Setup Wizard',
      'Enter API Key',
      'Open Settings'
    );

    if (choice === 'Quick Setup Wizard') {
      await vscode.commands.executeCommand('commitcraft.quickSetup');
    } else if (choice === 'Enter API Key') {
      await vscode.commands.executeCommand('commitcraft.setApiKey', provider.id);
    } else if (choice === 'Open Settings') {
      await vscode.commands.executeCommand('commitcraft.openSettings');
    }
    return;
  }

  let repo: any;
  try {
    repo = await getRepo(arg);
  } catch (err: any) {
    vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
    return;
  }

  const scmInputBox = repo.inputBox;
  if (!scmInputBox) {
    vscode.window.showErrorMessage('Unable to locate the Git SCM input box.');
    return;
  }

  const diff = await prepareDiff(repo);
  if (!diff) {
    return;
  }

  // Check Issue/Ticket auto-detection
  let issueTag: string | null = null;
  const autoDetectIssue = configManager.getConfig<boolean>(ConfigKeys.AUTO_DETECT_ISSUE, true);
  if (autoDetectIssue) {
    const branchName = await getCurrentBranch(repo);
    issueTag = extractIssueFromBranch(branchName);
  }

  // Check Monorepo / Module Scope auto-detection
  let detectedScope: string | null = null;
  const autoDetectScope = configManager.getConfig<boolean>(ConfigKeys.AUTO_DETECT_SCOPE, true);
  if (autoDetectScope) {
    const stagedPaths = await getStagedFilePaths(repo);
    detectedScope = detectMonorepoScope(stagedPaths);
    if (detectedScope) {
      Logger.info(`Monorepo Scope detected: ${detectedScope}`);
    }
  }

  const additionalContext = scmInputBox.value.trim();

  return ProgressHandler.withProgress(
    `Generating commit message (${provider.name})...`,
    async (progress) => {
      try {
        progress.report({ message: 'Analyzing git diff...' });

        const sysPrompt = await getMainCommitPrompt({ issueTag, detectedScope });
        const messages = [...sysPrompt];

        if (additionalContext) {
          messages.push({
            role: 'user',
            content: `User note / context:\n${additionalContext}`
          });
        }

        messages.push({
          role: 'user',
          content: `Git Diff to analyze:\n\n${diff}`
        });

        progress.report({ message: `Generating commit with ${provider.name}...` });
        const raw = await AIService.query(messages);

        if (raw) {
          const finalMsg = cleanCommitMessage(raw);
          scmInputBox.value = finalMsg;
          Logger.info('Generated commit message:\n', finalMsg);
          // Automatically switch to Source Control tab in VS Code
          await vscode.commands.executeCommand('workbench.view.scm');
        } else {
          throw new Error('AI returned an empty response.');
        }
      } catch (err: any) {
        Logger.error(`${provider.name} request failed:`, err);
        const errorMsg = err?.message || String(err);

        const retryChoice = await vscode.window.showErrorMessage(
          `CommitCraft failed: ${errorMsg}`,
          'Retry',
          'Quick Setup',
          'Settings'
        );

        if (retryChoice === 'Retry') {
          return generateCommitMsg(arg);
        } else if (retryChoice === 'Quick Setup') {
          await vscode.commands.executeCommand('commitcraft.quickSetup');
        } else if (retryChoice === 'Settings') {
          await vscode.commands.executeCommand('commitcraft.openSettings');
        }
      }
    }
  );
}

/**
 * Generates 3 candidate commit messages and lets user pick their preferred style.
 */
export async function generateMultipleCandidates(arg?: any): Promise<void> {
  const configManager = ConfigurationManager.getInstance();
  const provider = configManager.getActiveProvider();

  let repo: any;
  try {
    repo = await getRepo(arg);
  } catch (err: any) {
    vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
    return;
  }

  const scmInputBox = repo.inputBox;
  if (!scmInputBox) {
    vscode.window.showErrorMessage('Unable to locate the Git SCM input box.');
    return;
  }

  const diff = await prepareDiff(repo);
  if (!diff) {
    return;
  }

  let issueTag: string | null = null;
  const autoDetectIssue = configManager.getConfig<boolean>(ConfigKeys.AUTO_DETECT_ISSUE, true);
  if (autoDetectIssue) {
    const branchName = await getCurrentBranch(repo);
    issueTag = extractIssueFromBranch(branchName);
  }

  let detectedScope: string | null = null;
  const autoDetectScope = configManager.getConfig<boolean>(ConfigKeys.AUTO_DETECT_SCOPE, true);
  if (autoDetectScope) {
    const stagedPaths = await getStagedFilePaths(repo);
    detectedScope = detectMonorepoScope(stagedPaths);
  }

  const language = configManager.getConfig<string>(ConfigKeys.AI_COMMIT_LANGUAGE, 'English');

  return ProgressHandler.withProgress(
    `Generating 3 Commit Candidates (${provider.name})...`,
    async (progress) => {
      try {
        progress.report({ message: 'Generating candidate options...' });
        const messages = getMultipleCandidatesPrompt(diff, {
          language,
          issueTag,
          detectedScope
        });

        const raw = await AIService.query(messages);
        let candidates: Array<{ style: string; message: string }> = [];

        try {
          const jsonMatch = raw.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            candidates = JSON.parse(jsonMatch[0]);
          }
        } catch {
          // Fallback parsing
        }

        if (candidates.length === 0) {
          const fallback = cleanCommitMessage(raw);
          scmInputBox.value = fallback;
          await vscode.commands.executeCommand('workbench.view.scm');
          return;
        }

        const items = candidates.map((c) => {
          const firstLine = c.message.split('\n')[0];
          return {
            label: c.style,
            description: firstLine,
            detail: c.message,
            fullMessage: cleanCommitMessage(c.message)
          };
        });

        const selected = await vscode.window.showQuickPick(items, {
          title: 'Choose Commit Message Candidate',
          placeHolder: 'Select a candidate to populate into Git commit box',
          matchOnDetail: true
        });

        if (selected) {
          scmInputBox.value = selected.fullMessage;
          await vscode.commands.executeCommand('workbench.view.scm');
        }
      } catch (err: any) {
        Logger.error('Generate multiple candidates failed:', err);
        vscode.window.showErrorMessage(`Failed to generate candidates: ${err?.message || err}`);
      }
    }
  );
}
