import React, { useState, useRef } from "react";
import yaml from 'js-yaml';
import fetch from 'unfetch';
import useSWR from "swr";
import { Button, Form, FormGroup, Modal, ModalVariant, TextArea } from '@patternfly/react-core';
import Split from 'react-split';
import ProgressHeader from './progress-header';
import StarRating from "./star-rating";
import { CheckCircleIcon, WarningTriangleIcon } from "@patternfly/react-icons";
import ModalRestart from "./modal-restart";

import './app.css';

type tab = {name: string, url?: string, port?: string, secondary_port?: string, path?: string, secondary_path?: string, secondary_url?: string};

const protocol = window.location.protocol;
const hostname = window.location.hostname;

const createUrlsFromVars = (vars: tab): tab  => {
    if (vars.url) {
        return vars;
    }
    if (!vars.port) {
        throw Error('Port and url not defined') ;
    }
    return {
        ...vars,
        url: `${protocol}//${hostname}${vars.port ? ":" + vars.port : ''}${vars.path || ''}`,
        ...vars.secondary_path ? {secondary_url: `${protocol}//${hostname}${vars.secondary_port ? ":" + vars.secondary_port : ''}${vars.secondary_path || ''}`} : {}
    };
}

type Session = {sessionUuid: string, catalogItemName: string, start: string, stop?: string, state: string, lifespanEnd: string, labUserInterfaceUrl: string, completed?: boolean};

