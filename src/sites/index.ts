export type WriteStep = 'paste' | 'insertText';

export interface SiteAdapter {
  id: string;
  name: string;
  /** Exact hostnames this adapter handles. */
  hosts: string[];
  /** Ordered fallbacks: the first selector that matches a visible element wins. */
  input: string[];
  send: string[];
  messages: string[];
  /** How to write into a contenteditable editor, tried in order. Textareas always use the native setter. */
  write: WriteStep[];
  /** True only once the selectors were checked against the live site. */
  verified: boolean;
}

const CE = '[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';

export const GENERIC: SiteAdapter = {
  id: 'generic',
  name: 'Generic',
  hosts: [],
  input: ['textarea', CE, '[role="textbox"]', 'input[type="text"]', 'input:not([type])'],
  send: ['button[type="submit"]', 'button[aria-label*="send" i]', 'button[data-testid*="send" i]', 'button[aria-label*="submit" i]'],
  messages: [],
  write: ['paste', 'insertText'],
  verified: true,
};

// Selectors below are best guesses from public knowledge of each site's markup, NOT checked on the live
// sites. The generic selectors are appended as a fallback, so a stale adapter degrades rather than breaks.
const SITES: SiteAdapter[] = [
  {
    id: 'chatgpt', name: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com'],
    input: ['#prompt-textarea', 'div.ProseMirror[contenteditable="true"]'],
    send: ['button[data-testid="send-button"]', '#composer-submit-button'],
    messages: ['[data-message-author-role]'],
    write: ['paste', 'insertText'], verified: false,
  },
  {
    id: 'claude', name: 'Claude', hosts: ['claude.ai'],
    input: ['div.ProseMirror[contenteditable="true"]'],
    send: ['button[aria-label="Send message"]', 'button[aria-label*="Send" i]'],
    messages: ['[data-testid="user-message"]', '.font-claude-message'],
    write: ['paste', 'insertText'], verified: false,
  },
  {
    id: 'gemini', name: 'Gemini', hosts: ['gemini.google.com'],
    input: ['rich-textarea .ql-editor[contenteditable="true"]', '.ql-editor[contenteditable="true"]'],
    send: ['button.send-button', 'button[aria-label*="Send" i]'],
    messages: ['message-content'],
    write: ['paste', 'insertText'], verified: false,
  },
  {
    id: 'copilot', name: 'Copilot', hosts: ['copilot.microsoft.com'],
    input: ['textarea#userInput', 'textarea'],
    send: ['button[aria-label*="Submit" i]', 'button[type="submit"]'],
    messages: ['[data-content="ai-message"]', '[data-content="user-message"]'],
    write: ['paste', 'insertText'], verified: false,
  },
  {
    id: 'perplexity', name: 'Perplexity', hosts: ['www.perplexity.ai', 'perplexity.ai'],
    input: ['#ask-input', 'div[contenteditable="true"][role="textbox"]', 'textarea'],
    send: ['button[aria-label*="Submit" i]', 'button[data-testid="submit-button"]'],
    messages: ['.prose'],
    write: ['paste', 'insertText'], verified: false,
  },
  {
    id: 'deepseek', name: 'DeepSeek', hosts: ['chat.deepseek.com'],
    input: ['textarea#chat-input', 'textarea'],
    send: ['div[role="button"][aria-disabled]', 'button[type="submit"]'],
    messages: ['.ds-markdown'],
    write: ['paste', 'insertText'], verified: false,
  },
  {
    id: 'mistral', name: 'Mistral', hosts: ['chat.mistral.ai'],
    input: ['div.ProseMirror[contenteditable="true"]', 'textarea'],
    send: ['button[type="submit"]', 'button[aria-label*="Send" i]'],
    messages: ['[data-message-author-role]', '.prose'],
    write: ['paste', 'insertText'], verified: false,
  },
  {
    id: 'grok', name: 'Grok', hosts: ['grok.com'],
    input: ['textarea', 'div.ProseMirror[contenteditable="true"]'],
    send: ['button[type="submit"]', 'button[aria-label*="Submit" i]'],
    messages: ['.message-bubble'],
    write: ['paste', 'insertText'], verified: false,
  },
  {
    id: 'poe', name: 'Poe', hosts: ['poe.com'],
    input: ['textarea[class*="GrowingTextArea"]', 'textarea'],
    send: ['button[data-button-send]', 'button[class*="sendButton"]', 'button[aria-label*="Send" i]'],
    messages: ['[class*="Message_messageTextContainer"]'],
    write: ['paste', 'insertText'], verified: false,
  },
];

export const BUILTIN_SITES = SITES;

export function adapterFor(host: string): SiteAdapter {
  return SITES.find((s) => s.hosts.includes(host)) ?? GENERIC;
}

/** Adapter selectors first, generic ones after, so a stale adapter still finds something. */
export function withFallback(a: SiteAdapter): SiteAdapter {
  if (a === GENERIC) return a;
  const merge = (x: string[], y: string[]) => [...x, ...y.filter((s) => !x.includes(s))];
  return { ...a, input: merge(a.input, GENERIC.input), send: merge(a.send, GENERIC.send) };
}
