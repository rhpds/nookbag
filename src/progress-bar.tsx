import React from "react";

export default function({modules, progress}: {modules: {name: string, validation_script?: string}[], progress: {current: string, inProgress: string[], notStarted: string[], completed: string[]}}) {
    return <div>Progress bar: <span id="currentStep">{progress.current} - {modules.findIndex(m => m.name === progress.current)+1}/{modules.length}</span></div>
}