# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-01

### Added
- **GUI-First Architecture**: Interactive CommitCraft TreeView panel in Source Control and dedicated Activity Bar sidebar.
- **SCM Toolbar Action Hub**: 1-click action buttons positioned directly above the Git commit input box.
- **Multi-Provider AI Support**: Integrated Google Gemini (`gemini-2.5-flash`), GitHub Copilot / VS Code LM, OpenAI, Anthropic Claude, DeepSeek, Ollama, OpenRouter, and Groq.
- **Multiple Commit Candidates**: Generate 3 candidate formats (Conventional, Concise, Detailed) in parallel.
- **Pre-Commit Code Review**: Automated security scan detecting runtime bugs, credential leaks, and console.logs before committing.
- **AI Pull Request Generator**: Automatic Markdown generation from branch commit history.
- **Branch Name Suggester**: Standard Git branch name suggestions based on code diff.
- **AI Auto CHANGELOG Generator**: 1-click changelog generation adhering to Keep a Changelog standards.
- **GitHub Actions Workflow**: Automated publishing to Visual Studio Code Marketplace on tag push.

### Changed
- Rebranded extension to **CommitCraft AI** (`watchakorn-18k.commit-craft-ai`).
- Replaced emoji-heavy outputs with clean, senior-engineer grade technical commit messages by default.
- Modernized build toolchain to Webpack 5, TypeScript 6, and Node 22 LTS.
