import { sidePanelProto } from './panel-tools-shared.js';

const DOWNLOAD_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const COPY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const HTML_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

type ContentKind = 'json' | 'html' | 'image' | 'text';

function detectContentKind(text: string): ContentKind {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      /* not json */
    }
  }
  if (trimmed.startsWith('data:image/')) return 'image';
  if (/^<(!doctype|html|head|body|div|svg|table|style)/i.test(trimmed)) return 'html';
  if (trimmed.includes('</') && trimmed.includes('>')) return 'html';
  return 'text';
}

function guessFilename(toolName: string, kind: ContentKind): string {
  const base = toolName.replace(/^browser_/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext: Record<ContentKind, string> = { json: '.json', html: '.html', image: '.png', text: '.txt' };
  return `${base}-output${ext[kind]}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMimeType(kind: ContentKind): string {
  const map: Record<ContentKind, string> = {
    json: 'application/json',
    html: 'text/html',
    image: 'image/png',
    text: 'text/plain',
  };
  return map[kind];
}

sidePanelProto.openFileViewer = function openFileViewer(
  content: string,
  toolName: string,
  _toolCallId?: string,
) {
  this.closeFileViewer();

  const kind = detectContentKind(content);
  const filename = guessFilename(toolName, kind);
  const sizeLabel = formatSize(new Blob([content]).size);

  const overlay = document.createElement('div');
  overlay.className = 'file-viewer';
  overlay.dataset.fileViewer = 'true';

  const backdrop = document.createElement('div');
  backdrop.className = 'file-viewer-backdrop';
  backdrop.addEventListener('click', () => this.closeFileViewer());
  overlay.appendChild(backdrop);

  const panel = document.createElement('div');
  panel.className = 'file-viewer-panel';
  overlay.appendChild(panel);

  // Header
  const header = document.createElement('div');
  header.className = 'file-viewer-header';
  header.innerHTML = `
    <div class="file-viewer-title">
      <div class="file-viewer-filename">${this.escapeHtml(filename)}</div>
      <div class="file-viewer-meta">${kind.toUpperCase()} · ${sizeLabel} · ${toolName}</div>
    </div>
    <div class="file-viewer-actions">
      <button class="file-viewer-btn file-viewer-btn-copy" title="Copy to clipboard">
        ${COPY_ICON} Copy
      </button>
      <button class="file-viewer-btn file-viewer-btn-download" title="Download file">
        ${DOWNLOAD_ICON} Download
      </button>
      ${kind === 'html' ? `<button class="file-viewer-btn file-viewer-btn-open" title="Open in new tab">${HTML_ICON} Open</button>` : ''}
      <button class="file-viewer-btn file-viewer-btn-close" title="Close">
        ${CLOSE_ICON}
      </button>
    </div>
  `;
  panel.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'file-viewer-body';
  panel.appendChild(body);

  if (kind === 'image') {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'file-viewer-image';
    const img = document.createElement('img');
    img.src = content.trim();
    img.alt = filename;
    imgWrap.appendChild(img);
    body.appendChild(imgWrap);
  } else if (kind === 'html') {
    const container = document.createElement('div');
    container.className = 'file-viewer-content-html';
    const iframe = document.createElement('iframe');
    iframe.sandbox.add('allow-same-origin');
    iframe.style.height = 'calc(100vh - 100px)';
    container.appendChild(iframe);
    body.appendChild(container);
    // Write content after appending to DOM
    requestAnimationFrame(() => {
      const doc = iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(content);
        doc.close();
      }
    });
  } else if (kind === 'json') {
    const pre = document.createElement('div');
    pre.className = 'file-viewer-content';
    try {
      pre.textContent = JSON.stringify(JSON.parse(content.trim()), null, 2);
    } catch {
      pre.textContent = content;
    }
    body.appendChild(pre);
  } else {
    const pre = document.createElement('div');
    pre.className = 'file-viewer-content';
    pre.textContent = content;
    body.appendChild(pre);
  }

  // Event handlers
  const copyBtn = header.querySelector('.file-viewer-btn-copy') as HTMLButtonElement | null;
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(content).then(() => {
        copyBtn.classList.add('copied');
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML = `${COPY_ICON} Copied!`;
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = orig;
        }, 1500);
      });
    });
  }

  const downloadBtn = header.querySelector('.file-viewer-btn-download') as HTMLButtonElement | null;
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const mime = getMimeType(kind);
      const blob = new Blob([content], { type: `${mime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    });
  }

  const openBtn = header.querySelector('.file-viewer-btn-open') as HTMLButtonElement | null;
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    });
  }

  const closeBtn = header.querySelector('.file-viewer-btn-close') as HTMLButtonElement | null;
  if (closeBtn) {
    closeBtn.addEventListener('click', () => this.closeFileViewer());
  }

  // Escape key
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.closeFileViewer();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
};

sidePanelProto.closeFileViewer = function closeFileViewer() {
  const existing = document.querySelector('.file-viewer');
  if (existing) existing.remove();
};
