import type { ChatCompletionMessageParam } from 'openai/resources';
import { ConfigKeys, ConfigurationManager, PROVIDERS } from './config';
import { OpenAICompatibleAPI, ResponsesAPI } from './openai-utils';
import { GeminiAPI } from './gemini-utils';
import { ClaudeAPI } from './claude-utils';
import { VSCodeLMAPI } from './vscode-lm-utils';
import { Logger } from './logger';

export class AIService {
  /**
   * Unified method to execute a prompt against the active or specified AI provider
   */
  static async query(
    messages: Array<{ role: string; content: string }>,
    customProviderId?: string
  ): Promise<string> {
    const configManager = ConfigurationManager.getInstance();
    const provider = customProviderId
      ? (PROVIDERS[customProviderId] || configManager.getActiveProvider())
      : configManager.getActiveProvider();

    Logger.info(`AI Service querying provider: ${provider.name}`);

    if (provider.id === 'copilot') {
      const model = configManager.getActiveModel('copilot');
      return await VSCodeLMAPI(messages, model);
    }

    if (provider.id === 'gemini') {
      return await GeminiAPI(messages);
    }

    if (provider.id === 'claude') {
      return await ClaudeAPI(messages);
    }

    // OpenAI, DeepSeek, Ollama, OpenRouter, Groq, Custom
    const apiType = configManager.getConfig<string>(ConfigKeys.OPENAI_API_TYPE, 'completion');
    if (provider.id === 'openai' && apiType === 'response') {
      return await ResponsesAPI(messages as ChatCompletionMessageParam[]);
    }

    return await OpenAICompatibleAPI(
      messages as ChatCompletionMessageParam[],
      provider.id
    );
  }
}
