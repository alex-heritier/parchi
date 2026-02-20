import type { RecordedContext, RecordingScreenshot } from '../../../../shared/src/recording.js';
import { SidePanelUI } from '../core/panel-ui.js';

const formatTime = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
};

(SidePanelUI.prototype as any).startRecording = async function startRecording() {
  if (this.recordingState.status !== 'idle') return;
  this.recordingState.status = 'recording';
  this.recordingState.elapsedMs = 0;

  // Update UI
  this.elements.recordBtn?.classList.add('recording');
  this.showRecordingTimer();

  try {
    const response = await chrome.runtime.sendMessage({ type: 'recording_start' });
    if (response && response.success === false) {
      throw new Error(response.error || 'Recording failed');
    }
  } catch (err: any) {
    this.cleanupRecordingUI();
    this.updateStatus('Recording failed: ' + (err.message || err), 'error');
    return;
  }

  // Start local timer only after background confirms success
  this.recordingState.timerId = window.setInterval(() => {
    this.recordingState.elapsedMs += 1000;
    this.renderRecordingTimer(this.recordingState.elapsedMs);
    if (this.recordingState.elapsedMs >= 60000) {
      this.stopRecording();
    }
  }, 1000);
};

(SidePanelUI.prototype as any).stopRecording = async function stopRecording() {
  if (this.recordingState.status !== 'recording') return;
  this.recordingState.status = 'selecting';

  if (this.recordingState.timerId) {
    clearInterval(this.recordingState.timerId);
    this.recordingState.timerId = null;
  }

  this.elements.recordBtn?.classList.remove('recording');
  this.hideRecordingTimer();

  try {
    await chrome.runtime.sendMessage({ type: 'recording_stop' });
  } catch (err: any) {
    this.cleanupRecordingUI();
    this.updateStatus('Stop failed: ' + (err.message || err), 'error');
  }
};

(SidePanelUI.prototype as any).cleanupRecordingUI = function cleanupRecordingUI() {
  if (this.recordingState.timerId) {
    clearInterval(this.recordingState.timerId);
  }
  this.recordingState = { status: 'idle', elapsedMs: 0, timerId: null };
  this.elements.recordBtn?.classList.remove('recording');
  this.hideRecordingTimer();
};

(SidePanelUI.prototype as any).showRecordingTimer = function showRecordingTimer() {
  const el = this.elements.recordingTimer;
  if (el) {
    el.classList.remove('hidden');
    this.renderRecordingTimer(0);
  }
};

(SidePanelUI.prototype as any).hideRecordingTimer = function hideRecordingTimer() {
  const el = this.elements.recordingTimer;
  if (el) el.classList.add('hidden');
};

(SidePanelUI.prototype as any).renderRecordingTimer = function renderRecordingTimer(elapsedMs: number) {
  const timeEl = this.elements.recordingTimer?.querySelector('.recording-time');
  if (timeEl) {
    timeEl.textContent = `${formatTime(elapsedMs)} / 1:00`;
  }
};

