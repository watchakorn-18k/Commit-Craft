import * as vscode from 'vscode';
import {
  ConfigKeys,
  ConfigurationManager,
  PROVIDERS,
  SUPPORTED_LANGUAGES,
  UI_DISPLAY_LANGUAGES,
  COMMIT_STYLES
} from './config';
import { AIService } from './ai-service';
import { Logger } from './logger';

export class SettingsPanel {
  public static currentPanel: SettingsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private configManager = ConfigurationManager.getInstance();

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel._panel.reveal(column);
      SettingsPanel.currentPanel._update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'commitcraftSettings',
      'CommitCraft — Settings',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'images')]
      }
    );

    SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        try {
          switch (message.command) {
            case 'saveSettings': {
              const {
                providerId,
                apiKey,
                model,
                baseUrl,
                style,
                commitLanguage,
                displayLanguage,
                autoDetectIssue,
                autoDetectScope,
                autoStage
              } = message.data;

              await this.configManager.updateConfig(ConfigKeys.AI_PROVIDER, providerId);
              await this.configManager.updateConfig(ConfigKeys.COMMIT_STYLE, style);
              await this.configManager.updateConfig(ConfigKeys.AI_COMMIT_LANGUAGE, commitLanguage);
              await this.configManager.updateConfig(ConfigKeys.DISPLAY_LANGUAGE, displayLanguage);
              await this.configManager.updateConfig(ConfigKeys.AUTO_DETECT_ISSUE, autoDetectIssue);
              await this.configManager.updateConfig(ConfigKeys.AUTO_DETECT_SCOPE, autoDetectScope);
              await this.configManager.updateConfig(ConfigKeys.AUTO_STAGE, autoStage);
              // Force emoji to false for clean professional standards
              await this.configManager.updateConfig(ConfigKeys.EMOJI_ENABLED, false);

              const provider = PROVIDERS[providerId];
              if (provider) {
                if (model) {
                  await this.configManager.updateConfig(provider.configModel, model);
                }
                if (apiKey !== undefined && provider.requiresApiKey) {
                  await this.configManager.setSecretApiKey(providerId, apiKey.trim());
                  if (provider.configApiKey) {
                    await this.configManager.updateConfig(provider.configApiKey, apiKey.trim());
                  }
                }
                if (baseUrl !== undefined && provider.configBaseUrl) {
                  await this.configManager.updateConfig(provider.configBaseUrl, baseUrl.trim());
                }
              }

              const msg = displayLanguage === 'th' ? 'บันทึกการตั้งค่า CommitCraft สำเร็จแล้ว!' : 'CommitCraft settings saved successfully!';
              vscode.window.showInformationMessage(msg);
              this._update();
              break;
            }

            case 'testConnection': {
              const { providerId } = message.data;
              const provider = PROVIDERS[providerId];
              if (!provider) {
                this._panel.webview.postMessage({
                  command: 'testResult',
                  success: false,
                  message: 'Unknown provider'
                });
                return;
              }

              try {
                this._panel.webview.postMessage({
                  command: 'testResult',
                  loading: true,
                  message: `Testing connection to ${provider.name}...`
                });

                const testPrompt = [
                  { role: 'system', content: 'Respond with exactly "OK"' },
                  { role: 'user', content: 'Ping' }
                ];
                await AIService.query(testPrompt);

                this._panel.webview.postMessage({
                  command: 'testResult',
                  success: true,
                  message: `Connection to ${provider.name} succeeded!`
                });
              } catch (err: any) {
                this._panel.webview.postMessage({
                  command: 'testResult',
                  success: false,
                  message: `Connection failed: ${err?.message || err}`
                });
              }
              break;
            }
          }
        } catch (err: any) {
          Logger.error('Settings webview error:', err);
          vscode.window.showErrorMessage(`Failed to update settings: ${err?.message || err}`);
        }
      },
      null,
      this._disposables
    );
  }

  private async _update() {
    this._panel.title = 'CommitCraft — Settings';
    this._panel.webview.html = await this._getHtmlForWebview();
  }

  private async _getHtmlForWebview(): Promise<string> {
    const activeProvider = this.configManager.getActiveProvider();
    const providersList = Object.values(PROVIDERS);
    const commitStyles = COMMIT_STYLES;
    const languages = SUPPORTED_LANGUAGES;
    const uiLanguages = UI_DISPLAY_LANGUAGES;

    const currentStyle = this.configManager.getConfig<string>(ConfigKeys.COMMIT_STYLE, 'conventional');
    const currentLang = this.configManager.getConfig<string>(ConfigKeys.AI_COMMIT_LANGUAGE, 'Thai');
    const currentDisplayLang = this.configManager.getConfig<string>(ConfigKeys.DISPLAY_LANGUAGE, 'th');
    const autoDetectIssue = this.configManager.getConfig<boolean>(ConfigKeys.AUTO_DETECT_ISSUE, true);
    const autoDetectScope = this.configManager.getConfig<boolean>(ConfigKeys.AUTO_DETECT_SCOPE, true);
    const autoStage = this.configManager.getConfig<boolean>(ConfigKeys.AUTO_STAGE, false);

    // Fetch config and keys for each provider
    const providerDataMap: Record<string, any> = {};
    for (const p of providersList) {
      const apiKey = (await this.configManager.getEffectiveApiKey(p.id)) || '';
      const activeModel = this.configManager.getActiveModel(p.id);
      const baseUrl = p.configBaseUrl ? this.configManager.getConfig<string>(p.configBaseUrl, p.defaultBaseUrl || '') : '';
      providerDataMap[p.id] = {
        id: p.id,
        name: p.name,
        icon: p.icon,
        description: p.description,
        requiresApiKey: p.requiresApiKey,
        apiKey,
        activeModel,
        defaultModel: p.defaultModel,
        presetModels: p.presetModels,
        baseUrl,
        defaultBaseUrl: p.defaultBaseUrl
      };
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CommitCraft Settings</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --card-bg: var(--vscode-sideBar-background);
      --border: var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-hover: var(--vscode-button-hoverBackground);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border, rgba(128, 128, 128, 0.3));
      --focus-border: var(--vscode-focusBorder);
      --badge-bg: var(--vscode-badge-background);
      --badge-fg: var(--vscode-badge-foreground);
    }

    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      padding: 24px 32px;
      margin: 0 auto;
      max-width: 820px;
      line-height: 1.5;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    .header h1 {
      font-size: 20px;
      margin: 0;
      font-weight: 600;
    }

    .header p {
      margin: 4px 0 0 0;
      opacity: 0.8;
      font-size: 12px;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .card-title {
      font-size: 14px;
      font-weight: 600;
      margin-top: 0;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.9;
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-group:last-child {
      margin-bottom: 0;
    }

    label {
      display: block;
      font-weight: 500;
      margin-bottom: 6px;
    }

    .hint {
      font-size: 12px;
      opacity: 0.75;
      margin-top: 4px;
    }

    select, input[type="text"], input[type="password"] {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 10px;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      font-family: inherit;
      font-size: inherit;
      outline: none;
    }

    select:focus, input:focus {
      border-color: var(--focus-border);
    }

    .checkbox-group {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
      margin-bottom: 12px;
    }

    .checkbox-group input {
      margin-top: 3px;
      cursor: pointer;
    }

    .btn-row {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }

    button {
      padding: 9px 18px;
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      border-radius: 4px;
      font-weight: 500;
      cursor: pointer;
      font-size: 13px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    button:hover {
      background: var(--btn-hover);
    }

    button.secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
    }

    button.secondary:hover {
      background: rgba(128, 128, 128, 0.1);
    }

    .status-msg {
      margin-top: 12px;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      display: none;
    }

    .status-msg.success {
      display: block;
      background: rgba(46, 160, 67, 0.15);
      border: 1px solid rgba(46, 160, 67, 0.4);
      color: #3fb950;
    }

    .status-msg.error {
      display: block;
      background: rgba(248, 81, 73, 0.15);
      border: 1px solid rgba(248, 81, 73, 0.4);
      color: #f85149;
    }

    .status-msg.loading {
      display: block;
      background: rgba(88, 166, 255, 0.15);
      border: 1px solid rgba(88, 166, 255, 0.4);
      color: #58a6ff;
    }

    .provider-specific-section {
      border-top: 1px solid var(--border);
      margin-top: 16px;
      padding-top: 16px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 id="titleText">CommitCraft Settings</h1>
      <p id="subtitleText">Clean, Professional Configuration — Showing only fields relevant to your active AI provider.</p>
    </div>
  </div>

  <!-- Card 1: UI & Language -->
  <div class="card">
    <div class="card-title" id="cardLangTitle">Interface & Output Languages</div>

    <div class="form-group">
      <label for="displayLanguageSelect" id="lblDisplayLang">Extension Interface Language (ภาษาเมนู)</label>
      <select id="displayLanguageSelect" onchange="onDisplayLanguageChange()">
        ${uiLanguages
          .map(
            (l) =>
              `<option value="${l.code}" ${l.code === currentDisplayLang ? 'selected' : ''}>${l.label} (${l.description})</option>`
          )
          .join('')}
      </select>
      <div class="hint" id="hintDisplayLang">Select the language used for CommitCraft UI, Settings, and menus.</div>
    </div>

    <div class="form-group">
      <label for="languageSelect" id="lblCommitLang">Commit Message Output Language (ภาษาของข้อความ Commit)</label>
      <select id="languageSelect">
        ${languages
          .map(
            (l) =>
              `<option value="${l.label}" ${l.label === currentLang ? 'selected' : ''}>${l.label} (${l.description})</option>`
          )
          .join('')}
      </select>
      <div class="hint" id="hintCommitLang">AI will generate Conventional Commits, PR descriptions, and Changelogs in this language.</div>
    </div>
  </div>

  <!-- Card 2: Active Provider -->
  <div class="card">
    <div class="card-title" id="cardProviderTitle">Active AI Provider</div>

    <div class="form-group">
      <label for="providerSelect" id="lblProvider">Select AI Provider</label>
      <select id="providerSelect" onchange="onProviderChange()">
        ${providersList
          .map(
            (p) =>
              `<option value="${p.id}" ${p.id === activeProvider.id ? 'selected' : ''}>${p.name} — ${p.description}</option>`
          )
          .join('')}
      </select>
      <div class="hint" id="hintProvider">Selecting a provider dynamically reveals only its required API Key, Base URL, and Model options below.</div>
    </div>

    <div id="dynamicProviderFields" class="provider-specific-section">
      <!-- Dynamically rendered -->
    </div>
  </div>

  <!-- Card 3: Commit Format & Automation -->
  <div class="card">
    <div class="card-title" id="cardFormatTitle">Commit Format & Automation</div>

    <div class="form-group">
      <label for="styleSelect" id="lblStyle">Commit Message Style</label>
      <select id="styleSelect">
        ${commitStyles
          .map(
            (s) =>
              `<option value="${s.id}" ${s.id === currentStyle ? 'selected' : ''}>${s.label} (${s.description})</option>`
          )
          .join('')}
      </select>
    </div>

    <div class="form-group">
      <label class="checkbox-group">
        <input type="checkbox" id="autoDetectScopeCheckbox" ${autoDetectScope ? 'checked' : ''} />
        <div>
          <strong id="lblAutoDetectScope">Monorepo Smart Auto-Scoping</strong>
          <div class="hint" id="hintAutoDetectScope">Automatically detect app/package folders from modified files and set as scope (e.g. apps/web/... &rarr; feat(web): ...)</div>
        </div>
      </label>

      <label class="checkbox-group">
        <input type="checkbox" id="autoDetectIssueCheckbox" ${autoDetectIssue ? 'checked' : ''} />
        <div>
          <strong id="lblAutoDetect">Auto-Detect Jira / GitHub Issue Tickets</strong>
          <div class="hint" id="hintAutoDetect">Automatically extract ticket tags from branch names (e.g. feat/PROJ-123 &rarr; [PROJ-123])</div>
        </div>
      </label>

      <label class="checkbox-group">
        <input type="checkbox" id="autoStageCheckbox" ${autoStage ? 'checked' : ''} />
        <div>
          <strong id="lblAutoStage">Auto-Stage All Files</strong>
          <div class="hint" id="hintAutoStage">Automatically stage all modified files without prompting when generating commit messages</div>
        </div>
      </label>
    </div>
  </div>

  <div class="btn-row">
    <button onclick="saveAllSettings()" id="btnSave">Save Settings</button>
    <button class="secondary" onclick="testCurrentConnection()" id="btnTest">Test Connection</button>
  </div>

  <div id="testStatus" class="status-msg"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const providerData = ${JSON.stringify(providerDataMap)};

    const I18N = {
      en: {
        titleText: 'CommitCraft Settings',
        subtitleText: 'Clean, Professional Configuration — Showing only fields relevant to your active AI provider.',
        cardLangTitle: 'Interface & Output Languages',
        lblDisplayLang: 'Extension Interface Language',
        hintDisplayLang: 'Select the language used for CommitCraft UI, Settings, and menus.',
        lblCommitLang: 'Commit Message Output Language',
        hintCommitLang: 'AI will generate Conventional Commits, PR descriptions, and Changelogs in this language.',
        cardProviderTitle: 'Active AI Provider',
        lblProvider: 'Select AI Provider',
        hintProvider: 'Selecting a provider dynamically reveals only its required API Key, Base URL, and Model options below.',
        cardFormatTitle: 'Commit Format & Automation',
        lblStyle: 'Commit Message Style',
        lblAutoDetectScope: 'Monorepo Smart Auto-Scoping',
        hintAutoDetectScope: 'Automatically detect app/package folders from modified files and set as scope (e.g. apps/web/... &rarr; feat(web): ...)',
        lblAutoDetect: 'Auto-Detect Jira / GitHub Issue Tickets',
        hintAutoDetect: 'Automatically extract ticket tags from branch names (e.g. feat/PROJ-123 &rarr; [PROJ-123])',
        lblAutoStage: 'Auto-Stage All Files',
        hintAutoStage: 'Automatically stage all modified files without prompting when generating commit messages',
        btnSave: 'Save Settings',
        btnTest: 'Test Connection',
        zeroConfig: 'Zero Configuration Required',
        zeroConfigHint: 'Powered directly by your active VS Code Language Model / GitHub Copilot subscription. No external API keys needed.',
        apiKeyHint: 'Saved securely in VS Code SecretStorage and encrypted locally.',
        endpointHint: 'Endpoint URL for local or custom AI host.'
      },
      th: {
        titleText: 'ตั้งค่า CommitCraft AI',
        subtitleText: 'การตั้งค่าแบบมืออาชีพ — แสดงเฉพาะฟิลด์ที่จำเป็นตาม AI Provider ที่คุณเลือกใช้งาน',
        cardLangTitle: 'ภาษาของเมนูและการสร้างข้อความ',
        lblDisplayLang: 'ภาษาของหน้าเมนูและการตั้งค่า (Interface Language)',
        hintDisplayLang: 'เลือกภาษาสำหรับหน้าต่างเมนู การตั้งค่า และปุ่มควบคุมของ CommitCraft',
        lblCommitLang: 'ภาษาของข้อความ Commit / PR / CHANGELOG',
        hintCommitLang: 'AI จะสร้างข้อความ Commit ตามมาตรฐาน Conventional Commits เป็นภาษานี้',
        cardProviderTitle: 'ผู้ให้บริการ AI (AI Provider)',
        lblProvider: 'เลือก AI Provider ที่ต้องการใช้งาน',
        hintProvider: 'เมื่อเลือก Provider ระบบจะแสดงเฉพาะช่องกรอก API Key และเลือกรุ่น Model ของผู้ให้บริการนั้นๆ ทันที',
        cardFormatTitle: 'รูปแบบ Commit และระบบอัตโนมัติ',
        lblStyle: 'รูปแบบของ Commit Message',
        lblAutoDetectScope: 'ตรวจจับ Monorepo & Scope อัตโนมัติ (Smart Auto-Scoping)',
        hintAutoDetectScope: 'วิเคราะห์โฟลเดอร์ของไฟล์ที่ถูกแก้ไข และใส่ Scope ให้ทันที (เช่น apps/web/... &rarr; feat(web): ...)',
        lblAutoDetect: 'ตรวจจับหมายเลข Ticket (Jira / GitHub Issues) อัตโนมัติ',
        hintAutoDetect: 'ดึงชื่อ Ticket จากชื่อ Git Branch มาใส่ข้างหน้าข้อความให้อัตโนมัติ (เช่น feat/PROJ-123 &rarr; [PROJ-123])',
        lblAutoStage: 'Auto-Stage ไฟล์ทั้งหมดอัตโนมัติ',
        hintAutoStage: 'ทำการ stage ไฟล์ที่มีการเปลี่ยนแปลงทั้งหมดให้อัตโนมัติเมื่อกดสร้าง Commit โดยไม่ต้องยืนยันซ้ำ',
        btnSave: 'บันทึกการตั้งค่า',
        btnTest: 'ทดสอบการเชื่อมต่อ (Test Connection)',
        zeroConfig: 'พร้อมใช้งานได้ทันที (Zero Configuration)',
        zeroConfigHint: 'ทำงานร่วมกับ GitHub Copilot / VS Code Language Model ในเครื่องโดยตรง ไม่ต้องกรอก API Key ภายนอก',
        apiKeyHint: 'บันทึกอย่างปลอดภัยใน VS Code SecretStorage เข้ารหัสความปลอดภัยในเครื่องของคุณ',
        endpointHint: 'URL ของ Endpoint สำหรับเชื่อมต่อ Local LLM หรือเซิร์ฟเวอร์ส่วนตัว'
      }
    };

    function applyI18n(lang) {
      const dict = I18N[lang] || I18N.en;
      for (const [key, val] of Object.entries(dict)) {
        const el = document.getElementById(key);
        if (el) {
          el.textContent = val;
        }
      }
    }

    function onDisplayLanguageChange() {
      const lang = document.getElementById('displayLanguageSelect').value;
      applyI18n(lang);
      renderDynamicFields(document.getElementById('providerSelect').value);
    }

    function renderDynamicFields(providerId) {
      const p = providerData[providerId];
      if (!p) return;

      const displayLang = document.getElementById('displayLanguageSelect').value;
      const dict = I18N[displayLang] || I18N.en;
      const container = document.getElementById('dynamicProviderFields');
      let html = '';

      if (p.id === 'copilot') {
        html += \`
          <div class="form-group">
            <label>\${dict.zeroConfig}</label>
            <div class="hint">\${dict.zeroConfigHint}</div>
          </div>
          <div class="form-group">
            <label for="modelInput">Copilot Model Family</label>
            <select id="modelInput">
              \${p.presetModels.map(m => \`<option value="\${m.label}" \${m.label === p.activeModel ? 'selected' : ''}>\${m.label} (\${m.description})</option>\`).join('')}
            </select>
          </div>
        \`;
      } else {
        if (p.requiresApiKey) {
          html += \`
            <div class="form-group">
              <label for="apiKeyInput">\${p.name} API Key</label>
              <input type="password" id="apiKeyInput" value="\${p.apiKey || ''}" placeholder="Enter \${p.name} API key..." />
              <div class="hint">\${dict.apiKeyHint}</div>
            </div>
          \`;
        }

        if (p.configBaseUrl || p.id === 'ollama' || p.id === 'custom') {
          html += \`
            <div class="form-group">
              <label for="baseUrlInput">\${p.name} Base URL</label>
              <input type="text" id="baseUrlInput" value="\${p.baseUrl || p.defaultBaseUrl || ''}" placeholder="\${p.defaultBaseUrl || 'http://localhost:11434/v1'}" />
              <div class="hint">\${dict.endpointHint}</div>
            </div>
          \`;
        }

        html += \`
          <div class="form-group">
            <label for="modelInput">Model</label>
            <select id="modelSelect" onchange="onModelSelectChange()">
              \${p.presetModels.map(m => \`<option value="\${m.label}" \${m.label === p.activeModel ? 'selected' : ''}>\${m.label} (\${m.description})</option>\`).join('')}
              <option value="custom" \${!p.presetModels.some(m => m.label === p.activeModel) ? 'selected' : ''}>Custom Model...</option>
            </select>
            <input type="text" id="modelCustomInput" value="\${p.activeModel || p.defaultModel}" style="margin-top: 6px; display: \${!p.presetModels.some(m => m.label === p.activeModel) ? 'block' : 'none'};" placeholder="Enter custom model identifier..." />
          </div>
        \`;
      }

      container.innerHTML = html;
    }

    function onProviderChange() {
      const providerId = document.getElementById('providerSelect').value;
      renderDynamicFields(providerId);
    }

    function onModelSelectChange() {
      const select = document.getElementById('modelSelect');
      const customInput = document.getElementById('modelCustomInput');
      if (select && customInput) {
        customInput.style.display = select.value === 'custom' ? 'block' : 'none';
      }
    }

    function getFormData() {
      const providerId = document.getElementById('providerSelect').value;
      const apiKeyEl = document.getElementById('apiKeyInput');
      const baseUrlEl = document.getElementById('baseUrlInput');
      const modelSelectEl = document.getElementById('modelSelect');
      const modelCustomEl = document.getElementById('modelCustomInput');

      let model = '';
      if (modelSelectEl) {
        model = modelSelectEl.value === 'custom' ? (modelCustomEl?.value.trim() || '') : modelSelectEl.value;
      } else {
        const modelInput = document.getElementById('modelInput');
        model = modelInput ? modelInput.value : '';
      }

      return {
        providerId,
        apiKey: apiKeyEl ? apiKeyEl.value : '',
        baseUrl: baseUrlEl ? baseUrlEl.value : '',
        model,
        style: document.getElementById('styleSelect').value,
        commitLanguage: document.getElementById('languageSelect').value,
        displayLanguage: document.getElementById('displayLanguageSelect').value,
        autoDetectScope: document.getElementById('autoDetectScopeCheckbox').checked,
        autoDetectIssue: document.getElementById('autoDetectIssueCheckbox').checked,
        autoStage: document.getElementById('autoStageCheckbox').checked
      };
    }

    function saveAllSettings() {
      const data = getFormData();
      vscode.postMessage({
        command: 'saveSettings',
        data
      });
    }

    function testCurrentConnection() {
      const data = getFormData();
      const statusEl = document.getElementById('testStatus');
      statusEl.className = 'status-msg loading';
      statusEl.textContent = 'Testing connection...';
      vscode.postMessage({
        command: 'testConnection',
        data
      });
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.command === 'testResult') {
        const statusEl = document.getElementById('testStatus');
        if (msg.loading) {
          statusEl.className = 'status-msg loading';
          statusEl.textContent = msg.message;
        } else if (msg.success) {
          statusEl.className = 'status-msg success';
          statusEl.textContent = msg.message;
        } else {
          statusEl.className = 'status-msg error';
          statusEl.textContent = msg.message;
        }
      }
    });

    // Initial render
    applyI18n(document.getElementById('displayLanguageSelect').value);
    renderDynamicFields(document.getElementById('providerSelect').value);
  </script>
</body>
</html>`;
  }

  public dispose() {
    SettingsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
