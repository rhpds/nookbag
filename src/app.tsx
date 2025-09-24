import React, { useState, useRef, useEffect } from 'react';
import yaml from 'js-yaml';
import fetch from 'unfetch';
import useSWRImmutable from 'swr/immutable';
import {
  Alert,
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  Tab,
  Tabs,
  TabTitleIcon,
  TabTitleText,
} from '@patternfly/react-core';
import Split from 'react-split';
import { ForwardIcon, RedoIcon } from '@patternfly/react-icons';
import ProgressHeader from './progress-header';
import { executeStageAndGetStatus, API_CONFIG, silentFetcher, exitLab, completeLab, formatYamlError } from './utils';
import Loading from './loading';
import { ModuleSteps, Step, TModule, TProgress, TTab } from './types';

import './app.css';

type ConfigFetchResult = {
  url: string;
  ok: boolean;
  status: number;
  statusText: string;
  text: string | null;
  error?: string;
};

const protocol = window.location.protocol;
const hostname = window.location.hostname;

const createUrlsFromVars = (vars: TTab): TTab => {
  // Handle predefined types
  if (vars.type) {
    let updatedVars = { ...vars };

    switch (vars.type) {
      case 'double-terminal':
        updatedVars.path = '/tty-top';
        updatedVars.port = '443';
        updatedVars.secondary_path = '/tty-bottom';
        updatedVars.secondary_port = '443';
        break;
      case 'terminal':
        updatedVars.path = '/tty1';
        updatedVars.port = '443';
        break;
      case 'secondary-terminal':
        updatedVars.path = '/tty2';
        updatedVars.port = '443';
        break;
      case 'codeserver':
        updatedVars.path = '/';
        updatedVars.port = '8443';
        break;
      case 'parasol':
        updatedVars.path = '/';
        updatedVars.port = '8005';
        break;
    }

    vars = updatedVars;
  }

  if (vars.url) {
    return {
      ...vars,
      external: vars.external ? Boolean(vars.external) : false,
    };
  }
  if (!vars.port) {
    throw Error('Port and url not defined');
  }
  return {
    ...vars,
    external: vars.external ? Boolean(vars.external) : false,
    url: `${protocol}//${hostname}${vars.port ? ':' + vars.port : ''}${vars.path || ''}`,
    ...(vars.secondary_path
      ? {
          secondary_url: `${protocol}//${hostname}${vars.secondary_port ? ':' + vars.secondary_port : ''}${
            vars.secondary_path || ''
          }`,
        }
      : {}),
  };
};

function isScriptAvailable(module: TModule, scriptName: Step) {
  return !module.scripts || module.scripts.includes(scriptName);
}

function showSolveBtn(module: TModule) {
  if (module.solveButton === true) return true;
  if (!module.scripts) return false;
  return isScriptAvailable(module, 'solve');
}

function isTerminalTab(tab: TTab) {
  if (tab.type === 'terminal' || tab.type === 'secondary-terminal') return true;
  return tab.path?.startsWith('/wetty') || tab.path?.startsWith('/tty');
}

type Session = {
  sessionUuid: string;
  catalogItemName: string;
  start: string;
  stop?: string;
  state: string;
  lifespanEnd: string;
  labUserInterfaceUrl: string;
  completed?: boolean;
};

