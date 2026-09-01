# CommitCraft

CommitCraft 是专为 VS Code 打造的现代化智能 Git 辅助插件。基于 Google Gemini、GitHub Copilot / VS Code LM、OpenAI、Claude、DeepSeek、Ollama、OpenRouter 及 Groq，根据暂存区代码自动生成规范的 Conventional Commits 提交信息、执行代码审查、起草 Pull Request 说明并推荐分支名称。

---

## 主要特性

- **标准 Conventional Commits**: 生成规范清晰的提交信息 (`feat(scope): ...`)，告别 AI 模板套话与多余装饰。
- **多样式候选推荐**: 一键生成 3 种不同风格（常规 Conventional、单行精简 Concise、详细解析 Detailed）供预览和选用。
- **代码提交前审查 (Pre-Commit Review)**: 智能审计 Staged 变更中的潜在 Bug、密钥泄露、遗留调试代码 (`console.log`, `debugger`) 与性能缺陷。
- **Pull Request 描述生成**: 自动对比分支差异与提交记录，生成清晰完整的 PR Markdown 文档。
- **分支命名推荐**: 根据代码变更智能提供标准 Git 分支命名建议。
- **Ticket / Issue 编号自动识别**: 自动解析当前分支名中的 Jira/GitHub Issue 编号并注入提交信息。
- **原生 Copilot 免 Key 支持**: 无缝对接 VS Code Language Model API，无需额外配置第三方 API Key。

---

## 快速上手

### 1. 快速配置向导
按 `Ctrl+Shift+P` / `Cmd+Shift+P` 打开命令面板并运行：
> **`CommitCraft: Quick Setup Wizard`**

### 2. 生成提交信息
- 点击源码管理 (SCM) 顶栏的 **CommitCraft** 图标按钮。
- 点击 VS Code 底部状态栏的 **CommitCraft** 按钮。
- 快捷键：**`Cmd + Alt + C`** (macOS) / **`Ctrl + Alt + C`** (Windows/Linux)。

---

## 配置说明

支持在 VS Code 设置界面 (Settings UI) 或 `settings.json` 中配置：

```json
{
  "commitcraft.AI_PROVIDER": "gemini",
  "commitcraft.GEMINI_API_KEY": "your-api-key",
  "commitcraft.GEMINI_MODEL": "gemini-2.5-flash",
  "commitcraft.AI_COMMIT_LANGUAGE": "Simplified Chinese",
  "commitcraft.COMMIT_STYLE": "conventional",
  "commitcraft.EMOJI_ENABLED": false,
  "commitcraft.AUTO_STAGE": false,
  "commitcraft.AUTO_DETECT_ISSUE": true
}
```

---

## 开源协议

MIT License
