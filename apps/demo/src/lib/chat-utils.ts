import type { LogEvent } from '@federise/sdk';

/**
 * Generate a deterministic color for a username (readable on dark background)
 */
export function getColorForName(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = char.charCodeAt(0) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 65%)`;
}

/**
 * Check if a message is a meta entry (used for channel name, etc.)
 */
export function isMetaMessage(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return parsed.type === '__meta__';
  } catch {
    return false;
  }
}

/**
 * Parse a meta message to extract metadata like channel name
 */
export function parseMetaMessage(content: string): { type: string; name?: string } | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === '__meta__') {
      return parsed;
    }
  } catch {
    // Not JSON, regular message
  }
  return null;
}

/**
 * Parse a chat message to extract author and text
 */
export function parseChatMessage(content: string): { author: string; text: string } | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === '__chat__' && typeof parsed.author === 'string' && typeof parsed.text === 'string') {
      return { author: parsed.author, text: parsed.text };
    }
  } catch {
    // Not JSON, treat as plain text
  }
  return null;
}

export interface MessageDisplay {
  author: string;
  text: string;
}

/**
 * Get display content for a message
 */
export function getMessageDisplay(message: LogEvent): MessageDisplay {
  const parsed = parseChatMessage(message.content);
  if (parsed) {
    return parsed;
  }
  // Fallback for plain text messages
  return { author: message.authorId.slice(0, 8), text: message.content };
}

/**
 * Filter messages to exclude meta entries
 */
export function filterDisplayMessages(messages: LogEvent[]): LogEvent[] {
  return messages.filter(m => !isMetaMessage(m.content));
}
