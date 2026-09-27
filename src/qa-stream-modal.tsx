/**
 * QaStreamModal — streams a qa-automation stage's output live via SSE.
 *
 * Opened from ViewSwitcher's dev-mode buttons. Opens in an idle
 * confirmation state and only starts the stream (and on Retry, restarts
 * it) once the user explicitly clicks Run — connecting the EventSource is
 * what actually kicks off the automation script on the server, so this
 * gate prevents e.g. an e2e run (which can complete the workshop) or a
 * healthcheck from firing just because the modal was opened. Once running,
 * shows the endpoint being called and renders output into a
 * terminal-style console pane.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button, Modal, ModalHeader, ModalBody, ModalFooter } from '@patternfly/react-core';
import { formatStageLabel } from './utils';
import './qa-stream-modal.css';

export type QaStreamModalProps = {
  /** qa-automation stage name, e.g. "healthcheck" or "e2e" */
  stage: string;
  onClose: () => void;
};

type RunState = 'idle' | 'running' | 'done' | 'error';

const STREAM_BASE = '/stream/qa';

/** DONE sentinel sent by the server as a plain (non-JSON) SSE data line. */
const DONE_SENTINEL = '__DONE__';

export default function QaStreamModal({ stage, onClose }: QaStreamModalProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [state, setState] = useState<RunState>('idle');
  const eventSourceRef = useRef<EventSource | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);

  const endpoint = `${STREAM_BASE}/${stage}`;
  const stageLabel = formatStageLabel(stage);

  function closeStream() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }

  function startStream() {
    closeStream();
    setLines([]);
    setState('running');

    const es = new EventSource(endpoint);
    eventSourceRef.current = es;

    es.onmessage = (event: MessageEvent) => {
      if (event.data === DONE_SENTINEL) {
        setState('done');
        closeStream();
        return;
      }
      let text: string = event.data;
      try {
        // Most lines are JSON-encoded (json.dumps) by the server; the
        // initial "Starting ..." line is plain text and will fail to parse.
        const parsed = JSON.parse(event.data);
        if (typeof parsed === 'string') text = parsed;
      } catch (_e) {
        // Not JSON — use the raw string as-is.
      }
      setLines((prev) => [...prev, text]);
    };

    es.onerror = () => {
      // EventSource auto-retries on error by default; explicitly close so a
      // server-side disconnect/503 doesn't silently keep reconnecting.
      setState('error');
      closeStream();
    };
  }

  // Does NOT auto-start the stream — the user must click Run to confirm.
  // Only responsible for cleanup (closing any open stream on unmount, or if
  // the stage prop itself somehow changes while mounted).
  useEffect(() => {
    return () => {
      closeStream();
    };
    // Only re-run if the stage itself changes; closeStream is stable within a mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [lines]);

  function handleRun() {
    startStream();
  }

  function handleRetry() {
    startStream();
  }

  function handleClose() {
    closeStream();
    onClose();
  }

  return (
    <Modal isOpen variant="medium" onClose={handleClose}>
      <ModalHeader
        title={stageLabel}
        description={<code className="qa-stream-modal__endpoint">GET {endpoint}</code>}
      />
      <ModalBody>
        {state === 'idle' ? (
          <div className="qa-stream-modal__confirm">
            Run {stageLabel} now? This executes the automation script against the live environment
            and may affect workshop progress.
          </div>
        ) : (
          <>
            <div className="qa-stream-modal__console" ref={consoleRef}>
              {lines.length === 0 ? (
                <div className="qa-stream-modal__placeholder">
                  {state === 'running' ? 'Waiting for output…' : 'No output.'}
                </div>
              ) : (
                lines.map((line, i) => (
                  <div key={i} className="qa-stream-modal__line">
                    {line}
                  </div>
                ))
              )}
            </div>
            {state === 'error' ? (
              <div className="qa-stream-modal__error">Connection lost or the stream failed. Click Retry to run again.</div>
            ) : null}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {state === 'idle' ? (
          <>
            <Button key="cancel" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            {/* "warning" (not "primary") per PatternFly guidance: reserved for
                significant actions — this runs the automation script against
                the live environment and, for stages like e2e, can complete
                the workshop. */}
            <Button key="run" variant="warning" onClick={handleRun}>
              Run
            </Button>
          </>
        ) : (
          <>
            <Button key="retry" variant="secondary" onClick={handleRetry} isDisabled={state === 'running'}>
              Retry
            </Button>
            <Button key="close" variant="primary" onClick={handleClose}>
              Close
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
