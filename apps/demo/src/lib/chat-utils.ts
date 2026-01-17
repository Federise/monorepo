import type { ChannelEvent } from '@federise/sdk';

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
 * Author is optional - if not present, the display name from the token will be used
 */
export function parseChatMessage(content: string): { author: string | null; text: string } | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === '__chat__' && typeof parsed.text === 'string') {
      // Author can be string, undefined, or null
      const author = typeof parsed.author === 'string' ? parsed.author : null;
      return { author, text: parsed.text };
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
 * Format author display string
 * - If username and displayName both exist and differ: "Username (Display Name)"
 * - If only username: "Username"
 * - If only displayName: "Display Name"
 */
function formatAuthorDisplay(username: string | null, displayName: string | null): string {
  if (username && displayName && username !== displayName) {
    return `${username} (${displayName})`;
  }
  return username || displayName || 'Anonymous';
}

/**
 * Get display content for a message
 * @param message The channel event
 * @param content The message content string (optional, uses message.content if not provided)
 */
export function getMessageDisplay(message: ChannelEvent): MessageDisplay {
  const content = message.content || '';
  const parsed = parseChatMessage(content);

  // The authorId from the event is the display name assigned via the share token
  const displayName = message.authorId;

  if (parsed) {
    // Message has structured content with a custom username
    const author = formatAuthorDisplay(parsed.author, displayName);
    return { author, text: parsed.text };
  }

  // Fallback for plain text messages - use display name or truncated authorId
  return { author: displayName || message.authorId.slice(0, 8), text: content };
}

/**
 * Filter messages to exclude meta entries
 */
export function filterDisplayMessages(messages: ChannelEvent[]): ChannelEvent[] {
  return messages.filter(m => !isMetaMessage(m.content));
}
