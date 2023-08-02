import React from "react";
import './progress-bar.css';

export default function({modules, progress}: {modules: {name: string, validation_script?: string}[], progress: {current: string, inProgress: string[], notStarted: string[], completed: string[]}}) {
    return <div className="progress-bar__wrapper">
        <span className="progress-bar__label">Progress</span>
        <div className="progress-bar">
            {modules.map((m) => <div className={m.name === progress.current ? 'progress-bar__item is-current': progress.completed.includes(m.name) ? 'progress-bar__item completed' : 'progress-bar__item not-started'}></div>)}
        </div>
    </div>
}