/**
 * Smart Monorepo & Modular Scope Detector for Conventional Commits
 * Automatically analyzes modified file paths and determines the exact scope.
 */
export function detectMonorepoScope(filePaths: string[]): string | null {
  if (!filePaths || filePaths.length === 0) {
    return null;
  }

  const scopes: string[] = [];

  for (const rawPath of filePaths) {
    const p = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');

    // 1. Monorepo apps / packages / services / modules / libs / plugins
    // e.g. apps/web/src/..., packages/auth/src/..., services/billing/..., modules/user/...
    const monorepoMatch = p.match(/^(?:apps|packages|services|modules|libs|components|features|plugins|projects)\/([^/]+)/i);
    if (monorepoMatch) {
      scopes.push(monorepoMatch[1].toLowerCase());
      continue;
    }

    // 2. Go / backend cmd, internal, and pkg conventions
    // e.g. cmd/server/..., internal/auth/..., pkg/crypto/...
    const goMatch = p.match(/^(?:cmd|internal|pkg)\/([^/]+)/i);
    if (goMatch) {
      scopes.push(goMatch[1].toLowerCase());
      continue;
    }

    // 3. GitHub workflows / CI / Documentation / Config
    if (p.startsWith('.github/') || p.startsWith('.gitlab-ci') || p.startsWith('.circleci/')) {
      scopes.push('ci');
      continue;
    }
    if (p.startsWith('docs/') || p.endsWith('.md')) {
      scopes.push('docs');
      continue;
    }
    if (p.startsWith('scripts/')) {
      scopes.push('scripts');
      continue;
    }

    // 4. Source folder domains
    // e.g. src/auth/..., src/components/..., lib/pages/...
    const srcDomainMatch = p.match(/^(?:src|lib|app)\/([^/]+)/i);
    if (srcDomainMatch) {
      const segment = srcDomainMatch[1].toLowerCase();
      // Skip generic files in root of src like index.ts, main.dart, app.tsx
      if (!segment.includes('.')) {
        scopes.push(segment);
        continue;
      }
    }
  }

  if (scopes.length === 0) {
    return null;
  }

  // Count occurrences
  const countMap: Record<string, number> = {};
  for (const s of scopes) {
    countMap[s] = (countMap[s] || 0) + 1;
  }

  // Find unique scopes
  const uniqueScopes = Object.keys(countMap);
  if (uniqueScopes.length === 1) {
    return uniqueScopes[0];
  }

  // Sort by highest frequency
  uniqueScopes.sort((a, b) => countMap[b] - countMap[a]);

  // If 2 scopes, join with comma (e.g. web,auth)
  if (uniqueScopes.length === 2 && countMap[uniqueScopes[0]] === countMap[uniqueScopes[1]]) {
    return uniqueScopes.join(',');
  }

  // Return the dominant scope
  return uniqueScopes[0];
}
