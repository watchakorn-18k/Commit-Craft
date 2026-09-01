import * as vscode from 'vscode';
import { Logger } from './logger';

/**
 * Checks if VS Code Language Model API (e.g. GitHub Copilot) is available
 */
export function isVSCodeLMAvailable(): boolean {
  return typeof (vscode as any).lm?.selectChatModels === 'function';
}

/**
 * Get available VS Code Language Models (e.g. Copilot models)
 */
export async function getVSCodeLMModels(): Promise<{ id: string; name: string; vendor: string; family: string }[]> {
  if (!isVSCodeLMAvailable()) {
    return [];
  }
  try {
    const models = await (vscode as any).lm.selectChatModels();
    return models.map((m: any) => ({
      id: `${m.vendor}/${m.family}`,
      name: `${m.name || m.family} (${m.vendor})`,
      vendor: m.vendor,
      family: m.family
    }));
  } catch (error) {
    Logger.error('Failed to query VS Code Language Models:', error);
    return [];
  }
}

/**
 * Invoke VS Code Language Model API (zero external API key required)
 */
export async function VSCodeLMAPI(
  messages: Array<{ role: string; content: string }>,
  modelFamily?: string
): Promise<string> {
  if (!isVSCodeLMAvailable()) {
    throw new Error('VS Code Language Model API (e.g. GitHub Copilot) is not available in this VS Code version or not installed.');
  }

  try {
    const selector: any = {};
    if (modelFamily && modelFamily.includes('/')) {
      const [vendor, family] = modelFamily.split('/');
      selector.vendor = vendor;
      selector.family = family;
    } else if (modelFamily) {
      selector.family = modelFamily;
    }

    const models = await (vscode as any).lm.selectChatModels(selector);
    const model = models?.[0] || (await (vscode as any).lm.selectChatModels())?.[0];

    if (!model) {
      throw new Error('No VS Code Language Model found. Please ensure GitHub Copilot is installed and active.');
    }

    Logger.info(`Using VS Code LM: ${model.name} (${model.vendor})`);

    const vsMessages = messages.map((m) => {
      if (m.role === 'system' || m.role === 'user') {
        return (vscode as any).LanguageModelChatMessage.User(m.content);
      }
      return (vscode as any).LanguageModelChatMessage.Assistant(m.content);
    });

    const cts = new vscode.CancellationTokenSource();
    const chatResponse = await model.sendRequest(vsMessages, {}, cts.token);

    let fullText = '';
    for await (const fragment of chatResponse.text) {
      fullText += fragment;
    }

    return fullText;
  } catch (error: any) {
    Logger.error('VS Code LM generation failed:', error);
    throw error;
  }
}
