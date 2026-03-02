import { SidePanelUI } from '../core/panel-ui.js';
const sidePanelProto = SidePanelUI.prototype as SidePanelUI & Record<string, unknown>;

import { COPY_ICON, highlightCodeBlock } from './markdown-highlighter.js';
import { renderMarkdownTable as renderMarkdownTableHtml } from './markdown-table.js';

sidePanelProto.highlightCodeBlock = function highlightCodeBlockProto(raw: string, lang: string): string {
  return highlightCodeBlock(raw, lang, (value) => this.escapeHtmlBasic(value));
};

sidePanelProto.renderMarkdown = function renderMarkdown(text: string) {
  if (!text) return '';

  const escape = (value = '') => this.escapeHtmlBasic(value);
  const escapeAttr = (value = '') => this.escapeAttribute(value);

  let working = String(text).replace(/\r\n/g, '\n');

  const codeBlocks: string[] = [];
  const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
  working = working.replace(codeBlockRegex, (_: string, lang = '', body = '') => {
    const placeholder = `@@CODE_BLOCK_${codeBlocks.length}@@`;
    const langLower = lang.toLowerCase();
    const languageClass = lang ? ` class="language-${escapeAttr(langLower)}"` : '';
    const highlighted = lang ? this.highlightCodeBlock(body, langLower) : escape(body);
    codeBlocks.push(
      `<div class="code-block-wrap">` +
        `<div class="code-block-hdr">` +
        `<span class="code-block-lang">${lang ? escapeAttr(langLower) : ''}</span>` +
        `<button class="code-copy-btn" type="button" title="Copy">${COPY_ICON}</button>` +
        '</div>' +
        `<pre><code${languageClass}>${highlighted}</code></pre>` +
        '</div>',
    );
    return placeholder;
  });

  const tables: string[] = [];
  const tableRegex = /(?:^|\n)((?:\|[^\n]*)+\|(?:\n|\r?\n?))+/gm;
  working = working.replace(tableRegex, (match: string) => {
    const placeholder = `@@TABLE_${tables.length}@@`;
    tables.push(renderMarkdownTableHtml(match.trim(), escape));
    return placeholder;
  });

  const applyInline = (value = '') => {
    let html = escape(value);
    const inlineCode: string[] = [];
    html = html.replace(/`([^`]+)`/g, (_: string, code: string) => {
      const placeholder = `@@INLINECODE${inlineCode.length}@@`;
      inlineCode.push(`<code>${code}</code>`);
      return placeholder;
    });
    html = html.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_: string, alt: string, url: string) => `<img alt="${alt}" src="${url}">`,
    );
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_: string, label: string, url: string) =>
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
    );
    html = html.replace(
      /(^|[\s(])((?:https?:\/\/|www\.)[^\s<]+[^\s<\.)\],])/gi,
      (_: string, prefix: string, rawUrl: string) => {
        let url = rawUrl;
        let trailing = '';
        while (/[),.\]]$/.test(url)) {
          trailing = url.slice(-1) + trailing;
          url = url.slice(0, -1);
        }
        const href = url.startsWith('http') ? url : `https://${url}`;
        return `${prefix}<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
      },
    );
    html = html.replace(/==(.+?)==/g, '<mark>$1</mark>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    html = html.replace(/(?<!\*)\*(?!\s)(.+?)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/(?<!_)_(?!\s)(.+?)_(?!_)/g, '<em>$1</em>');

    inlineCode.forEach((codeBlock, index) => {
      const placeholder = `@@INLINECODE${index}@@`;
      html = html.split(placeholder).join(codeBlock);
    });
    return html;
  };

  const lines = working.split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      blocks.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      blocks.push('</ol>');
      inOl = false;
    }
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${applyInline(paragraph.join('\n'))}</p>`);
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine;
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      closeLists();
      continue;
    }

    const placeholderMatch = trimmed.match(/^@@CODE_BLOCK_(\d+)@@$/);
    if (placeholderMatch) {
      flushParagraph();
      closeLists();
      blocks.push(trimmed);
      continue;
    }

    const tableMatch = trimmed.match(/^@@TABLE_(\d+)@@$/);
    if (tableMatch) {
      flushParagraph();
      closeLists();
      blocks.push(trimmed);
      continue;
    }

    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      flushParagraph();
      closeLists();
      blocks.push('<hr>');
      continue;
    }

    const headingMatch = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      closeLists();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${applyInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (/^\s*>\s*/.test(line)) {
      flushParagraph();
      closeLists();
      blocks.push(`<blockquote>${applyInline(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph();
      if (inOl) {
        blocks.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        blocks.push('<ul>');
        inUl = true;
      }
      blocks.push(`<li>${applyInline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph();
      if (inUl) {
        blocks.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        blocks.push('<ol>');
        inOl = true;
      }
      blocks.push(`<li>${applyInline(line.replace(/^\s*\d+[.)]\s+/, ''))}</li>`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  closeLists();

  let html = blocks.join('');
  codeBlocks.forEach((block, index) => {
    const placeholder = `@@CODE_BLOCK_${index}@@`;
    html = html.split(placeholder).join(block);
  });

  tables.forEach((table, index) => {
    const placeholder = `@@TABLE_${index}@@`;
    html = html.split(placeholder).join(table);
  });

  return html;
};

sidePanelProto.renderMarkdownTable = function renderMarkdownTableProto(tableText: string): string {
  return renderMarkdownTableHtml(tableText, (value) => this.escapeHtmlBasic(value));
};
