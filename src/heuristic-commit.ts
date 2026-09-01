import * as path from 'path';
import { detectMonorepoScope } from './scope-detector';
import { extractIssueFromBranch } from './git-utils';

export interface HeuristicCommitOptions {
  branchName?: string;
  files: string[];
  diff?: string;
  language?: string;
}

/**
 * Generates an intelligent, rule-based Conventional Commit message completely offline
 * without requiring any AI connection or external API calls.
 */
export function generateHeuristicCommitMessage(options: HeuristicCommitOptions): string {
  const { branchName = '', files = [], diff = '', language = 'English' } = options;
  const isThai = language.toLowerCase().includes('thai') || language === 'th';

  if (files.length === 0) {
    return isThai ? 'chore: อัปเดตโค้ดในโปรเจกต์' : 'chore: update project files';
  }

  // 1. Detect Issue / Ticket from branch
  const issueTag = extractIssueFromBranch(branchName);
  const prefixTag = issueTag ? `[${issueTag}] ` : '';

  // 2. Detect Scope from monorepo / folder structure
  const scope = detectMonorepoScope(files);
  const scopeText = scope ? `(${scope})` : '';

  // 3. Determine Commit Type
  const commitType = determineCommitType(files, branchName, diff);

  // 4. Generate Summary Description
  const summary = generateSummaryDescription(commitType, files, isThai);

  // 5. Generate Body Details (bullet points for changed files)
  const body = generateBody(files, isThai);

  const header = `${prefixTag}${commitType}${scopeText}: ${summary}`;

  if (files.length > 1 && body) {
    return `${header}\n\n${body}`;
  }

  return header;
}

function determineCommitType(files: string[], branchName: string, diff: string): string {
  const lowerBranch = branchName.toLowerCase();

  // Branch name indicators
  if (lowerBranch.startsWith('fix/') || lowerBranch.includes('bug') || lowerBranch.includes('hotfix') || lowerBranch.includes('patch')) {
    return 'fix';
  }
  if (lowerBranch.startsWith('feat/') || lowerBranch.startsWith('feature/')) {
    return 'feat';
  }

  // File extension and pattern checks
  const allDocs = files.every((f) => /\.(md|txt|adoc|rst)$/i.test(f) || f.startsWith('docs/'));
  if (allDocs) {
    return 'docs';
  }

  const allTests = files.every((f) => /(\.test\.|\.spec\.|_test\.|__tests__|test\/)/i.test(f));
  if (allTests) {
    return 'test';
  }

  const allStyles = files.every((f) => /\.(css|scss|sass|less|styl)$/i.test(f));
  if (allStyles) {
    return 'style';
  }

  const allCI = files.every((f) => /(\.github\/|\.gitlab-ci|azure-pipelines|\.circleci|Dockerfile|docker-compose)/i.test(f));
  if (allCI) {
    return 'ci';
  }

  const allBuild = files.every((f) =>
    /(package\.json|package-lock|yarn\.lock|pnpm-lock|tsconfig|webpack|vite|go\.mod|Cargo\.toml|build\.gradle|pom\.xml|pubspec\.yaml)/i.test(f)
  );
  if (allBuild) {
    return 'build';
  }

  // Diff inspection
  if (/fix|resolve|bug|error|null|undefined|overflow|crash/i.test(diff)) {
    return 'fix';
  }

  return 'refactor';
}

function generateSummaryDescription(type: string, files: string[], isThai: boolean): string {
  const firstFile = files[0];
  const baseName = path.basename(firstFile);
  const fileCount = files.length;

  if (isThai) {
    switch (type) {
      case 'fix':
        return fileCount === 1
          ? `แก้ไขข้อผิดพลาดใน ${baseName}`
          : `แก้ไขข้อผิดพลาดในการทำงาน (${fileCount} ไฟล์)`;
      case 'feat':
        return fileCount === 1
          ? `เพิ่มฟังก์ชันการทำงานใหม่ใน ${baseName}`
          : `เพิ่มฟังก์ชันการทำงานใหม่ (${fileCount} ไฟล์)`;
      case 'docs':
        return fileCount === 1
          ? `อัปเดตเอกสารใน ${baseName}`
          : `อัปเดตเอกสารและคำอธิบายโปรเจกต์`;
      case 'test':
        return fileCount === 1
          ? `เพิ่ม/ปรับปรุงชุดการทดสอบใน ${baseName}`
          : `เพิ่มและปรับปรุง Unit Tests (${fileCount} ไฟล์)`;
      case 'style':
        return `ปรับแต่ง UI และ CSS styling`;
      case 'ci':
        return `ปรับแต่งการตั้งค่า CI/CD Pipeline`;
      case 'build':
        return `อัปเดตการตั้งค่า Build และ Dependencies`;
      case 'refactor':
      default:
        return fileCount === 1
          ? `ปรับปรุงโครงสร้างโค้ดใน ${baseName}`
          : `ปรับปรุงโครงสร้างโค้ดและการทำงาน (${fileCount} ไฟล์)`;
    }
  } else {
    switch (type) {
      case 'fix':
        return fileCount === 1 ? `fix issues in ${baseName}` : `resolve issues across ${fileCount} files`;
      case 'feat':
        return fileCount === 1 ? `implement new features in ${baseName}` : `add new features across ${fileCount} files`;
      case 'docs':
        return fileCount === 1 ? `update documentation in ${baseName}` : `update project documentation`;
      case 'test':
        return fileCount === 1 ? `add and update tests in ${baseName}` : `update test suites (${fileCount} files)`;
      case 'style':
        return `update UI styles and layout`;
      case 'ci':
        return `update CI/CD configuration`;
      case 'build':
        return `update build configuration and dependencies`;
      case 'refactor':
      default:
        return fileCount === 1 ? `refactor logic in ${baseName}` : `refactor code across ${fileCount} files`;
    }
  }
}

function generateBody(files: string[], isThai: boolean): string {
  const maxFiles = 6;
  const displayFiles = files.slice(0, maxFiles);
  const lines = displayFiles.map((f) => `- ${isThai ? 'แก้ไขไฟล์' : 'update'} ${f}`);

  if (files.length > maxFiles) {
    const remaining = files.length - maxFiles;
    lines.push(isThai ? `- และไฟล์อื่นๆ อีก ${remaining} ไฟล์` : `- and ${remaining} other files`);
  }

  return lines.join('\n');
}
