const HASH_COMMENT_LANGS = new Set([
  'python',
  'py',
  'bash',
  'sh',
  'yaml',
  'yml',
  'ruby',
  'rb',
  'toml',
  'r',
  'perl',
  'pl',
  'coffee',
  'dockerfile',
]);

const KEYWORDS = new Set([
  'abstract',
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'def',
  'default',
  'del',
  'delete',
  'do',
  'elif',
  'else',
  'enum',
  'except',
  'export',
  'extends',
  'final',
  'finally',
  'fn',
  'for',
  'from',
  'function',
  'global',
  'if',
  'impl',
  'import',
  'in',
  'instanceof',
  'interface',
  'is',
  'lambda',
  'let',
  'loop',
  'match',
  'mod',
  'mut',
  'new',
  'not',
  'of',
  'or',
  'override',
  'pass',
  'private',
  'protected',
  'pub',
  'public',
  'raise',
  'ref',
  'return',
  'sealed',
  'self',
  'static',
  'struct',
  'super',
  'suspend',
  'switch',
  'this',
  'throw',
  'trait',
  'try',
  'type',
  'typeof',
  'unless',
  'until',
  'use',
  'val',
  'var',
  'void',
  'when',
  'where',
  'while',
  'with',
  'yield',
]);

const BUILTINS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'none',
  'nil',
  'nan',
  'infinity',
  'True',
  'False',
  'None',
  'NaN',
  'Infinity',
  'int',
  'str',
  'float',
  'bool',
  'list',
  'dict',
  'tuple',
  'set',
  'String',
  'Number',
  'Boolean',
  'Array',
  'Object',
  'Map',
  'Set',
  'Promise',
  'console',
  'document',
  'window',
  'process',
  'require',
  'module',
]);

export const COPY_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

export const highlightCodeBlock = (raw: string, lang: string, escapeHtmlBasic: (value: string) => string): string => {
  if (!raw.trim()) return '';

  const result: string[] = [];
  let i = 0;
  const len = raw.length;
  const hashCmt = HASH_COMMENT_LANGS.has(lang);

  while (i < len) {
    const ch = raw[i];

    if (ch === '/' && raw[i + 1] === '/') {
      const end = raw.indexOf('\n', i);
      const slice = end < 0 ? raw.slice(i) : raw.slice(i, end);
      result.push(`<span class="tk-c">${escapeHtmlBasic(slice)}</span>`);
      i += slice.length;
      continue;
    }

    if (ch === '/' && raw[i + 1] === '*') {
      const end = raw.indexOf('*/', i + 2);
      const slice = end < 0 ? raw.slice(i) : raw.slice(i, end + 2);
      result.push(`<span class="tk-c">${escapeHtmlBasic(slice)}</span>`);
      i += slice.length;
      continue;
    }

    if (ch === '#' && hashCmt) {
      const end = raw.indexOf('\n', i);
      const slice = end < 0 ? raw.slice(i) : raw.slice(i, end);
      result.push(`<span class="tk-c">${escapeHtmlBasic(slice)}</span>`);
      i += slice.length;
      continue;
    }

    if (ch === '<' && raw.slice(i, i + 4) === '<!--') {
      const end = raw.indexOf('-->', i + 4);
      const slice = end < 0 ? raw.slice(i) : raw.slice(i, end + 3);
      result.push(`<span class="tk-c">${escapeHtmlBasic(slice)}</span>`);
      i += slice.length;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < len && raw[j] !== quote) {
        if (raw[j] === '\\') j++;
        j++;
      }
      if (j < len) j++;
      result.push(`<span class="tk-s">${escapeHtmlBasic(raw.slice(i, j))}</span>`);
      i = j;
      continue;
    }

    if (/\d/.test(ch) && (i === 0 || !/[\w.]/.test(raw[i - 1]))) {
      let j = i;
      if (ch === '0' && (raw[j + 1] === 'x' || raw[j + 1] === 'X')) {
        j += 2;
        while (j < len && /[\da-fA-F_]/.test(raw[j])) j++;
      } else {
        while (j < len && /[\d._eE]/.test(raw[j])) {
          if ((raw[j] === 'e' || raw[j] === 'E') && (raw[j + 1] === '+' || raw[j + 1] === '-')) j++;
          j++;
        }
      }
      result.push(`<span class="tk-n">${escapeHtmlBasic(raw.slice(i, j))}</span>`);
      i = j;
      continue;
    }

    if (/[a-zA-Z_$@]/.test(ch)) {
      let j = i;
      while (j < len && /[\w$]/.test(raw[j])) j++;
      const word = raw.slice(i, j);
      if (KEYWORDS.has(word.toLowerCase())) {
        result.push(`<span class="tk-k">${escapeHtmlBasic(word)}</span>`);
      } else if (BUILTINS.has(word)) {
        result.push(`<span class="tk-b">${escapeHtmlBasic(word)}</span>`);
      } else {
        result.push(escapeHtmlBasic(word));
      }
      i = j;
      continue;
    }

    if ('=!<>&|+-'.includes(ch) && i + 1 < len && '=>&|'.includes(raw[i + 1])) {
      const op = raw.slice(i, i + (raw[i + 2] === '=' ? 3 : 2));
      result.push(`<span class="tk-o">${escapeHtmlBasic(op)}</span>`);
      i += op.length;
      continue;
    }

    result.push(escapeHtmlBasic(ch));
    i++;
  }

  return result.join('');
};
