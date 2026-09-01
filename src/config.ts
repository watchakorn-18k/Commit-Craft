import * as vscode from 'vscode';

export enum ConfigKeys {
  AI_PROVIDER = 'AI_PROVIDER',
  AI_COMMIT_LANGUAGE = 'AI_COMMIT_LANGUAGE',
  DISPLAY_LANGUAGE = 'DISPLAY_LANGUAGE',
  AI_COMMIT_SYSTEM_PROMPT = 'AI_COMMIT_SYSTEM_PROMPT',
  COMMIT_STYLE = 'COMMIT_STYLE',
  EMOJI_ENABLED = 'EMOJI_ENABLED',
  AUTO_STAGE = 'AUTO_STAGE',
  AUTO_DETECT_ISSUE = 'AUTO_DETECT_ISSUE',
  SHOW_STATUS_BAR = 'SHOW_STATUS_BAR',

  // OpenAI
  OPENAI_API_KEY = 'OPENAI_API_KEY',
  OPENAI_BASE_URL = 'OPENAI_BASE_URL',
  OPENAI_MODEL = 'OPENAI_MODEL',
  OPENAI_TEMPERATURE = 'OPENAI_TEMPERATURE',
  OPENAI_API_TYPE = 'OPENAI_API_TYPE',
  OPENAI_REASONING_EFFORT = 'OPENAI_REASONING_EFFORT',
  OPENAI_TEXT_VERBOSITY = 'OPENAI_TEXT_VERBOSITY',
  AZURE_API_VERSION = 'AZURE_API_VERSION',

  // Gemini
  GEMINI_API_KEY = 'GEMINI_API_KEY',
  GEMINI_MODEL = 'GEMINI_MODEL',
  GEMINI_TEMPERATURE = 'GEMINI_TEMPERATURE',

  // Claude
  CLAUDE_API_KEY = 'CLAUDE_API_KEY',
  CLAUDE_MODEL = 'CLAUDE_MODEL',
  CLAUDE_TEMPERATURE = 'CLAUDE_TEMPERATURE',

  // DeepSeek
  DEEPSEEK_API_KEY = 'DEEPSEEK_API_KEY',
  DEEPSEEK_MODEL = 'DEEPSEEK_MODEL',
  DEEPSEEK_TEMPERATURE = 'DEEPSEEK_TEMPERATURE',

  // Ollama
  OLLAMA_BASE_URL = 'OLLAMA_BASE_URL',
  OLLAMA_MODEL = 'OLLAMA_MODEL',

  // OpenRouter
  OPENROUTER_API_KEY = 'OPENROUTER_API_KEY',
  OPENROUTER_MODEL = 'OPENROUTER_MODEL',

  // Groq
  GROQ_API_KEY = 'GROQ_API_KEY',
  GROQ_MODEL = 'GROQ_MODEL',

  // Custom OpenAI-compatible
  CUSTOM_BASE_URL = 'CUSTOM_BASE_URL',
  CUSTOM_API_KEY = 'CUSTOM_API_KEY',
  CUSTOM_MODEL = 'CUSTOM_MODEL',

  // VS Code Language Model / Copilot
  VSCODE_LM_MODEL = 'VSCODE_LM_MODEL'
}

export interface ProviderDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  requiresApiKey: boolean;
  defaultModel: string;
  presetModels: { label: string; description?: string }[];
  defaultBaseUrl?: string;
  configApiKey?: ConfigKeys;
  configModel: ConfigKeys;
  configBaseUrl?: ConfigKeys;
  configTemperature?: ConfigKeys;
}

