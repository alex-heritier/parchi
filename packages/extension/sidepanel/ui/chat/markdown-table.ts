export const renderMarkdownTable = (tableText: string, escapeHtmlBasic: (value: string) => string): string => {
  const escape = (value = '') => escapeHtmlBasic(value);

  const applyCell = (value = '') => {
    let html = escape(value);
    const inlineCode: string[] = [];
    html = html.replace(/`([^`]+)`/g, (_: string, code: string) => {
      const ph = `@@TCODE${inlineCode.length}@@`;
      inlineCode.push(`<code>${code}</code>`);
      return ph;
    });
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_: string, label: string, url: string) =>
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
    );
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    html = html.replace(/(?<!\*)\*(?!\s)(.+?)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/(?<!_)_(?!\s)(.+?)_(?!_)/g, '<em>$1</em>');
    inlineCode.forEach((codeBlock, i) => {
      html = html.split(`@@TCODE${i}@@`).join(codeBlock);
    });
    return html;
  };

  const lines = tableText
    .trim()
    .split('\n')
    .filter((line) => line.trim());
  if (lines.length < 2) return `<p>${escape(tableText)}</p>`;

  const headerLine = lines[0];
  const headers = headerLine
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell);

  const separatorLine = lines[1];
  const isSeparator = /^\s*[-:|\s]+$/.test(separatorLine);

  const bodyStartIndex = isSeparator ? 2 : 1;
  const bodyLines = lines.slice(bodyStartIndex);

  if (headers.length === 0) return `<p>${escape(tableText)}</p>`;

  let html = '<div class="table-wrapper"><table class="markdown-table">';

  html += '<thead><tr>';
  headers.forEach((header) => {
    html += `<th>${applyCell(header)}</th>`;
  });
  html += '</tr></thead>';

  if (bodyLines.length > 0) {
    html += '<tbody>';
    bodyLines.forEach((rowLine) => {
      const cells = rowLine
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell);

      if (cells.length > 0) {
        html += '<tr>';
        cells.forEach((cell, idx) => {
          const tag = idx === 0 ? 'th' : 'td';
          html += `<${tag}>${applyCell(cell)}</${tag}>`;
        });
        for (let i = cells.length; i < headers.length; i++) {
          html += '<td></td>';
        }
        html += '</tr>';
      }
    });
    html += '</tbody>';
  }

  html += '</table></div>';
  return html;
};
