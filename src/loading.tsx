import React from "react";

import './loading.css';

export default function({text, isVisible}:{text: string, isVisible: boolean}) {
    if (!isVisible) {
        return null;
    }
    
    return <div className="loading-wrapper">
            <div className="loading" />
            <div className="loading-text">
                {text}
            </div>
        </div>
}