export const PROVIDERS: Record<string, ProviderDefinition> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Fast, high quality (Recommended)',
    icon: '$(sparkle)',
    requiresApiKey: true,
    defaultModel: 'gemini-2.5-flash',
    presetModels: [
      { label: 'gemini-2.5-flash', description: 'Recommended: latest fast & smart multimodal model' },
      { label: 'gemini-2.5-pro', description: 'Advanced reasoning and coding intelligence' },
      { label: 'gemini-2.0-flash', description: 'Ultra-fast next-gen model' },
      { label: 'gemini-1.5-flash', description: 'Fast and cost-efficient' },
      { label: 'gemini-1.5-pro', description: 'High capability model' }
    ],
    configApiKey: ConfigKeys.GEMINI_API_KEY,
    configModel: ConfigKeys.GEMINI_MODEL,
    configTemperature: ConfigKeys.GEMINI_TEMPERATURE
  },
  copilot: {
    id: 'copilot',
    name: 'VS Code LM / Copilot',
    description: 'Built-in GitHub Copilot language models (zero API key)',
    icon: '$(github)',
    requiresApiKey: false,
    defaultModel: 'copilot/gpt-4o',
    presetModels: [
      { label: 'copilot/gpt-4o', description: 'GitHub Copilot GPT-4o' },
      { label: 'copilot/claude-3.5-sonnet', description: 'GitHub Copilot Claude 3.5 Sonnet' },
      { label: 'copilot/gpt-4o-mini', description: 'GitHub Copilot GPT-4o Mini' }
    ],
    configModel: ConfigKeys.VSCODE_LM_MODEL
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4o-mini, o1, o3-mini',
    icon: '$(hubot)',
    requiresApiKey: true,
    defaultModel: 'gpt-4o-mini',
    presetModels: [
      { label: 'gpt-4o-mini', description: 'Recommended: fast, affordable, high quality' },
      { label: 'gpt-4o', description: 'Flagship model for high intelligence' },
      { label: 'o3-mini', description: 'High-speed reasoning model' },
      { label: 'o1', description: 'Deep reasoning model' },
      { label: 'gpt-4-turbo', description: 'Previous generation GPT-4 Turbo' }
    ],
    configApiKey: ConfigKeys.OPENAI_API_KEY,
    configModel: ConfigKeys.OPENAI_MODEL,
    configBaseUrl: ConfigKeys.OPENAI_BASE_URL,
    configTemperature: ConfigKeys.OPENAI_TEMPERATURE
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude',
    description: 'Claude 3.7 Sonnet, Claude 3.5 Sonnet & Haiku',
    icon: '$(circuit-board)',
    requiresApiKey: true,
    defaultModel: 'claude-3-7-sonnet-latest',
    presetModels: [
      { label: 'claude-3-7-sonnet-latest', description: 'Recommended: latest hybrid reasoning model' },
      { label: 'claude-3-5-sonnet-latest', description: 'Top-tier code and text reasoning' },
      { label: 'claude-3-5-haiku-latest', description: 'Lightning fast and lightweight' },
      { label: 'claude-3-opus-latest', description: 'Complex task execution' }
    ],
    configApiKey: ConfigKeys.CLAUDE_API_KEY,
    configModel: ConfigKeys.CLAUDE_MODEL,
    configTemperature: ConfigKeys.CLAUDE_TEMPERATURE
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek V3 & DeepSeek R1',
    icon: '$(rocket)',
    requiresApiKey: true,
    defaultModel: 'deepseek-chat',
    defaultBaseUrl: 'https://api.deepseek.com',
    presetModels: [
      { label: 'deepseek-chat', description: 'Recommended: DeepSeek-V3 chat model' },
      { label: 'deepseek-reasoner', description: 'DeepSeek-R1 reasoning model' }
    ],
    configApiKey: ConfigKeys.DEEPSEEK_API_KEY,
    configModel: ConfigKeys.DEEPSEEK_MODEL,
    configTemperature: ConfigKeys.DEEPSEEK_TEMPERATURE
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local LLM)',
    description: 'Local offline LLMs on your machine',
    icon: '$(server)',
    requiresApiKey: false,
    defaultModel: 'llama3.2',
    defaultBaseUrl: 'http://localhost:11434/v1',
    presetModels: [
      { label: 'llama3.2', description: 'Meta Llama 3.2' },
      { label: 'qwen2.5-coder', description: 'Alibaba Qwen 2.5 Coder' },
      { label: 'deepseek-r1', description: 'DeepSeek R1 local distilled' },
      { label: 'mistral', description: 'Mistral 7B' },
      { label: 'codellama', description: 'CodeLlama' }
    ],
    configApiKey: ConfigKeys.CUSTOM_API_KEY,
    configModel: ConfigKeys.OLLAMA_MODEL,
    configBaseUrl: ConfigKeys.OLLAMA_BASE_URL
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified access to multiple models',
    icon: '$(globe)',
    requiresApiKey: true,
    defaultModel: 'deepseek/deepseek-chat',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    presetModels: [
      { label: 'deepseek/deepseek-chat', description: 'DeepSeek V3 on OpenRouter' },
      { label: 'anthropic/claude-3.5-sonnet', description: 'Claude 3.5 Sonnet' },
      { label: 'openai/gpt-4o-mini', description: 'GPT-4o Mini' },
      { label: 'meta-llama/llama-3.3-70b-instruct', description: 'Llama 3.3 70B' },
      { label: 'google/gemini-2.0-flash-exp:free', description: 'Gemini 2.0 Flash (Free tier)' }
    ],
    configApiKey: ConfigKeys.OPENROUTER_API_KEY,
    configModel: ConfigKeys.OPENROUTER_MODEL
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast LPU inference',
    icon: '$(zap)',
    requiresApiKey: true,
    defaultModel: 'llama-3.3-70b-versatile',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    presetModels: [
      { label: 'llama-3.3-70b-versatile', description: 'Recommended: Llama 3.3 70B' },
      { label: 'llama-3.1-8b-instant', description: 'Instant response 8B model' },
      { label: 'mixtral-8x7b-32768', description: 'Mixtral 8x7B MoE' },
      { label: 'deepseek-r1-distill-llama-70b', description: 'DeepSeek R1 Distill 70B' }
    ],
    configApiKey: ConfigKeys.GROQ_API_KEY,
    configModel: ConfigKeys.GROQ_MODEL
  },
  custom: {
    id: 'custom',
    name: 'Custom OpenAI-Compatible',
    description: 'vLLM, LM Studio, LocalAI, Azure, or custom server',
    icon: '$(gear)',
    requiresApiKey: false,
    defaultModel: 'default',
    defaultBaseUrl: 'http://localhost:8000/v1',
    presetModels: [
      { label: 'default', description: 'Default model name' }
    ],
    configApiKey: ConfigKeys.CUSTOM_API_KEY,
    configModel: ConfigKeys.CUSTOM_MODEL,
    configBaseUrl: ConfigKeys.CUSTOM_BASE_URL
  }
};

