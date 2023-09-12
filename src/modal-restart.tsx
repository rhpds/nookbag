import { Button, Modal, ModalVariant } from "@patternfly/react-core";
import React, { useState } from "react";
import { apiPaths, publicFetcher } from "./api";

export default function({sessionUuid, isModalRestartOpen, setIsModalRestartOpen}: {sessionUuid: string, isModalRestartOpen: boolean, setIsModalRestartOpen: React.Dispatch<React.SetStateAction<boolean>>}) {
    const [isRestartDisabled, setIsRestartDisabled] = useState(false);

    function handleModalRestartToggle() {
        setIsModalRestartOpen(!isModalRestartOpen);
    }
    function handleRestart() {
        setIsRestartDisabled(true);
        publicFetcher(apiPaths.PROVISION({name: sessionUuid}), {method: 'DELETE'}).then(_ => {
            console.log('Posting message: RESTART')
            window.parent.postMessage("RESTART", "*");
        });
    }

    if(!sessionUuid) {
        return <p>Error</p>
    }

    return <>
        <Modal variant={ModalVariant.small} title="Do you want to restart?" isOpen={isModalRestartOpen} onClose={handleModalRestartToggle} actions={[
            <Button key="restart" variant="primary" onClick={handleRestart} isDisabled={isRestartDisabled}>
                Restart
            </Button>,
            <Button key="cancel" variant="secondary" onClick={handleModalRestartToggle}>
                Cancel
            </Button>
        ]}>
            <p>This will drop the current progress. You can’t undo this. You will have to start from the beginning.</p>
        </Modal>
    </>
}