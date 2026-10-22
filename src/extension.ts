import * as vscode from 'vscode';

const API_BASE_URL = 'https://api.ilmu.ai/v1';
const API_KEY_SECRET = 'ilmuchat.apiKey';
const MODELS = [
  { id: 'ilmu-glm-5.3', name: 'ILMU GLM 5.3', imageInput: true },
  { id: 'ilmu-glm-5.3-flash', name: 'ILMU GLM 5.3 Flash', imageInput: false }
] as const;

let apiKeyPrompt: Promise<string | undefined> | undefined;

type IlmuCodeModel = vscode.LanguageModelChatInformation;
type OpenAIMessage = Record<string, unknown>;

interface StreamToolCall {
  index: number;
  id: string;
  name: string;
  arguments: string;
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
}

type FetchResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
};

type FetchFunction = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }
) => Promise<FetchResponse>;

// VS Code's extension host provides fetch. This local type also works when
// this source file is opened outside the extension workspace.
const fetch = (globalThis as typeof globalThis & { fetch: FetchFunction }).fetch;

class IlmuCodeProvider implements vscode.LanguageModelChatProvider {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async provideLanguageModelChatInformation(
    options: vscode.PrepareLanguageModelChatModelOptions
  ): Promise<IlmuCodeModel[]> {
    let apiKey = await this.secrets.get(API_KEY_SECRET);
    if (!apiKey && !options.silent) apiKey = await promptForApiKey(this.secrets);
    if (!apiKey) return [];

    return MODELS.map(model => ({
      id: model.id,
      name: model.name,
      family: 'ilmu-glm-5.3',
      version: '1',
      maxInputTokens: 1_000_000,
      maxOutputTokens: 128_000,
      detail: 'ILMU API',
      tooltip: 'Provided by ILMUcode using the ILMU API',
      capabilities: { imageInput: model.imageInput, toolCalling: true }
    }));
  }

  async provideLanguageModelChatResponse(
    model: IlmuCodeModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const apiKey = await this.secrets.get(API_KEY_SECRET);
    if (!apiKey) throw new Error('No ILMU API key is configured. Run \"ILMUcode: Set API Key\" and retry.');

    const controller = new AbortController();
    const cancellation = token.onCancellationRequested(() => controller.abort());
    try {
      const requestBody: Record<string, unknown> = {
        model: model.id,
        messages: toOpenAIMessages(messages),
        stream: true
      };
      const tools = options.tools?.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema ?? { type: 'object', properties: {} }
        }
      }));
      if (tools?.length) {
        requestBody.tools = tools;
        requestBody.tool_choice = options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto';
      }

      const response = await fetch(`${API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`ILMU API returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }
      if (!response.body) throw new Error('ILMU API returned an empty response stream.');

      const toolCalls = await streamCompletion(response.body, progress, token);
      for (const call of toolCalls) {
        if (!call.name) continue;
        let input: object;
        try {
          input = JSON.parse(call.arguments || '{}') as object;
        } catch {
          throw new Error(`ILMU returned invalid arguments for tool "${call.name}".`);
        }
        progress.report(new vscode.LanguageModelToolCallPart(call.id || `ilmucode-${call.index}`, call.name, input));
      }
    } finally {
      cancellation.dispose();
    }
  }

  async provideTokenCount(
    _model: IlmuCodeModel,
    text: string | vscode.LanguageModelChatRequestMessage
  ): Promise<number> {
    const value = typeof text === 'string' ? text : JSON.stringify(toOpenAIMessages([text]));
    return Math.ceil(value.length / 3);
  }
}

function toOpenAIMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): OpenAIMessage[] {
  const output: OpenAIMessage[] = [];
  for (const message of messages) {
    const role = message.role === vscode.LanguageModelChatMessageRole.User ? 'user' : 'assistant';
    const textParts: string[] = [];
    const parts: Array<Record<string, unknown>> = [];
    const toolCalls: Array<Record<string, unknown>> = [];
    const toolResults: OpenAIMessage[] = [];

    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        textParts.push(part.value);
        parts.push({ type: 'text', text: part.value });
      } else if (part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith('image/')) {
        const data = Buffer.from(part.data).toString('base64');
        parts.push({ type: 'image_url', image_url: { url: `data:${part.mimeType};base64,${data}` } });
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        toolCalls.push({
          id: part.callId,
          type: 'function',
          function: { name: part.name, arguments: JSON.stringify(part.input) }
        });
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        const result = part.content
          .filter((item): item is vscode.LanguageModelTextPart => item instanceof vscode.LanguageModelTextPart)
          .map(item => item.value)
          .join('\n');
        toolResults.push({ role: 'tool', tool_call_id: part.callId, content: result });
      }
    }

    if (role === 'assistant' && toolCalls.length) {
      output.push({ role, content: textParts.join('') || null, tool_calls: toolCalls });
    } else if (toolResults.length) {
      if (textParts.length || parts.some(part => part.type === 'image_url')) {
        output.push({ role, content: parts.some(part => part.type === 'image_url') ? parts : textParts.join('') });
      }
      output.push(...toolResults);
    } else if (textParts.length || parts.some(part => part.type === 'image_url')) {
      output.push({ role, content: parts.some(part => part.type === 'image_url') ? parts : textParts.join('') });
    }
  }
  return output;
}

async function streamCompletion(
  body: ReadableStream<Uint8Array>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<StreamToolCall[]> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<number, StreamToolCall>();
  let buffer = '';
  let done = false;

  const processLine = (line: string): void => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let chunk: ChatCompletionChunk;
    try { chunk = JSON.parse(data) as ChatCompletionChunk; } catch { return; }

    const delta = chunk.choices?.[0]?.delta;
    if (typeof delta?.content === 'string' && delta.content) {
      progress.report(new vscode.LanguageModelTextPart(delta.content));
    }
    for (const item of delta?.tool_calls ?? []) {
      const call = calls.get(item.index) ?? { index: item.index, id: '', name: '', arguments: '' };
      if (item.id) call.id += item.id;
      if (item.function?.name) call.name += item.function.name;
      if (item.function?.arguments) call.arguments += item.function.arguments;
      calls.set(item.index, call);
    }
  };

  try {
    while (!done) {
      if (token.isCancellationRequested) break;
      const result = await reader.read();
      done = result.done;
      if (result.value) buffer += decoder.decode(result.value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) processLine(line);
    }
    if (buffer) processLine(buffer);
  } finally {
    if (!done) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return [...calls.values()].sort((a, b) => a.index - b.index);
}

async function promptForApiKey(secrets: vscode.SecretStorage): Promise<string | undefined> {
  if (apiKeyPrompt) return apiKeyPrompt;
  apiKeyPrompt = (async () => {
    const value = await vscode.window.showInputBox({
      title: 'Set up ILMUcode',
      prompt: 'Enter your ILMU API key. VS Code stores it securely.',
      password: true,
      ignoreFocusOut: true,
      validateInput: input => input.trim() ? undefined : 'Enter an API key to continue.'
    });
    const key = value?.trim();
    if (!key) return undefined;
    await secrets.store(API_KEY_SECRET, key);
    return key;
  })();
  try {
    return await apiKeyPrompt;
  } finally {
    apiKeyPrompt = undefined;
  }
}

async function startChat(context: vscode.ExtensionContext, askForKey: boolean): Promise<void> {
  let apiKey = await context.secrets.get(API_KEY_SECRET);
  if (!apiKey && askForKey) apiKey = await promptForApiKey(context.secrets);
  if (!apiKey) return;

  await vscode.commands.executeCommand('workbench.action.chat.open');
  void vscode.window.showInformationMessage(
    'ILMUcode is ready. In the Chat model picker, choose ILMUcode, then ILMU GLM 5.3 or ILMU GLM 5.3 Flash.'
  );
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new IlmuCodeProvider(context.secrets);
  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider('ilmucode', provider),
    vscode.commands.registerCommand('ilmucode.setApiKey', async () => {
      const apiKey = await promptForApiKey(context.secrets);
      if (apiKey) await startChat(context, false);
    }),
    vscode.commands.registerCommand('ilmucode.startChat', async () => {
      await startChat(context, true);
    }),
    vscode.commands.registerCommand('ilmucode.clearApiKey', async () => {
      await context.secrets.delete(API_KEY_SECRET);
      void vscode.window.showInformationMessage('ILMUcode API key removed from VS Code.');
    })
  );

  // On first install, ask for the key after VS Code finishes starting. If the
  // user cancels, they can run "ILMUcode: Start Chat" or "ILMUcode: Set API Key" later.
  void context.secrets.get(API_KEY_SECRET).then(apiKey => {
    if (!apiKey) void startChat(context, true);
  });
}

export function deactivate(): void {}