export const UI_DISPLAY_LANGUAGES = [
  { code: 'en', label: 'English', description: 'English (Default)' },
  { code: 'th', label: 'Thai', description: 'ภาษาไทย' },
  { code: 'zh', label: 'Simplified Chinese', description: '简体中文' },
  { code: 'ja', label: 'Japanese', description: '日本語' }
];

export const SUPPORTED_LANGUAGES = [
  { label: 'Thai', description: 'ภาษาไทย (Thai)' },
  { label: 'English', description: 'English (Default)' },
  { label: 'Simplified Chinese', description: '简体中文 (Chinese Simplified)' },
  { label: 'Traditional Chinese', description: '繁體中文 (Chinese Traditional)' },
  { label: 'Japanese', description: '日本語 (Japanese)' },
  { label: 'Korean', description: '한국어 (Korean)' },
  { label: 'Spanish', description: 'Español (Spanish)' },
  { label: 'French', description: 'Français (French)' },
  { label: 'German', description: 'Deutsch (German)' },
  { label: 'Portuguese', description: 'Português (Portuguese)' },
  { label: 'Russian', description: 'Русский (Russian)' },
  { label: 'Vietnamese', description: 'Tiếng Việt (Vietnamese)' },
  { label: 'Bahasa', description: 'Bahasa Indonesia / Melayu' },
  { label: 'Italian', description: 'Italiano (Italian)' },
  { label: 'Polish', description: 'Polski (Polish)' },
  { label: 'Dutch', description: 'Nederlands (Dutch)' },
  { label: 'Turkish', description: 'Türkçe (Turkish)' },
  { label: 'Swedish', description: 'Svenska (Swedish)' },
  { label: 'Czech', description: 'Česky (Czech)' }
];

