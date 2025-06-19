import { Button, Modal, ModalFooter, ModalBody, ModalHeader, ModalVariant } from '@patternfly/react-core';
import React, { Dispatch, SetStateAction, useState } from 'react';
import ProgressBar from './progress-bar';
import RemainingTime from './remaining-time';
import { CheckIcon } from '@patternfly/react-icons';
import { TModule } from './types';
import { exitLab, restartLab } from './utils';

import './progress-header.css';

export default function ({
  sessionUuid,
  modules,
  progress,
  expirationTime,
  setIframeModule,
}: {
  sessionUuid: string;
  modules: TModule[];
  progress: { current: string; inProgress: string[]; notStarted: string[]; completed: string[] };
  expirationTime: number;
  setIframeModule: Dispatch<SetStateAction<string>>;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  function handleModalToggle() {
    setIsModalOpen(!isModalOpen);
  }
  function handleModalRestartToggle() {
    restartLab();
  }
  function handleGoTo(m: string) {
    setIframeModule(m);
    handleModalToggle();
  }
  function handleModalStopToggle() {
    exitLab();
  }

  return (
    <>
      <a href="#" className="progress-header--inner" onClick={handleModalToggle}>
        <ProgressBar modules={modules} progress={progress} />
        {!isNaN(expirationTime) ? <RemainingTime expirationTime={expirationTime} /> : null}
      </a>
      <Modal title="Progress" isOpen={isModalOpen} onClose={handleModalToggle} variant={ModalVariant.medium}>
        <ModalHeader title="Progress" />
        <ModalBody className="progress-modal">
          <ul>
            {modules.map((m) => (
              <li
                className={
                  progress.current === m.name
                    ? 'is-current'
                    : progress.completed.includes(m.name)
                    ? 'completed'
                    : 'not-started'
                }
                key={m.name}
              >
                {progress.completed.includes(m.name) ? (
                  <CheckIcon width="24" />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="4" fill="currentColor"></circle>
                  </svg>
                )}
                {progress.completed.includes(m.name) ? (
                  <Button variant="plain" onClick={() => handleGoTo(m.name)}>
                    {m.label || m.name}
                  </Button>
                ) : (
                  m.label || m.name
                )}
              </li>
            ))}
          </ul>
        </ModalBody>
        <ModalFooter>
          <Button key="restart" variant="primary" onClick={handleModalToggle}>
            Close
          </Button>
          {sessionUuid ? (
            <Button key="restart" variant="secondary" onClick={handleModalRestartToggle}>
              Restart
            </Button>
          ) : null}
        </ModalFooter>
      </Modal>
      {sessionUuid ? (
        <Button key="stop" variant="secondary" size="sm" onClick={handleModalStopToggle}>
          Exit
        </Button>
      ) : null}
    </>
  );
}