export default function () {
  const ref = useRef(null);
  const instructionsPanelRef = useRef(null);
  const [loaderStatus, setLoaderStatus] = useState<{
    isLoading: boolean;
    stage: 'setup' | 'validation' | 'solve' | null;
  }>({ isLoading: false, stage: null });
  const searchParams = new URLSearchParams(document.location.search);
  const s = searchParams.get('s');
  let session: Session = null as unknown as Session;
  try {
    session = s ? (JSON.parse(s) as Session) : (null as unknown as Session);
  } catch (_e) {
    session = null as unknown as Session;
  }
  const { data: dataResponses, error } = useSWRImmutable(
    ['./ui-config.yml', './zero-touch-config.yml'],
    async (urls: string[]) => {
      const results: ConfigFetchResult[] = await Promise.all(
        urls.map(async (url) => {
          try {
            const response = await fetch(url);
            if (response.status === 200) {
              const text = await response.text();
              return { url, ok: true, status: 200, statusText: response.statusText, text };
            }
            return { url, ok: false, status: response.status, statusText: response.statusText, text: null as string | null };
          } catch (e: unknown) {
            const message = e && typeof e === 'object' && 'message' in e ? (e as Error).message : 'Network error';
            return { url, ok: false, status: 0, statusText: 'Network Error', text: null as string | null, error: message } as const;
          }
        })
      );
      return results;
    },
    { suspense: true, revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false }
  );
  const baseUrls = ['./ui-config.yml', './zero-touch-config.yml'];
  if (!Array.isArray(dataResponses)) {
    throw new Error('Failed to load configuration.');
  }
  const results = dataResponses as ConfigFetchResult[];
  const hit = results.find((r) => r.ok && r.text);
  if (!hit) {
    if (results.length > 0 && results.every((r) => r.status === 404)) {
      throw new Error('Configuration file not found. Tried ./ui-config.yml and ./zero-touch-config.yml');
    }
    const details = results
      .map((r, i) => {
        if (r.ok) return null;
        const url = r.url || baseUrls[i] || './ui-config.yml';
        if (r.status === 0) return `${url}: ${r.statusText}${r.error ? ' - ' + r.error : ''}`;
        return `${url}: HTTP ${r.status} ${r.statusText}`;
      })
      .filter(Boolean)
      .join('; ');
    if (details) throw new Error(`Failed to load configuration. ${details}`);
    throw new Error('Failed to load configuration.');
  }
  const successfulText = hit.text as string;
  const successfulName = hit.url || './ui-config.yml';
  let config = {} as {
    type?: 'showroom' | 'zero-touch';
    antora?: { modules: TModule[]; name: string; dir?: string; version: string };
    tabs?: TTab[];
  };
  try {
    config = yaml.load(successfulText) as any;
  } catch (e: unknown) {
    const pretty = formatYamlError(e, successfulText, successfulName || './ui-config.yml');
    throw new Error(pretty);
  }
  const isBasicShowroom = config.type === 'showroom';
  const { data: configData, error: errConfig } = useSWRImmutable<ModuleSteps>(
    !successfulText || !isBasicShowroom ? API_CONFIG : null,
    silentFetcher,
    { suspense: true, revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false }
  );
  const modules = config?.antora?.modules || [];
  const antoraDir = config?.antora?.dir || (isBasicShowroom ? 'www' : 'antora');
  const version = config?.antora?.version;
  const s_name = config?.antora?.name || 'modules';
  const [validationMsg, setValidationMsg] = useState<{
    type: 'warning' | 'danger' | 'success';
    message: string;
    title: string;
  } | null>(null);
  const tabs = config.tabs?.map((s) => createUrlsFromVars(s)) || [];
  const PROGRESS_KEY = session ? `PROGRESS-${session.sessionUuid}` : null;
  const initProgressStr = PROGRESS_KEY ? window.localStorage.getItem(PROGRESS_KEY) : null;
  let initProgress: TProgress = null as unknown as TProgress;
  try {
    initProgress = initProgressStr ? (JSON.parse(initProgressStr) as TProgress) : (null as unknown as TProgress);
  } catch (_e) {
    initProgress = null as unknown as TProgress;
  }
  const [progress, setProgress] = useState(
    initProgress ?? {
      inProgress: [],
      completed: [],
      notStarted: modules.map((x) => x.name),
      current: modules.length > 0 ? modules[0].name : null,
    }
  );
  const [iframeModule, setIframeModule] = useState(progress.current || 'index');
  const currIndex = modules.findIndex((m) => m.name === progress.current);
  const [currentTabName, setCurrentTabName] = useState(
    Array.isArray(tabs) && tabs.length > 0
      ? tabs.find((t) => !t.modules || t.modules.includes(modules[currIndex].name))?.name
      : undefined
  );
  const initialFile = `./${antoraDir}/${s_name ? s_name + '/' : ''}${version ? version + '/' : ''}${iframeModule}.html`;
  const showTabsBar =
    (tabs.length > 1 || tabs.some((t) => t.secondary_name)) && (isBasicShowroom || modules.length > 0);
  const moduleTabs = tabs.filter((t) => {
    if (!t.modules) return true;
    if (Array.isArray(t.modules) && t.modules.length > 0) {
      if (t.modules.includes(modules[currIndex].name)) {
        return true;
      }
      return false;
    }
    return true;
  });

  if (configData && modules.length > 0) {
    Object.keys(configData).forEach((k) => {
      for (let m in Object.entries(modules)) {
        const module = modules[m];
        if (module.name === k) {
          module.scripts = configData[k];
        }
      }
    });
  }

  useEffect(() => {
    if (!isBasicShowroom && session?.sessionUuid && PROGRESS_KEY) {
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    }
  }, [progress]);

  function onPageChange() {
    if (ref.current) {
      const iframe = ref.current as HTMLIFrameElement;
      if (!iframe || !iframe.contentWindow) throw new Error('No valid iframe found');
      const page = iframe.contentWindow.location.pathname.split('/');
      let key = '';
      if (page[page.length - 2] === version || !version) {
        key = page[page.length - 1].split('.')[0];
      } else {
        key = `${page[page.length - 2]}/${page[page.length - 1].split('.')[0]}`;
      }
      const _progress = { ...progress };
      let pivotPassed = false;
      modules.forEach((m) => {
        if (m.name === key) {
          pivotPassed = true;
        } else if (pivotPassed) {
          _progress.notStarted.push(m.name);
        } else {
          _progress.completed.push(m.name);
        }
      });
      _progress.inProgress = [key];
      _progress.current = key;
      const module = modules.find((x) => x.name === key);
      if (module && isScriptAvailable(module, 'setup')) {
        setLoaderStatus({ isLoading: true, stage: 'setup' });
        const executeStageAndGetStatusPromise = executeStageAndGetStatus(key, 'setup');
        const minTimeout = new Promise((resolve) => setTimeout(() => resolve(null), 500));
        Promise.all([executeStageAndGetStatusPromise, minTimeout])
          .then((_) => {
            setProgress(_progress);
            setLoaderStatus({ isLoading: false, stage: null });
          })
          .catch(() => {
            setProgress(_progress);
            setLoaderStatus({ isLoading: false, stage: null });
          });
      }
    }
  }

  function handleTabClick(_: React.MouseEvent<HTMLElement, MouseEvent>, tabIndex: string | number) {
    const tab = tabs.find((x) => x.name === String(tabIndex));
    if (!tab) {
      throw new Error('No tab found');
    }
    if (tab.external) {
      window.open(tab.url, '_blank');
    } else {
      setCurrentTabName(tab.name);
    }
  }

  function goToTop() {
    if (instructionsPanelRef.current) {
      const instructionsPanel = instructionsPanelRef.current as HTMLDivElement;
      instructionsPanel.scrollTo(0, 0);
    }
  }

  function setDefaultTabFor(module: TModule) {
    const currentTab = tabs.find((t) => t.name === currentTabName);
    if (Array.isArray(currentTab?.modules) && currentTab.modules.length > 0) {
      if (!currentTab.modules.includes(module.name)) {
        setCurrentTabName(tabs.find((t) => !t.modules || t.modules.includes(module.name))?.name);
      }
    }
  }

  function handlePrevious() {
    if (currIndex > 0) {
      setValidationMsg(null);
      setDefaultTabFor(modules[currIndex - 1]);
      setIframeModule(modules[currIndex - 1].name);
      goToTop();
    }
  }

  async function handleNext() {
    setValidationMsg(null);
    let res: { Status: 'failed' | 'successful'; Output?: string } | null = null;
    if (isScriptAvailable(modules[currIndex], 'validation')) {
      setLoaderStatus({ isLoading: true, stage: 'validation' });
      const executeStageAndGetStatusPromise = executeStageAndGetStatus(modules[currIndex].name, 'validation');
      const minTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 500));
      [res] = await Promise.all([executeStageAndGetStatusPromise, minTimeout]);
    }
    if (res === null || res.Status === 'successful') {
      if (currIndex + 1 < modules.length) {
        setDefaultTabFor(modules[currIndex + 1]);
        setIframeModule(modules[currIndex + 1].name);
        goToTop();
      } else {
        setLoaderStatus({ isLoading: false, stage: null });
        if (!session.sessionUuid) {
          setValidationMsg({
            title: 'Lab completed!',
            message: "You've successfully completed this lab.",
            type: 'success',
          });
        } else {
          completeLab();
        }
      }
    } else {
      setLoaderStatus({ isLoading: false, stage: null });
      setValidationMsg({ message: res.Output || '', title: 'Validation Error', type: 'danger' });
    }
  }

  async function executeSolve() {
    if (isScriptAvailable(modules[currIndex], 'solve')) {
      setLoaderStatus({ isLoading: true, stage: 'solve' });
      const executeStageAndGetStatusPromise = executeStageAndGetStatus(modules[currIndex].name, 'solve');
      const minTimeout = new Promise((resolve) => setTimeout(() => resolve(null), 500));
      const [res] = await Promise.all([executeStageAndGetStatusPromise, minTimeout]);
      if (res.Status === 'successful') {
        setLoaderStatus({ isLoading: false, stage: null });
      } else {
        setLoaderStatus({ isLoading: false, stage: null });
        setValidationMsg({ message: res.Output || '', title: 'Validation Error', type: 'danger' });
      }
    }
  }

  async function skipModule() {
    await executeSolve();
    await handleNext();
  }

  function exitWarning() {
    if (!session?.sessionUuid) {
      setValidationMsg({
        title: 'Are you sure you want to leave?',
        message: 'If you wish to exit, simply close this browser tab.',
        type: 'warning',
      });
    } else {
      exitLab();
    }
  }

  function refreshTab(url: string) {
    const tab = document.querySelector(`.app-split-right__content.active iframe`);
    if (tab) {
      (tab as HTMLIFrameElement).src = url;
    }
  }

  if (error) {
    return <pre style={{ whiteSpace: 'pre-wrap' }}>{(error as Error).message || 'Configuration error'}</pre>;
  }

  return (
    <div>
      <Loading
        text={
          loaderStatus.stage === 'setup'
            ? 'Environment loading... almost ready!'
            : loaderStatus.stage === 'validation'
            ? 'Validating... standby.'
            : loaderStatus.stage === 'solve'
            ? 'Solving... standby.'
            : 'Loading...'
        }
        isVisible={loaderStatus.isLoading}
      />
      <Modal isOpen={!!validationMsg} onClose={() => setValidationMsg(null)} variant="small">
        <ModalBody>
          {validationMsg ? (
            <Alert variant={validationMsg.type} title={validationMsg.title} isPlain isInline>
              {validationMsg.message}
            </Alert>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button key="confirm" variant="primary" onClick={() => setValidationMsg(null)}>
            Confirm
          </Button>
        </ModalFooter>
      </Modal>
      <div className="app-wrapper">
        <Split
          sizes={moduleTabs.length > 0 ? [25, 75] : [100]}
          minSize={100}
          gutterSize={1}
          direction="horizontal"
          cursor="col-resize"
          style={{ display: 'flex', flexDirection: 'row', resize: 'horizontal', height: '100%' }}
          onDragEnd={() => {
            // Hack to fix scrollbar issue https://github.com/nathancahill/split/issues/119
            document.querySelectorAll('iframe').forEach((iframe) => {
              iframe.style.display = 'none';
              requestAnimationFrame(() => {
                iframe.style.display = 'block';
              });
            });
          }}
        >
          <div className="split left" ref={instructionsPanelRef}>
            {!isBasicShowroom ? (
              <div className="app__toolbar">
                <ProgressHeader
                  sessionUuid={session?.sessionUuid}
                  modules={modules}
                  progress={progress}
                  expirationTime={Date.parse(session?.lifespanEnd)}
                  setIframeModule={setIframeModule}
                />
              </div>
            ) : null}
            <iframe
              ref={ref}
              src={initialFile}
              onLoad={onPageChange}
              width="100%"
              className="app__instructions"
              height="100%"
            ></iframe>
            {!isBasicShowroom ? (
              <div className="app-iframe__inner">
                {currIndex > 0 ? (
                  <Button onClick={handlePrevious} className="lab-actions__previous">
                    Previous
                  </Button>
                ) : null}
                {showSolveBtn(modules[currIndex]) ? (
                  <Button
                    style={{ marginLeft: 'auto' }}
                    variant="secondary"
                    className="lab-actions__solve"
                    onClick={executeSolve}
                  >
                    Solve
                  </Button>
                ) : null}
                <Button style={{ marginLeft: 'auto' }} className="lab-actions__next" onClick={handleNext}>
                  {currIndex + 1 < modules.length ? 'Next' : 'End'}
                </Button>
              </div>
            ) : null}
          </div>
          {moduleTabs.length > 0 ? (
            <div className="split right">
              {showTabsBar ? (
                <div className="app-split-right__top-bar">
                  <Tabs activeKey={currentTabName} onSelect={handleTabClick} className="app-split-right__tabs">
                    {moduleTabs.map((s) => (
                      <Tab
                        key={s.name}
                        eventKey={s.name}
                        title={
                          <>
                            <TabTitleText>{s.name}</TabTitleText>{' '}
                            {s.name === currentTabName && !s.secondary_url ? (
                              <TabTitleIcon onClick={() => refreshTab(s.url as string)}>
                                <RedoIcon color="grey" />
                              </TabTitleIcon>
                            ) : null}
                          </>
                        }
                        className="tablinks"
                      ></Tab>
                    ))}
                  </Tabs>
                  {!isBasicShowroom ? (
                    <div className="app-split-right__actions">
                      <Button
                        key="skip-module"
                        variant="secondary"
                        size="sm"
                        onClick={skipModule}
                        icon={<ForwardIcon />}
                      >
                        Skip module
                      </Button>
                      <Button key="exit-lab" variant="primary" size="sm" onClick={exitWarning}>
                        Exit
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {moduleTabs.map((tab) => (
                <div
                  key={tab.name}
                  className={`app-split-right__content tabcontent${tab.name === currentTabName ? ' active' : ''}`}
                >
                  {tab.secondary_url ? (
                    <Split
                      sizes={[50, 50]}
                      minSize={100}
                      gutterSize={1}
                      cursor="row-resize"
                      direction="vertical"
                      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
                    >
                      <div className="split top">
                        <iframe src={tab.url} width="100%" height="100%" className="main-content"></iframe>
                      </div>
                      <div className="split bottom">
                        {tab.secondary_name ? (
                          <Tabs activeKey={currentTabName} style={{ height: '56px' }}>
                            <Tab eventKey={tab.name} title={<TabTitleText>{tab.secondary_name}</TabTitleText>}></Tab>
                          </Tabs>
                        ) : null}
                        <iframe
                          src={tab.secondary_url}
                          width="100%"
                          height="100%"
                          style={{ display: 'block' }}
                        ></iframe>
                      </div>
                    </Split>
                  ) : (
                    <iframe
                      className="main-content"
                      src={tab.url}
                      height="100%"
                      width="100%"
                      style={{
                        ...(isTerminalTab(tab) ? { padding: '0 32px', background: '#000' } : {}),
                      }}
                    ></iframe>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </Split>
      </div>
    </div>
  );
}
