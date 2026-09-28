/**
 * AutomationLogDrawer — dev-only, read-only view of recent setup/validation/
 * solve automation calls (module, stage, mode, status, output).
 *
 * Opened from ViewSwitcher's "Automation (dev)" section via the "Log"
 * button. Unlike QaStreamModal, this is purely passive — it never triggers
 * a call itself, it only displays entries that app.tsx already recorded to
 * the AutomationLogEntry[] list (see view-switcher.tsx). Exists so devs can
 * see Background-mode (and previously-silent Normal-mode setup) call
 * results without opening the browser Console/Network tab.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Button, Modal, ModalHeader, ModalBody, ModalFooter } from '@patternfly/react-core';
import { CopyIcon, CheckIcon } from '@patternfly/react-icons';
import { formatStageLabel } from './utils';
import { AutomationLogEntry } from './view-switcher';
import './automation-log-drawer.css';

export type AutomationLogDrawerProps = {
  entries: AutomationLogEntry[];
  onClose: () => void;
};

const STATUS_LABEL: Record<AutomationLogEntry['status'], string> = {
  running: 'Running',
  successful: 'Success',
  failed: 'Failed',
};

const MODE_LABEL: Record<AutomationLogEntry['mode'], string> = {
  normal: 'Normal',
  background: 'Background',
  disabled: 'Disabled',
};

/**
 * Copies `text` to the clipboard. Prefers the async Clipboard API; falls
 * back to a hidden textarea + execCommand('copy') for environments where
 * navigator.clipboard is unavailable (e.g. non-secure/http contexts).
 */
async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_e) {
      // Fall through to the execCommand fallback below.
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch (_e) {
    // no-op — best effort
  }
  document.body.removeChild(textarea);
}

/**
 * Renders a scrollable, monospace text block (Output / Ansible job log)
 * with a small copy-to-clipboard icon button overlaid in the corner.
 */
function CopyableBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending "reset to un-copied" timer on unmount, so we never
  // call setState after the drawer has already been closed (React docs:
  // timers scheduled from an event handler should still be cleared the
  // same way an effect's own timer would be).
  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  function handleCopy() {
    copyToClipboard(text).then(() => {
      setCopied(true);
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="automation-log__output-body">
      <Button
        variant="plain"
        size="sm"
        aria-label={copied ? `Copied ${label}` : `Copy ${label} to clipboard`}
        className="automation-log__copy-btn"
        // Icons render as <svg fill="currentColor">, and PatternFly's
        // "plain" Button variant applies its own icon color (tuned for
        // icons on light surfaces). Passing `color` directly to the icon
        // — the same pattern already used elsewhere in this codebase
        // (see <RedoIcon color="grey" /> in app.tsx) — sets it straight on
        // the svg, which is the idiomatic PatternFly way to override icon
        // color rather than fighting the button's own styles with CSS.
        icon={copied ? <CheckIcon color="#f0f0f0" /> : <CopyIcon color="#f0f0f0" />}
        onClick={handleCopy}
      />
      <pre>{text}</pre>
    </div>
  );
}

/** Short "Xs/Xm/Xh ago" relative timestamp, consistent with a dev-facing log. */
function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr}h ago`;
}

export default function AutomationLogDrawer({ entries, onClose }: AutomationLogDrawerProps) {
  // Newest first; does not mutate the prop array.
  const ordered = [...entries].reverse();

  return (
    <Modal isOpen variant="medium" onClose={onClose}>
      <ModalHeader
        title="Automation Activity (dev)"
        description="Recent setup/validation/solve calls — recorded for both Normal and Background modes."
      />
      <ModalBody>
        {ordered.length === 0 ? (
          <div className="automation-log__placeholder">No automation calls yet.</div>
        ) : (
          <ul className="automation-log__list">
            {ordered.map((entry) => {
              // Narrowed to stable consts so TS treats them as definitely
              // string (not string | undefined) inside CopyableBlock props —
              // narrowing on the `entry.*` property itself wouldn't survive
              // into that nested component's closures.
              const output = entry.output;
              const jobLog = entry.jobLog;
              return (
              <li
                key={entry.id}
                className={`automation-log__entry automation-log__entry--${entry.status}`}
              >
                <div className="automation-log__row">
                  <span className="automation-log__time">{formatRelativeTime(entry.timestamp)}</span>
                  <span className="automation-log__module">{entry.module}</span>
                  <span className="automation-log__stage">{formatStageLabel(entry.stage)}</span>
                  <span className="automation-log__badge automation-log__badge--mode">
                    {MODE_LABEL[entry.mode]}
                  </span>
                  <span
                    className={`automation-log__badge automation-log__badge--status automation-log__badge--${entry.status}`}
                  >
                    {STATUS_LABEL[entry.status]}
                  </span>
                </div>
                <code className="automation-log__endpoint">{entry.endpoint}</code>
                {output ? (
                  <details className="automation-log__output">
                    <summary>Output</summary>
                    <CopyableBlock text={output} label="output" />
                  </details>
                ) : null}
                {jobLog ? (
                  <details className="automation-log__output">
                    <summary>Ansible job log</summary>
                    <CopyableBlock text={jobLog} label="Ansible job log" />
                  </details>
                ) : null}
              </li>
              );
            })}
          </ul>
        )}
      </ModalBody>
      <ModalFooter>
        <Button key="close" variant="primary" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}
