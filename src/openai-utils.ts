import type { ChatCompletionMessageParam } from 'openai/resources';
import type { ReasoningEffort } from 'openai/resources/shared';
import { ConfigKeys, ConfigurationManager, PROVIDERS } from './config';
import { Logger } from './logger';

/**
 * Creates and returns an OpenAI client instance configured for the specified provider.
 */
export async function createOpenAIApiClient(providerId: string = 'openai'): Promise<any> {
  const configManager = ConfigurationManager.getInstance();
  const provider = PROVIDERS[providerId] || PROVIDERS.openai;

  let apiKey = await configManager.getEffectiveApiKey(providerId);
  let baseURL: string | undefined = provider.defaultBaseUrl;

  if (providerId === 'openai') {
    const customBaseUrl = configManager.getConfig<string>(ConfigKeys.OPENAI_BASE_URL);
    if (customBaseUrl && customBaseUrl.trim() !== '') {
      baseURL = customBaseUrl.trim();
    }
  } else if (providerId === 'ollama') {
    const ollamaUrl = configManager.getConfig<string>(ConfigKeys.OLLAMA_BASE_URL);
    baseURL = ollamaUrl && ollamaUrl.trim() !== '' ? ollamaUrl.trim() : 'http://localhost:11434/v1';
    if (!apiKey) {
      apiKey = 'ollama'; // Ollama doesn't require real key
    }
  } else if (providerId === 'custom') {
    const customUrl = configManager.getConfig<string>(ConfigKeys.CUSTOM_BASE_URL);
    baseURL = customUrl && customUrl.trim() !== '' ? customUrl.trim() : 'http://localhost:8000/v1';
    if (!apiKey) {
      apiKey = 'custom';
    }
  }

  if (!apiKey && provider.requiresApiKey) {
    throw new Error(`API key for ${provider.name} is missing.`);
  }

  const defaultHeaders: Record<string, string> = {};
  if (providerId === 'openrouter') {
    defaultHeaders['HTTP-Referer'] = 'https://github.com/watchakorn-18k/Commit-Craft';
    defaultHeaders['X-Title'] = 'CommitCraft VSCode Extension';
  }

  const azureVersion = configManager.getConfig<string>(ConfigKeys.AZURE_API_VERSION);
  const defaultQuery = (providerId === 'openai' && azureVersion)
    ? { 'api-version': azureVersion }
    : undefined;

  // Lazy load OpenAI SDK on demand
  const { default: OpenAI } = await import('openai');

  return new OpenAI({
    apiKey: apiKey || 'dummy',
    baseURL,
    defaultHeaders: Object.keys(defaultHeaders).length > 0 ? defaultHeaders : undefined,
    defaultQuery
  });
}

/**
 * Sends a chat completion request to an OpenAI-compatible API.
 */
export async function OpenAICompatibleAPI(
  messages: ChatCompletionMessageParam[],
  providerId: string = 'openai'
): Promise<string> {
  const openai = await createOpenAIApiClient(providerId);
  const configManager = ConfigurationManager.getInstance();
  const model = configManager.getActiveModel(providerId);

  let temperature = 0.7;
  const provider = PROVIDERS[providerId];
  if (provider?.configTemperature) {
    temperature = configManager.getConfig<number>(provider.configTemperature, 0.7);
  }

  Logger.info(`Sending request to ${providerId} using model: ${model}`);

  const completion = await openai.chat.completions.create({
    model,
    messages,
    temperature
  });

  return completion.choices[0]?.message?.content || '';
}

/**
 * Sends a request to the OpenAI Responses API.
 */
export async function ResponsesAPI(messages: ChatCompletionMessageParam[]): Promise<string> {
  const openai = await createOpenAIApiClient('openai');
  const configManager = ConfigurationManager.getInstance();
  const model = configManager.getActiveModel('openai');
  const reasoningEffort = configManager.getConfig<string>(
    ConfigKeys.OPENAI_REASONING_EFFORT,
    'medium'
  );
  const textVerbosity = configManager.getConfig<string>(
    ConfigKeys.OPENAI_TEXT_VERBOSITY,
    'medium'
  );

  const verbosityTokenMap: Record<string, number> = {
    low: 1000,
    medium: 4000,
    high: 16000
  };
  const maxOutputTokens = verbosityTokenMap[textVerbosity] ?? 4000;

  const systemMsg = messages.find((m) => m.role === 'system');
  const instructions = systemMsg
    ? typeof systemMsg.content === 'string'
      ? systemMsg.content
      : undefined
    : undefined;

  const inputMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    }));

  const response = await openai.responses.create({
    model,
    ...(instructions ? { instructions } : {}),
    input: inputMessages,
    reasoning: { effort: reasoningEffort as ReasoningEffort },
    max_output_tokens: maxOutputTokens
  });

  return response.output_text;
}

/**
 * Fetch available models from an OpenAI-compatible endpoint
 */
export async function fetchAvailableOpenAIModels(providerId: string = 'openai'): Promise<string[]> {
  try {
    const client = await createOpenAIApiClient(providerId);
    const modelsList = await client.models.list();
    const result: string[] = [];
    for await (const model of modelsList) {
      result.push(model.id);
    }
    return result;
  } catch (error) {
    Logger.error(`Failed to fetch models for ${providerId}:`, error);
    return [];
  }
}
