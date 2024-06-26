import React, { useState, useRef, useEffect } from "react";
import yaml from 'js-yaml';
import fetch from 'unfetch';
import useSWR from "swr";
import { Alert, AlertActionCloseButton, Button, Tab, Tabs } from '@patternfly/react-core';
import Split from 'react-split';
import ProgressHeader from './progress-header';
import { executeStageAndGetStatus } from "./utils";
import Loading from './loading';
import './app.css';

type TTab = {name: string, url?: string, port?: string, secondary_port?: string, path?: string, secondary_path?: string, secondary_url?: string};
type TProgress = {
    inProgress: any[];
    completed: any[];
    notStarted: string[];
    current: string;
};
const protocol = window.location.protocol;
const hostname = window.location.hostname;

const createUrlsFromVars = (vars: TTab): TTab  => {
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
    const [loaderStatus, setLoaderStatus] = useState<{isLoading: boolean, stage: 'setup' | 'validation' | 'solve' | null}>({ isLoading: false, stage: null });
    const searchParams = new URLSearchParams(document.location.search);
    const s = searchParams.get('s');
    const session: Session = s ? JSON.parse(s) : null;
    const {data: dataResponses, error} = useSWR(['./zero-config.yaml', './zero-config.yml', './zero-touch-config.yaml','./zero-touch-config.yml', './nookbag.yml'], (urls) => Promise.all(urls.map(url => fetch(url))).then((responses) => Promise.all(
            responses
              .map((response) => {
                  if (response.status === 200) {
                    return response.text();
                  }
                  return null;
              })
          )).catch(null), { suspense: true });
    const data = dataResponses.find(Boolean);
    if (!data) throw new Error();
    const config = yaml.load(data) as {antora: { modules: {name: string, validation_script?: string}[], name: string, dir?: string, version: string }, tabs: TTab[]};
    const modules = config.antora.modules;
    const antoraDir = config.antora.dir || 'antora';
    const version = config.antora.version;
    const s_name = config.antora.name;
    const [validationMsg, setValidationMsg] = useState<{type: 'error'|'success', message: string}>(null);
    const tabs = config.tabs.map(s => createUrlsFromVars(s));
    const PROGRESS_KEY = session ? `PROGRESS-${session.sessionUuid}` : null;
    const initProgressStr = PROGRESS_KEY ? window.localStorage.getItem(PROGRESS_KEY) : null;
    const initProgress: TProgress = initProgressStr ? JSON.parse(initProgressStr) : null;
    const [progress, setProgress] = useState(initProgress ?? {inProgress: [], completed: [], notStarted: modules.map(x => x.name), current: modules[0].name});
    const [currentTabName, setCurrentTabName] = useState(tabs[0] ? tabs[0].name : null);
    const [iframeModule, setIframeModule] = useState(progress.current);
    const currIndex = modules.findIndex(m => m.name === progress.current);
    const initialFile = `./${antoraDir}/${s_name ? s_name + "/" : ''}${version ? version + "/": ''}${iframeModule}.html`;

    useEffect(() =>  {
        if (session?.sessionUuid && PROGRESS_KEY) {
            window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
        }
    }, [progress]);

    function onPageChange() {
        if (ref.current) {
            const iframe = ref.current as HTMLIFrameElement;
            const page = iframe.contentWindow.location.pathname.split('/');
            let key = "";
            if (page[page.length - 2] === version || !version) {
                key = page[page.length - 1].split(".")[0];
            } else {
                key = `${page[page.length - 2]}/${page[page.length - 1].split(".")[0]}`;
            }
            const _progress = {...progress};
            let pivotPassed = false;
            modules.forEach(m => {
                if (m.name === key) {
                    pivotPassed = true;
                } else if (pivotPassed) {
                    _progress.notStarted.push(m.name);
                } else {
                    _progress.completed.push(m.name);
                }

            })
            _progress.inProgress = [key];
            _progress.current = key;
            setLoaderStatus({ isLoading: true, stage: 'setup' });
            const executeStageAndGetStatusPromise = executeStageAndGetStatus(key, 'setup');
            const minTimeout = new Promise((resolve) => setTimeout(() => resolve(null), 500));
            Promise.all([executeStageAndGetStatusPromise, minTimeout]).then(_ => {
                setProgress(_progress);
                setLoaderStatus({ isLoading: false, stage: null });
            }).catch(() => {
                setProgress(_progress);
                setLoaderStatus({ isLoading: false, stage: null });
            });
        }
    }

    function handleTabClick(event: React.MouseEvent<HTMLElement, MouseEvent>, tabIndex: string | number) {
        setCurrentTabName(String(tabIndex));
    }

    function goToTop() {
        if (instructionsPanelRef.current) {
            const instructionsPanel = instructionsPanelRef.current as HTMLDivElement;
            instructionsPanel.scrollTo(0, 0);
        }
    }

    function handlePrevious() {
        if (currIndex > 0) {
            setValidationMsg(null);
            setIframeModule(modules[currIndex-1].name);
            goToTop();
        }
    }

    async function handleNext() {
        setValidationMsg(null);
        setLoaderStatus({ isLoading: true, stage: 'validation' });
        const executeStageAndGetStatusPromise = executeStageAndGetStatus(modules[currIndex].name, 'validation');
        const minTimeout = new Promise((resolve) => setTimeout(() => resolve(null), 500));
        const [res] = await Promise.all([executeStageAndGetStatusPromise, minTimeout]);
        if (res.Status === 'successful') {
            if (currIndex+1 < modules.length) {
                setIframeModule(modules[currIndex+1].name);
                goToTop();
            } else {
                setLoaderStatus({ isLoading: false, stage: null });
                setValidationMsg({message:'Lab completed!', type: 'success'});
                window.parent.postMessage("COMPLETED", "*");
            }
        } else {
            setLoaderStatus({ isLoading: false, stage: null });
            setValidationMsg({message: res.Output || '', type:'error'});
        }
    }

    if (error) {
        return <div>Configuration file not defined</div>
    }

    return <div>
            <Loading text={loaderStatus.stage === 'setup' ? 'Environment loading... almost ready!' : loaderStatus.stage === 'validation' ? 'Validating... standby.' : loaderStatus.stage === 'solve' ? 'Solving... standby.' : 'Loading...'} isVisible={loaderStatus.isLoading} />
            <div className="app-wrapper">
                <Split
                    sizes={tabs.length > 0 ? [25, 75] : [100]}
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
                            {currIndex > 0 ? <Button onClick={handlePrevious} className="lab-actions__previous">Previous</Button> : null}
                            <Button style={{marginLeft: 'auto'}} className="lab-actions__next" onClick={handleNext}>{currIndex+1 < modules.length ? 'Next':'End'}</Button>
                        </div>
                        {validationMsg ? <Alert variant={validationMsg.type === 'error' ? 'danger':'success'} title={validationMsg.type === 'error'?'Validation Error':'Lab Completed'} actionClose={<AlertActionCloseButton onClose={() => setValidationMsg(null)} />} >{validationMsg.message}</Alert>:null}
                    </div>
                    {tabs.length > 0 ? <div className="split right">
                        {tabs.length > 1 ? 
                        <Tabs activeKey={currentTabName} onSelect={handleTabClick}>
                            {tabs.map(s => <Tab eventKey={s.name} title={s.name} className="tablinks"></Tab>)}
                        </Tabs> : null}
                        {tabs.map(tab => <div className={`tabcontent${tab.name === currentTabName ? ' active':''}`}>
                            {tab.secondary_url ?
                            <>
                                <div className="split top">
                                    <iframe src={tab.url} width="100%"></iframe>
                                </div>
                                <div className="split bottom">
                                    <iframe src={tab.secondary_url} width="100%"></iframe>
                                </div>
                            </>
                            :
                            <iframe src={tab.url} height="100%" width="100%" style={{ ...(tab.path === '/wetty' || tab.path?.startsWith('/tty') ? {padding: '0 32px', background: '#000'}:{}) }}></iframe>}
                        </div>)}
                    </div> : null}
                </Split>
            </div>
        </div>
}