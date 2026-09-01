import { ConfigKeys, ConfigurationManager } from './config';
import { Logger } from './logger';

/**
 * Sends a generation request to the Gemini API.
 */
export async function GeminiAPI(messages: Array<{ role: string; content: string }>): Promise<string> {
  try {
    const configManager = ConfigurationManager.getInstance();
    const apiKey = await configManager.getEffectiveApiKey('gemini');

    if (!apiKey) {
      throw new Error('Gemini API Key is not configured.');
    }

    // Lazy load SDK to save initial RAM
    const { GoogleGenerativeAI } = await import('@google/generative-ai');

    const modelName = configManager.getActiveModel('gemini');
    const temperature = configManager.getConfig<number>(ConfigKeys.GEMINI_TEMPERATURE, 0.7);

    const systemMessage = messages.find((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemMessage?.content ? systemMessage.content : undefined
    });

    Logger.info(`Sending request to Gemini using model: ${modelName}`);

    const promptText = userMessages.map((m) => m.content).join('\n\n');
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: {
        temperature
      }
    });

    const response = await result.response;
    return response.text();
  } catch (error: any) {
    Logger.error('Gemini API call failed:', error);
    throw error;
  }
}