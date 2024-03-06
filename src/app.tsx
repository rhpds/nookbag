import React, { useState, useRef, useEffect } from "react";
import yaml from 'js-yaml';
import fetch from 'unfetch';
import useSWR from "swr";
import { Alert, AlertActionCloseButton, Button } from '@patternfly/react-core';
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
    const [loaderStatus, setLoaderStatus] = useState<{isLoading: boolean, stage: 'setup' | 'validation' | 'solve' | null, loadingStart?: number}>({ isLoading: false, stage: null, loadingStart: undefined });
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
    const [currentTab, setCurrentTab] = useState(tabs?.[0]);
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
            setLoaderStatus({ isLoading: true, stage: 'setup', loadingStart: Date.now() });
            executeStageAndGetStatus(key, 'setup').then(_ => {
                setProgress(_progress);
                setLoaderStatus({ isLoading: false, stage: null });
            }).catch(() => {
                setProgress(_progress);
                setLoaderStatus({ isLoading: false, stage: null });
            })
        }
    }

    function handleTabClick(tab: TTab) {
        setCurrentTab(tab);
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
        setLoaderStatus({ isLoading: true, stage: 'validation', loadingStart: Date.now() });
        const res = await executeStageAndGetStatus(modules[currIndex].name, 'validation');
        setLoaderStatus({ isLoading: false, stage: null });
        if (res.Status === 'successful') {
            if (currIndex+1 < modules.length) {
                setIframeModule(modules[currIndex+1].name);
                goToTop();
            } else {
                setValidationMsg({message:'Lab completed!', type: 'success'});
                window.parent.postMessage("COMPLETED", "*");
            }
        } else {
            setValidationMsg({message: res.Output || '', type:'error'});
        }
    }

    if (error) {
        return <div>Configuration file not defined</div>
    }

    return <div>
            <Loading text={loaderStatus.stage === 'setup' ? 'Environment Loading... Almost Ready!' : loaderStatus.stage === 'validation' ? 'Validating... Standby.' : loaderStatus.stage === 'solve' ? 'Solving... Standby.' : 'Loading...'} isVisible={loaderStatus.isLoading || loaderStatus.loadingStart > Date.now() - 500 } />
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
                            {currIndex > 0 ? <Button onClick={handlePrevious}>Previous</Button> : null}
                            <Button style={{marginLeft: 'auto'}} onClick={handleNext}>{currIndex+1 < modules.length ? 'Next':'End'}</Button>
                        </div>
                        {validationMsg ? <Alert variant={validationMsg.type === 'error' ? 'danger':'success'} title={validationMsg.type === 'error'?'Validation Error':'Lab Completed'} actionClose={<AlertActionCloseButton onClose={() => setValidationMsg(null)} />} >{validationMsg.message}</Alert>:null}
                    </div>
                    {tabs.length > 0 ? <div className="split right">
                        {tabs.length > 1 ? 
                        <div className="tab">
                            {tabs.map(s => <Button variant="plain" isActive={s.name === currentTab.name} key={s.name} className="tablinks" onClick={() => handleTabClick(s)}>{s.name}</Button>)}
                        </div> : null}
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
                            <iframe src={currentTab.url} height="100%" width="100%" style={{ ...(currentTab.path === '/wetty' ? {padding: '0 32px', background: '#000'}:{}) }}></iframe>}
                        </div>
                    </div> : null}
                </Split>
            </div>
        </div>
}