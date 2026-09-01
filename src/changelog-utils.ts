import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { AIService } from './ai-service';
import { ConfigKeys, ConfigurationManager } from './config';
import { getCommitsForChangelog, getRepo } from './git-utils';
import { Logger } from './logger';
import { getChangelogPrompt } from './prompts';
import { ProgressHandler } from './utils';

/**
 * Generates and updates CHANGELOG.md based on recent commits following Keep a Changelog standards.
 */
export async function generateChangelog(arg?: any): Promise<void> {
  let repo: any;
  try {
    repo = await getRepo(arg);
  } catch (err: any) {
    vscode.window.showErrorMessage(err?.message || 'No Git repository found.');
    return;
  }

  const rootPath =
    repo?.rootUri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!rootPath) {
    vscode.window.showErrorMessage('No workspace folder found.');
    return;
  }

  // 1. Get commits since last tag
  const { commits, lastTag, error } = await getCommitsForChangelog(repo);
  if (error || !commits || commits.trim() === '') {
    vscode.window.showErrorMessage(`Unable to retrieve commits: ${error || 'No commits found'}`);
    return;
  }

  // 2. Determine default version
  let defaultVersion = '0.1.0';
  const pkgPath = path.join(rootPath, 'package.json');
  if (await fs.pathExists(pkgPath)) {
    try {
      const pkg = await fs.readJson(pkgPath);
      if (pkg.version) {
        defaultVersion = pkg.version;
      }
    } catch {
      // Fallback default
    }
  }

  const versionInput = await vscode.window.showInputBox({
    title: 'CommitCraft: Generate CHANGELOG.md',
    prompt: lastTag
      ? `Generating changelog for changes since ${lastTag}. Enter target version:`
      : 'Enter target version for this release:',
    value: defaultVersion,
    ignoreFocusOut: true,
    placeHolder: 'e.g. 0.1.0 or 1.0.0'
  });

  if (!versionInput || versionInput.trim() === '') {
    return;
  }

  const version = versionInput.trim().replace(/^v/i, '');
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const configManager = ConfigurationManager.getInstance();
  const provider = configManager.getActiveProvider();
  const language = configManager.getConfig<string>(ConfigKeys.AI_COMMIT_LANGUAGE, 'English');

  return ProgressHandler.withProgress(
    `Generating CHANGELOG.md (${provider.name})...`,
    async (progress) => {
      try {
        progress.report({ message: 'Analyzing commit history...' });
        const messages = getChangelogPrompt(commits, version, today, language);
        const rawChangelog = await AIService.query(messages);

        if (!rawChangelog || rawChangelog.trim() === '') {
          throw new Error('AI returned an empty changelog response.');
        }

        // Clean any code block fences if present
        const cleanedEntry = rawChangelog
          .replace(/^```markdown\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();

        const changelogPath = path.join(rootPath, 'CHANGELOG.md');
        let fullContent = '';

        if (await fs.pathExists(changelogPath)) {
          const existing = await fs.readFile(changelogPath, 'utf8');

          // Check if version already exists in changelog
          const versionPattern = new RegExp(`##\\s*\\[?${version}\\]?`, 'i');
          if (versionPattern.test(existing)) {
            // Replace existing section or warn
            const overwrite = await vscode.window.showWarningMessage(
              `Version ${version} already exists in CHANGELOG.md. Update it?`,
              'Update Section',
              'Cancel'
            );
            if (overwrite !== 'Update Section') {
              return;
            }
          }

          // Insert below '# Changelog' header
          const headerMatch = existing.match(/^#\s+Changelog[^\n]*\n+/i);
          if (headerMatch) {
            const headerEnd = headerMatch[0].length;
            fullContent =
              existing.substring(0, headerEnd) +
              `\n${cleanedEntry}\n\n` +
              existing.substring(headerEnd).replace(/^\n+/, '');
          } else {
            fullContent = `# Changelog\n\n${cleanedEntry}\n\n${existing}`;
          }
        } else {
          fullContent = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

${cleanedEntry}
`;
        }

        await fs.writeFile(changelogPath, fullContent, 'utf8');

        // Open CHANGELOG.md in editor
        const doc = await vscode.workspace.openTextDocument(changelogPath);
        await vscode.window.showTextDocument(doc, { preview: false });

        vscode.window.showInformationMessage(
          `CommitCraft: CHANGELOG.md updated for version ${version}!`
        );
      } catch (err: any) {
        Logger.error('Failed to generate CHANGELOG.md:', err);
        vscode.window.showErrorMessage(
          `Failed to generate CHANGELOG.md: ${err?.message || err}`
        );
      }
    }
  );
}
