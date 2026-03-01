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

  // Collect all tool call IDs from assistant messages so we can validate tool results
  const validToolCallIds = new Set<string>();
  for (const msg of normalized) {
    if (msg.role === 'assistant' && Array.isArray(msg.toolCalls)) {
      for (const call of msg.toolCalls) {
        if (call.id) validToolCallIds.add(call.id);
      }
    }
  }

  return normalized
    .filter((msg) => {
      if (!msg || !msg.role) return false;
      // Drop tool result messages whose toolCallId doesn't match any known tool call
      if (msg.role === 'tool') {
        const id = msg.toolCallId || msg.tool_call_id;
        if (!id || !validToolCallIds.has(id)) return false;
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
          content: normalizeAssistantContent(msg),
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

function normalizeAssistantContent(message: Message): AssistantContent {
  const toolCallParts = Array.isArray(message.toolCalls)
    ? message.toolCalls.map((call) => ({
        type: 'tool-call' as const,
        toolCallId: call.id,
        toolName: call.name,
        input: call.args || {},
      }))
    : [];

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
