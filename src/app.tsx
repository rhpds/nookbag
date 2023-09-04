import React, { useState, useRef, useEffect } from "react";
import yaml from 'js-yaml';
import fetch from 'unfetch';
import useSWR from "swr";
import { Button } from '@patternfly/react-core';
import Split from 'react-split';
import ProgressHeader from './progress-header';
import './app.css'

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
        url: `${protocol}//${hostname}:${vars.port}${vars.path || ''}`,
        ...vars.secondary_port ? {secondary_url: `${protocol}//${hostname}:${vars.secondary_port}${vars.secondary_path || ''}`} : {}
    };
}

type Session = {sessionUuid: string, catalogItemName: string, start: string, stop?: string, state: string, labUserInterfaceUrl: string};

export default function() {
    const ref = useRef();
    const instructionsPanelRef = useRef();
    const [session, setSession] = useState<Session>(null);
    const {data, error} = useSWR('./nookbag.yml', (url) => fetch(url).then(r => r.text()), { suspense: true });
    const config = yaml.load(data) as {antora: { modules: {name: string, validation_script?: string}[], name: string, dir?: string, version: string }, tabs: service[]};
    const modules = config.antora.modules;
    const antoraDir = config.antora.dir || 'antora';
    const version = config.antora.version;
    const s_name = config.antora.name;
    const tabs = config.tabs.map(s => createUrlsFromVars(s));
    const [progress, setProgress] = useState({inProgress: [], completed: [], notStarted: modules.map(x => x.name), current: modules[0].name});
    const [currentTab, setCurrentTab] = useState(tabs?.[0]);
    const [iframeModule, setIframeModule] = useState(modules[0].name);
    const currIndex = modules.findIndex(m => m.name === progress.current);
    const initialFile = `./${antoraDir}/${s_name}/${version}/${iframeModule}.html`

    useEffect(() => {
        const searchParams = new URLSearchParams(document.location.search);
        const s = searchParams.get('s');
        console.log('search param s:' + s)
        if (s) {
            const sessionIntend: Session = JSON.parse(s);
            if (sessionIntend?.sessionUuid) {
                setSession(sessionIntend)
            }
        }
    }, [setSession]);

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
            alert('Lab Completed');
        }
    }

    if (error) {
        return <div>Configuration file not defined</div>
    }

    console.log("session: "+ JSON.stringify(session))

    return <div className="app-wrapper">
                <Split
                    sizes={[25, 75]}
                    minSize={100}
                    gutterSize={1}
                    direction="horizontal"
                    cursor="col-resize"
                    style={{display: 'flex', flexDirection: 'row'}}>
                    <div className="split left" ref={instructionsPanelRef}>
                        <div className="app__toolbar">
                            <ProgressHeader sessionUuid={session?.sessionUuid} className="app__toolbar--inner" modules={modules} progress={progress} expirationTime={Date.now() + 3.6e+6} setIframeModule={setIframeModule} />
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
            </div>
}