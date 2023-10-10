import { Button, Modal, ModalVariant } from "@patternfly/react-core";
import React, { Dispatch, SetStateAction, useState } from "react";
import ProgressBar from './progress-bar';
import RemainingTime from './remaining-time';
import { CheckIcon } from "@patternfly/react-icons";
import ModalRestart from "./modal-restart";

import './progress-header.css';


export default function({sessionUuid, modules, progress, expirationTime, className, setIframeModule}: {sessionUuid: string, modules: {name: string, label?: string; validation_script?: string}[], progress: {current: string, inProgress: string[], notStarted: string[], completed: string[]}, expirationTime: number, className?: string, setIframeModule: Dispatch<SetStateAction<string>>}) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isModalRestartOpen, setIsModalRestartOpen] = useState(false);

    function handleModalToggle() {
        setIsModalOpen(!isModalOpen);
    }
    function handleModalRestartToggle() {
        setIsModalRestartOpen(!isModalRestartOpen);
    }
    function handleGoTo(m: string) {
        setIframeModule(m);
        handleModalToggle();
    }

    return <>
        <Button className={className || ''} variant="plain" onClick={handleModalToggle}>
            <ProgressBar modules={modules} progress={progress} />
            {!isNaN(expirationTime) ? <RemainingTime expirationTime={expirationTime} /> : null}
        </Button>
        <Modal
            title="Progress"
            isOpen={isModalOpen}
            onClose={handleModalToggle}
            variant={ModalVariant.medium}
            actions={[
                <Button key="restart" variant="primary" onClick={handleModalToggle}>
                    Close
                </Button>,
                sessionUuid ? <Button key="restart" variant="secondary" onClick={handleModalRestartToggle}>
                    Restart
                </Button> : null
            ]}
        >
            <div className="progress-modal">
                <ul>{modules.map((m) => <li className={progress.current === m.name ? 'is-current' : progress.completed.includes(m.name) ? 'completed' : 'not-started'} key={m.name}>
                    {progress.completed.includes(m.name) ? <CheckIcon width="24" /> : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="4" fill="currentColor"></circle></svg>}{progress.completed.includes(m.name) ? <Button variant="plain" onClick={() => handleGoTo(m.name)}>{m.label || m.name}</Button>:m.label || m.name}
                </li>)}</ul>
            </div>
        </Modal>
        <ModalRestart showWarning={true} isModalRestartOpen={isModalRestartOpen} setIsModalRestartOpen={setIsModalRestartOpen} sessionUuid={sessionUuid} />
    </>
}