(SidePanelUI.prototype as any).showImagePicker = function showImagePicker(screenshots: RecordingScreenshot[]) {
  const modal = this.elements.imagePickerModal;
  const grid = this.elements.imagePickerGrid;
  if (!modal || !grid) return;

  grid.innerHTML = '';
  const selected = new Set<string>();

  for (const ss of screenshots) {
    const cell = document.createElement('div');
    cell.className = 'image-picker-cell';
    cell.dataset.id = ss.id;

    const img = document.createElement('img');
    img.src = ss.dataUrl;
    img.alt = `Screenshot ${ss.index + 1}`;

    const timestamp = document.createElement('span');
    timestamp.className = 'image-picker-timestamp';
    timestamp.textContent = formatTime(ss.timestamp - (screenshots[0]?.timestamp || ss.timestamp));

    const badge = document.createElement('span');
    badge.className = 'image-picker-badge hidden';

    cell.appendChild(img);
    cell.appendChild(timestamp);
    cell.appendChild(badge);

    cell.addEventListener('click', () => {
      if (selected.has(ss.id)) {
        selected.delete(ss.id);
        cell.classList.remove('selected');
        badge.classList.add('hidden');
      } else if (selected.size < 5) {
        selected.add(ss.id);
        cell.classList.add('selected');
        badge.classList.remove('hidden');
      }
      // Renumber badges
      let n = 1;
      for (const s of screenshots) {
        if (selected.has(s.id)) {
          const c = grid.querySelector(`[data-id="${s.id}"] .image-picker-badge`) as HTMLElement | null;
          if (c) { c.textContent = String(n); c.classList.remove('hidden'); }
          n++;
        }
      }
      this.updateImagePickerCount(selected.size);
    });

    grid.appendChild(cell);
  }

  this.updateImagePickerCount(0);
  modal.classList.remove('hidden');

  // Wire buttons
  const cancel = this.elements.imagePickerCancel;
  const confirm = this.elements.imagePickerConfirm;
  const backdrop = modal.querySelector('.image-picker-backdrop');

  const close = () => {
    modal.classList.add('hidden');
    this.cleanupRecordingUI();
    chrome.runtime.sendMessage({ type: 'recording_discard' }).catch(() => {});
  };

  const doConfirm = () => {
    modal.classList.add('hidden');
    const ids = Array.from(selected) as string[];
    if (ids.length === 0) {
      close();
      return;
    }
    chrome.runtime.sendMessage({ type: 'recording_select_images', selectedIds: ids }).catch(() => {});
  };

  // Replace listeners (simple approach: clone and replace)
  if (cancel) {
    const newCancel = cancel.cloneNode(true) as HTMLElement;
    cancel.replaceWith(newCancel);
    this.elements.imagePickerCancel = newCancel;
    newCancel.addEventListener('click', close);
  }
  if (confirm) {
    const newConfirm = confirm.cloneNode(true) as HTMLElement;
    confirm.replaceWith(newConfirm);
    this.elements.imagePickerConfirm = newConfirm;
    newConfirm.addEventListener('click', doConfirm);
  }
  if (backdrop) {
    const newBackdrop = backdrop.cloneNode(true) as HTMLElement;
    backdrop.replaceWith(newBackdrop);
    newBackdrop.addEventListener('click', close, { once: true });
  }
};

(SidePanelUI.prototype as any).updateImagePickerCount = function updateImagePickerCount(count: number) {
  const el = this.elements.imagePickerCount;
  if (el) el.textContent = `${count} / 5`;
};

(SidePanelUI.prototype as any).attachRecordedContext = function attachRecordedContext(context: RecordedContext) {
  this.pendingRecordedContext = context;
  this.showRecordedContextBadge();
};

(SidePanelUI.prototype as any).removeRecordedContext = function removeRecordedContext() {
  this.pendingRecordedContext = null;
  this.hideRecordedContextBadge();
};

(SidePanelUI.prototype as any).showRecordedContextBadge = function showRecordedContextBadge() {
  const badge = this.elements.recordedContextBadge;
  if (badge) badge.classList.remove('hidden');
};

(SidePanelUI.prototype as any).hideRecordedContextBadge = function hideRecordedContextBadge() {
  const badge = this.elements.recordedContextBadge;
  if (badge) badge.classList.add('hidden');
};

(SidePanelUI.prototype as any).handleRecordingMessage = function handleRecordingMessage(message: any) {
  switch (message.type) {
    case 'recording_tick': {
      if (this.recordingState.status === 'recording') {
        this.recordingState.elapsedMs = message.elapsedMs;
        // Local timer already handles display; this keeps in sync
      }
      break;
    }
    case 'recording_complete': {
      this.showImagePicker(message.screenshots);
      break;
    }
    case 'recording_context_ready': {
      this.attachRecordedContext(message.context);
      this.updateStatus('Recording attached', 'success');
      break;
    }
    case 'recording_error': {
      this.cleanupRecordingUI();
      this.updateStatus('Recording error: ' + message.message, 'error');
      break;
    }
  }
};
