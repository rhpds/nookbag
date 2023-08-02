import React, { useEffect, useState } from "react";
import { Tooltip } from "@patternfly/react-core";
import { ClockIcon } from "@patternfly/react-icons";

export default function({expirationTime}:{expirationTime: number}) {
    const [remainingMins, setRemainingMins] = useState(0);
    useEffect(() => {
        function calculateRemainingMins () {
            const remainingTime = expirationTime - Date.now();
            const r = remainingTime !== undefined ? Math.ceil(remainingTime / 1000 / 60) : undefined;
            if (r !== remainingMins) setRemainingMins(r);
        }
        const interval = setInterval(calculateRemainingMins, 1000);
        calculateRemainingMins();
        return () => {
            clearInterval(interval);
        }
    }, [])
    return <Tooltip position="bottom" content="Expiration time"><div style={{backgroundColor: 'rgb(255 255 255 /  0.2)', borderRadius: '4px', fontSize: '14px', minWidth: '90px', padding: '2px 6px', textAlign: 'center', marginRight: '4px', display: 'flex', alignItems: 'center', gap: '8px'}}>
        <ClockIcon /> {remainingMins} mins.
    </div></Tooltip>
}