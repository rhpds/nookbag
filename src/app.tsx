import React, { useState, useRef } from "react";
import ProgressBar from './progress-bar';
import yaml from 'js-yaml';
import fetch from 'unfetch';
import useSWR from "swr";
import { Button } from '@patternfly/react-core';
import './app.css'

const protocol = window.location.protocol;
const hostname = window.location.hostname;
const pathname = window.location.pathname;

const defaultServicesUrl = {
    'double_terminal': {
        url: `${protocol}//${hostname}:8001/wetty`,
        secondary_url: `${protocol}//${hostname}:8002/wetty`
    },
    'codeserver': {
        url: `${protocol}//${hostname}:8003`
    }
}

export default function() {
    const ref = useRef();
    const {data, error} = useSWR('./lab-config.yaml', (url) => fetch(url).then(r => r.text()), { suspense: true });
    const config = yaml.load(data) as {showroom_version: string, showroom_modules: string[], showroom_services: any, showroom_name: string};
    const modules = config.showroom_modules;
    const version = config.showroom_version;
    const s_name = config.showroom_name;
    const services = config.showroom_services.map(s => typeof s === "string" ? ({key: s, ...defaultServicesUrl[s]}):({key: Object.entries(s)[0][0], url: Object.entries(s)[0][1]}));
    const [progress, setProgress] = useState({inProgress: [], completed: [], notStarted: modules, current: modules[0]});
    const [currentService, setCurrentService] = useState(services?.[0]);
    const [iframeModule, setIframeModule] = useState(modules[0]);
    const currIndex = modules.findIndex(m => m === progress.current);

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
            
            setProgress({completed: [], current: key, inProgress: [], notStarted: [] });
        }
    }

    function handleTabClick(service: ({
        key: string;
        url: string;
        secondary_url: string;
    } | {
        key: string;
        url: string;
        secondary_url?: undefined;
    })) {
        setCurrentService(service)
    }

    function handleNext() {
        if (currIndex+1 < modules.length) {
            setIframeModule(modules[currIndex+1]);
        } else {
            alert('Lab Completed')
        }
    }


    const initialFile = `./antora/${s_name}/${version}/${iframeModule}.html`

    if (error) {
        return <div>Configuration file not defined</div>
    }

    return <div className="app-wrapper">
                <div className="split left">
                    <iframe ref={ref}  src={initialFile} onLoad={onPageChange} width="100%" style={{flexGrow: 1}}></iframe>
                    <div className="app-iframe__inner">
                        <Button onClick={handleNext}>{currIndex+1 < modules.length ? 'Next':'End'}</Button>
                        <ProgressBar modules={modules} progress={progress} />
                    </div>
                </div>
                <div className="split right">
                    <div className="tab">
                        {services.map(s => <Button variant="plain" isActive={s.key === currentService.key} key={s.key} className="tablinks" onClick={() => handleTabClick(s)}>{s.key}</Button>)}
                    </div>
                    <div className="tabcontent">
                        {currentService.secondary_url ?
                        <>
                            <div className="split top">
                                <iframe src={currentService.url} width="100%"></iframe>
                            </div>
                            <div className="split bottom">
                                <iframe src={currentService.secondary_url} width="100%"></iframe>
                            </div>
                        </>
                        :
                        <iframe src={currentService.url} height="100%" width="100%"></iframe>}
                    </div>
                </div>
            </div>
}