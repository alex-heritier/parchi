export type SelectorSpec =
  | { kind: 'css'; selector: string }
  | { kind: 'xpath'; xpath: string }
  | { kind: 'text'; text: string }
  | { kind: 'contains'; base: string; text: string };

const stripQuotes = (value: string) => {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export function parseSelectorSpec(rawSelector: string): SelectorSpec {
  const trimmed = String(rawSelector || '').trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('css=')) {
    return { kind: 'css', selector: trimmed.slice(4).trim() };
  }

  if (lower.startsWith('xpath=')) {
    return { kind: 'xpath', xpath: trimmed.slice(6).trim() };
  }

  const textMatch = /^text\s*=\s*(.+)$/i.exec(trimmed);
  if (textMatch) {
    return { kind: 'text', text: stripQuotes(textMatch[1]).trim() };
  }

  const containsDotQuoted = /^([a-zA-Z][\w-]*)\s*\.\s*contains\s*\(\s*(['"])([\s\S]*?)\2\s*\)\s*$/.exec(trimmed);
  if (containsDotQuoted) {
    return { kind: 'contains', base: containsDotQuoted[1], text: containsDotQuoted[3].trim() };
  }

  const containsDotBare = /^([a-zA-Z][\w-]*)\s*\.\s*contains\s*\(\s*([\s\S]*?)\s*\)\s*$/.exec(trimmed);
  if (containsDotBare) {
    return { kind: 'contains', base: containsDotBare[1], text: String(containsDotBare[2] || '').trim() };
  }

  const pseudoContainsQuoted = /^(.+?):\s*contains\s*\(\s*(['"])([\s\S]*?)\2\s*\)\s*$/.exec(trimmed);
  if (pseudoContainsQuoted) {
    return { kind: 'contains', base: pseudoContainsQuoted[1].trim(), text: pseudoContainsQuoted[3].trim() };
  }

  const pseudoContainsBare = /^(.+?):\s*contains\s*\(\s*([\s\S]*?)\s*\)\s*$/.exec(trimmed);
  if (pseudoContainsBare) {
    return { kind: 'contains', base: pseudoContainsBare[1].trim(), text: String(pseudoContainsBare[2] || '').trim() };
  }

  const pseudoHasTextQuoted = /^(.+?):\s*has-text\s*\(\s*(['"])([\s\S]*?)\2\s*\)\s*$/.exec(trimmed);
  if (pseudoHasTextQuoted) {
    return { kind: 'contains', base: pseudoHasTextQuoted[1].trim(), text: pseudoHasTextQuoted[3].trim() };
  }

  const pseudoHasTextBare = /^(.+?):\s*has-text\s*\(\s*([\s\S]*?)\s*\)\s*$/.exec(trimmed);
  if (pseudoHasTextBare) {
    return { kind: 'contains', base: pseudoHasTextBare[1].trim(), text: String(pseudoHasTextBare[2] || '').trim() };
  }

  return { kind: 'css', selector: trimmed };
}
