import type {
  AssistantContent,
  DataContent,
  ImagePart,
  JSONValue,
  ModelMessage,
  ToolContent,
  ToolResultPart,
  UserContent,
} from 'ai';
import type { Message, MessageContent } from './message-schema.js';

export function toModelMessages(history: Message[] = []): ModelMessage[] {
  const normalized = Array.isArray(history) ? history : [];

  // Collect all tool call IDs declared by assistant messages.
  const assistantToolCallIds = new Set<string>();
  for (const msg of normalized) {
    if (msg.role === 'assistant' && Array.isArray(msg.toolCalls)) {
      for (const call of msg.toolCalls) {
        if (call.id) assistantToolCallIds.add(call.id);
      }
    }
  }

  const expanded = normalized.flatMap((msg) => {
    if (msg.role !== 'tool') return [msg];
    return expandToolMessage(msg);
  });

  // Only keep tool result IDs that map to assistant-declared tool calls.
  const validToolResultIds = new Set<string>();
  for (const msg of expanded) {
    if (msg.role !== 'tool') continue;
    const id = msg.toolCallId || msg.tool_call_id;
    if (!id || !assistantToolCallIds.has(id)) continue;
    validToolResultIds.add(id);
  }

  return expanded
    .filter((msg) => {
      if (!msg || !msg.role) return false;
      // Drop tool result messages whose toolCallId doesn't match a declared assistant tool call.
      if (msg.role === 'tool') {
        const id = msg.toolCallId || msg.tool_call_id;
        if (!id || !validToolResultIds.has(id)) return false;
      }
      return true;
    })
    .map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          content: normalizeToolContent(msg),
        };
      }
      if (msg.role === 'assistant') {
        return {
          role: 'assistant',
          content: normalizeAssistantContent(msg, validToolResultIds),
        } as ModelMessage;
      }
      if (msg.role === 'system') {
        return {
          role: 'system',
          content: normalizeSystemContent(msg.content),
        };
      }
      return {
        role: 'user',
        content: normalizeUserContent(msg.content),
      };
    });
}

function normalizeToolContent(message: Message): ToolContent {
  const content = message.content;
  const toolCallId = message.toolCallId || message.tool_call_id || `tool_${Date.now()}`;
  return [
    {
      type: 'tool-result',
      toolCallId: String(toolCallId),
      toolName: message.name || message.toolName || 'tool',
      output: normalizeToolOutput(content),
    },
  ];
}

function normalizeToolOutput(content: MessageContent): ToolResultPart['output'] {
  if (typeof content === 'string') {
    return { type: 'text', value: content };
  }
  if (content && typeof content === 'object') {
    return {
      type: 'json',
      value: coerceJsonValue(content),
    };
  }
  return { type: 'text', value: '' };
}

function normalizeUserContent(content: MessageContent): UserContent {
  if (Array.isArray(content)) {
    const parts: Array<{ type: 'text'; text: string } | ImagePart> = [];
    for (const part of content) {
      if (typeof part === 'string') {
        parts.push({ type: 'text', text: part });
        continue;
      }
      if (part && typeof part === 'object') {
        if ('text' in part && typeof part.text === 'string') {
          parts.push({ type: 'text', text: part.text });
          continue;
        }
        if ('image_url' in part && part.image_url?.url) {
          parts.push({ type: 'image', image: part.image_url.url as DataContent });
          continue;
        }
      }
      parts.push({ type: 'text', text: '' });
    }
    return parts;
  }
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') return JSON.stringify(content);
  return '';
}

function expandToolMessage(message: Message): Message[] {
  const directToolCallId = message.toolCallId || message.tool_call_id;
  if (directToolCallId) return [message];

  const entries: Message[] = [];
  const fromPart = (part: unknown) => {
    if (!part || typeof part !== 'object') return;
    const rawPart = part as Record<string, unknown>;
    const toolCallId = rawPart.toolCallId || rawPart.tool_call_id || rawPart.tool_use_id || rawPart.id;
    if (typeof toolCallId !== 'string' || !toolCallId.trim()) return;
    const toolName =
      typeof rawPart.toolName === 'string'
        ? rawPart.toolName
        : typeof rawPart.name === 'string'
          ? rawPart.name
          : message.toolName || message.name || 'tool';
    const output = rawPart.output ?? rawPart.result ?? rawPart.content ?? rawPart;
    entries.push({
      role: 'tool',
      toolCallId: toolCallId.trim(),
      toolName,
      name: toolName,
      content: output as MessageContent,
    });
  };

  if (Array.isArray(message.content)) {
    message.content.forEach((part) => fromPart(part));
  } else {
    fromPart(message.content);
  }

  return entries.length > 0 ? entries : [message];
}

function normalizeAssistantContent(message: Message, validToolResultIds?: Set<string>): AssistantContent {
  const rawToolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
  const filteredToolCalls =
    validToolResultIds && rawToolCalls.length > 0
      ? rawToolCalls.filter((call) => call.id && validToolResultIds.has(call.id))
      : rawToolCalls;

  const toolCallParts = filteredToolCalls.map((call) => ({
    type: 'tool-call' as const,
    toolCallId: call.id,
    toolName: call.name,
    input: call.args || {},
  }));

  // If there are tool calls, we must return an array (not a plain string)
  // so the SDK sees both text and tool-call parts.
  if (toolCallParts.length > 0) {
    const parts: AssistantContent = [];
    const text = typeof message.content === 'string' ? message.content : '';
    if (text) {
      parts.push({ type: 'text' as const, text });
    }
    parts.push(...toolCallParts);
    return parts;
  }

  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') return { type: 'text', text: part } as const;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return { type: 'text', text: part.text } as const;
        }
        return null;
      })
      .filter((part): part is { type: 'text'; text: string } => part !== null);
  }
  if (message.content && typeof message.content === 'object') {
    return JSON.stringify(message.content);
  }
  return '';
}

function normalizeSystemContent(content: MessageContent) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('\n');
  }
  if (content && typeof content === 'object') return JSON.stringify(content);
  return '';
}

function coerceJsonValue(value: unknown): JSONValue {
  try {
    return JSON.parse(JSON.stringify(value)) as JSONValue;
  } catch {
    return String(value ?? '');
  }
}