export default function() {
    const ref = useRef();
    const instructionsPanelRef = useRef();
    const searchParams = new URLSearchParams(document.location.search);
    const s = searchParams.get('s');
    const sessionIntend: Session = s ? JSON.parse(s) : null;
    const [session, setSession] = useState<Session>(sessionIntend);
    const [isModalRestartOpen, setIsModalRestartOpen] = useState(false);
    const [isModalRatingOpen, setIsModalRatingOpen] = useState(false);
    const [modalState, setModalState] = useState<{
        resourceClaimName?: string;
        rating?: {
          rate: number;
          comment: string;
        };
        submitDisabled: boolean;
      }>({ submitDisabled: false });
    const {data, error} = useSWR('./nookbag.yml', (url) => fetch(url).then(r => r.text()), { suspense: true });
    const config = yaml.load(data) as {antora: { modules: {name: string, validation_script?: string}[], name: string, dir?: string, version: string }, tabs: tab[]};
    const modules = config.antora.modules;
    const antoraDir = config.antora.dir || 'antora';
    const version = config.antora.version;
    const s_name = config.antora.name;
    const tabs = config.tabs.map(s => createUrlsFromVars(s));
    const [progress, setProgress] = useState({inProgress: [], completed: [], notStarted: modules.map(x => x.name), current: modules[0].name});
    const [currentTab, setCurrentTab] = useState(tabs?.[0]);
    const [iframeModule, setIframeModule] = useState(modules[0].name);
    const currIndex = modules.findIndex(m => m.name === progress.current);
    const initialFile = `./${antoraDir}/${s_name ? s_name + "/" : ''}${version ? version + "/": ''}${iframeModule}.html`;
    const isCompleted = session?.completed ?? false;
    const isExpired = session?.lifespanEnd ? new Date(session?.lifespanEnd).getTime() <= new Date().getTime() : false;

    function onPageChange() {
        if (ref.current) {
            const iframe = ref.current as HTMLIFrameElement;
            const page = iframe.contentWindow.location.pathname.split('/');
            let key = "";
            if (page[page.length - 2] === version) {
                key = page[page.length - 1].split(".")[0]
            } else {
                key = `${page[page.length - 2]}/${page[page.length - 1].split(".")[0]}`
            }
            const _progress = {...progress};
            let pivotPassed = false;
            modules.forEach(m => {
                if (m.name === key) {
                    pivotPassed = true;
                } else if (pivotPassed) {
                    _progress.notStarted.push(m.name)
                } else {
                    _progress.completed.push(m.name)
                }

            })
            _progress.inProgress = [key]
            _progress.current = key
            /*if (m.validation_script) {
                // TODO: hit api to execute validation
            }*/
            setProgress(_progress);
        }
    }

    function handleTabClick(tab: tab) {
        setCurrentTab(tab)
    }

    function handleNext() {
        if (currIndex+1 < modules.length) {
            setIframeModule(modules[currIndex+1].name);
            if (instructionsPanelRef.current) {
                const instructionsPanel = instructionsPanelRef.current as HTMLDivElement;
                instructionsPanel.scrollTo(0, 0);
            }
        } else {
            setSession({...session, completed: true});
            setIsModalRatingOpen(true);
        }
    }

    function handleSubmitRating() {
        setIsModalRatingOpen(false);
    }

    if (error) {
        return <div>Configuration file not defined</div>
    }

    return <div className="app-wrapper">
            {isCompleted ? <div className="app-wrapper__inner app__lab-completed">
                    <div className="app-wrapper__title">
                        <CheckCircleIcon />
                        <p className="app-wrapper__title-text">Lab completed.</p>
                    </div>
                    <div className="app-wrapper__content">
                        <p>If you want to try again, please restart the Lab.</p>
                        <Button className="app-wrapper__restart-btn" onClick={() => setIsModalRestartOpen(true)}>Restart</Button>
                    </div>
                </div> : isExpired ? <div className="app-wrapper__inner app__lab-expired">
                        <div className="app-wrapper__title">
                            <WarningTriangleIcon />
                            <p className="app-wrapper__title-text">Your session expired.</p>
                        </div>
                        <div className="app-wrapper__content">
                            <p>If you want to try again, please restart the Lab.</p>
                            <Button className="app-wrapper__restart-btn" onClick={() => setIsModalRestartOpen(true)}>Restart</Button>
                        </div>
                </div> :
                <Split
                    sizes={[25, 75]}
                    minSize={100}
                    gutterSize={1}
                    direction="horizontal"
                    cursor="col-resize"
                    style={{display: 'flex', flexDirection: 'row'}}>
                    <div className="split left" ref={instructionsPanelRef}>
                        <div className="app__toolbar">
                            <ProgressHeader sessionUuid={session?.sessionUuid} className="app__toolbar--inner" modules={modules} progress={progress} expirationTime={Date.parse(session?.lifespanEnd)} setIframeModule={setIframeModule} />
                        </div>
                        <iframe ref={ref}  src={initialFile} onLoad={onPageChange} width="100%" className="app__instructions" height="100%"></iframe>
                        <div className="app-iframe__inner">
                            <Button onClick={handleNext}>{currIndex+1 < modules.length ? 'Next':'End'}</Button>
                        </div>
                    </div>
                    <div className="split right">
                        <div className="tab">
                            {tabs.map(s => <Button variant="plain" isActive={s.name === currentTab.name} key={s.name} className="tablinks" onClick={() => handleTabClick(s)}>{s.name}</Button>)}
                        </div>
                        <div className="tabcontent">
                            {currentTab.secondary_url ?
                            <>
                                <div className="split top">
                                    <iframe src={currentTab.url} width="100%"></iframe>
                                </div>
                                <div className="split bottom">
                                    <iframe src={currentTab.secondary_url} width="100%"></iframe>
                                </div>
                            </>
                            :
                            <iframe src={currentTab.url} height="100%" width="100%"></iframe>}
                        </div>
                    </div>
                </Split>
            }
            <Modal variant={ModalVariant.small} title="Lab Completed" isOpen={isModalRatingOpen} onClose={() => setIsModalRatingOpen(false)} actions={[
                <Button key="submit" variant="primary" onClick={handleSubmitRating} isDisabled={modalState.submitDisabled}>
                    Submit
                </Button>
            ]}>
                <Form>
                    <FormGroup
                        fieldId="rating"
                        label="How would you rate the quality of the supporting materials for this asset?"
                    >
                        <StarRating count={5} rating={modalState.rating?.rate} onRating={(rate) => setModalState({...modalState, rating: {...modalState.rating, rate}})} />
                    </FormGroup>
                    <FormGroup
                        fieldId="comment"
                        label={<span>Additional information</span>}
                        isRequired={modalState.submitDisabled}
                    >
                        <TextArea
                            id="comment"
                            onChange={(comment) => {
                                const rating = { ...modalState.rating, comment };
                                setModalState({
                                ...modalState,
                                rating,
                                submitDisabled:
                                    Number.isFinite(rating.rate) && rating.rate < 3 ? !comment || comment.trim() === '' : false,
                                });
                            }}
                            value={modalState.rating?.comment || ''}
                            placeholder="Add comment"
                            aria-label="Add comment"
                            isRequired={modalState.submitDisabled}
                        />
                    </FormGroup>
                </Form>
            </Modal>
            <ModalRestart isModalRestartOpen={isModalRestartOpen} showWarning={false} setIsModalRestartOpen={setIsModalRestartOpen} sessionUuid={session?.sessionUuid} />
        </div>
}