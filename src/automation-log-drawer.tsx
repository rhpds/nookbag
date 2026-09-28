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
import React from 'react';
import { Button, Modal, ModalHeader, ModalBody, ModalFooter } from '@patternfly/react-core';
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
            {ordered.map((entry) => (
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
                {entry.output ? (
                  <details className="automation-log__output">
                    <summary>Output</summary>
                    <pre>{entry.output}</pre>
                  </details>
                ) : null}
              </li>
            ))}
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
