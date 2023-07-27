import React, { useState, useRef } from "react";
import ProgressBar from './progress-bar';
import yaml from 'js-yaml';
import fetch from 'unfetch';
import useSWR from "swr";
import { Button } from '@patternfly/react-core';
import './app.css'

type service = {name: string, url?: string, port?: string, secondary_port?: string, path?: string, secondary_path?: string, secondary_url?: string};


const protocol = window.location.protocol;
const hostname = window.location.hostname;

const createUrlsFromVars = (vars: service): service  => {
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

export default function() {
    const ref = useRef();
    const {data, error} = useSWR('./lab-config.yml', (url) => fetch(url).then(r => r.text()), { suspense: true });
    const config = yaml.load(data) as {showroom_version: string, showroom_modules: string[], showroom_services: service[], showroom_name: string, antora_dir?: string};
    const modules = config.showroom_modules;
    const antoraDir = config.antora_dir || 'antora';
    const version = config.showroom_version;
    const s_name = config.showroom_name;
    const services = config.showroom_services.map(s => createUrlsFromVars(s));
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

    function handleTabClick(service: service) {
        setCurrentService(service)
    }

    function handleNext() {
        if (currIndex+1 < modules.length) {
            setIframeModule(modules[currIndex+1]);
        } else {
            alert('Lab Completed')
        }
    }


    const initialFile = `./${antoraDir}/${s_name}/${version}/${iframeModule}.html`

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
                        {services.map(s => <Button variant="plain" isActive={s.name === currentService.name} key={s.name} className="tablinks" onClick={() => handleTabClick(s)}>{s.name}</Button>)}
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