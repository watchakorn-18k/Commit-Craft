import { ConfigKeys, ConfigurationManager } from './config';
import { Logger } from './logger';

/**
 * Sends a chat completion request to Claude using the Anthropic API.
 */
export async function ClaudeAPI(messages: Array<{ role: string; content: string }>): Promise<string> {
  try {
    const configManager = ConfigurationManager.getInstance();
    const apiKey = await configManager.getEffectiveApiKey('claude');

    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Claude API Key is not configured.');
    }

    // Lazy load Anthropic SDK to minimize baseline RAM
    const { default: Anthropic } = await import('@anthropic-ai/sdk');

    const model = configManager.getActiveModel('claude');
    const temperature = configManager.getConfig<number>(
      ConfigKeys.CLAUDE_TEMPERATURE,
      0.7
    );

    const anthropic = new Anthropic({ apiKey });

    const systemMessage = messages.find((msg) => msg.role === 'system');
    const conversationMessages = messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: (msg.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: msg.content
      }));

    Logger.info(`Sending request to Claude using model: ${model}`);

    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      temperature,
      system: systemMessage?.content,
      messages: conversationMessages
    });

    const textContent = response.content.find((block) => block.type === 'text');
    if (textContent && textContent.type === 'text') {
      return textContent.text;
    }
    return '';
  } catch (error: any) {
    Logger.error('Claude API call failed:', error);
    throw error;
  }
}