export const COMMIT_STYLES = [
  { id: 'conventional', label: 'Conventional Commits', description: 'feat(scope): subject with technical bullet points' },
  { id: 'simple', label: 'Simple / One-Liner', description: 'Concise single line (e.g. feat(auth): add login)' },
  { id: 'detailed', label: 'Detailed Changelog', description: 'In-depth explanation with rationale and context' }
];

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private configCache: Map<string, any> = new Map();
  private disposable: vscode.Disposable;
  private context: vscode.ExtensionContext;
  private onConfigChangeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeConfig = this.onConfigChangeEmitter.event;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.disposable = vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('ai-commit') ||
        event.affectsConfiguration('commitcraft')
      ) {
        this.configCache.clear();
        this.onConfigChangeEmitter.fire();
      }
    });
  }

  static getInstance(context?: vscode.ExtensionContext): ConfigurationManager {
    if (!this.instance && context) {
      this.instance = new ConfigurationManager(context);
    }
    return this.instance;
  }

  getConfig<T>(key: string, defaultValue?: T): T {
    if (!this.configCache.has(key)) {
      const config = vscode.workspace.getConfiguration('commitcraft');
      const val = config.get<T>(key);

      if (val !== undefined && val !== null && val !== '') {
        this.configCache.set(key, val);
      } else {
        const altConfig = vscode.workspace.getConfiguration('ai-commit');
        const altVal = altConfig.get<T>(key);
        if (altVal !== undefined && altVal !== null && altVal !== '') {
          this.configCache.set(key, altVal);
        } else {
          this.configCache.set(key, defaultValue as T);
        }
      }
    }
    return this.configCache.get(key);
  }

  async updateConfig<T>(
    key: string,
    value: T,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('commitcraft');
    await config.update(key, value, target);
    this.configCache.set(key, value);
  }

  async setSecretApiKey(providerId: string, apiKey: string): Promise<void> {
    if (!this.context) {
      return;
    }
    const secretKey = `commitcraft.apikey.${providerId}`;
    if (!apiKey || apiKey.trim() === '') {
      await this.context.secrets.delete(secretKey);
    } else {
      await this.context.secrets.store(secretKey, apiKey.trim());
    }
  }

  async getEffectiveApiKey(providerId: string): Promise<string> {
    const provider = PROVIDERS[providerId];
    if (!provider) {
      return '';
    }

    const configKey = provider.configApiKey;
    if (configKey) {
      const keyFromSettings = this.getConfig<string>(configKey, '');
      if (keyFromSettings && keyFromSettings.trim().length > 0) {
        return keyFromSettings.trim();
      }
    }

    if (this.context?.secrets) {
      const secret = await this.context.secrets.get(`commitcraft.apikey.${providerId}`) ||
                     await this.context.secrets.get(`ai-commit.apikey.${providerId}`);
      if (secret && secret.trim().length > 0) {
        return secret.trim();
      }
    }

    return '';
  }

  getActiveProvider(): ProviderDefinition {
    const providerId = this.getConfig<string>(ConfigKeys.AI_PROVIDER, 'gemini').toLowerCase();
    return PROVIDERS[providerId] || PROVIDERS.gemini;
  }

  getActiveModel(providerId?: string): string {
    const provider = providerId ? (PROVIDERS[providerId] || this.getActiveProvider()) : this.getActiveProvider();
    const configModel = this.getConfig<string>(provider.configModel);
    return configModel && configModel.trim() !== '' ? configModel.trim() : provider.defaultModel;
  }

  dispose() {
    this.disposable.dispose();
    this.onConfigChangeEmitter.dispose();
  }
}
