import '@patternfly/react-core/dist/styles/base.css';

import React, {Suspense} from "react";
import { createRoot } from 'react-dom/client';
import App from './app';
import { ErrorBoundary } from 'react-error-boundary';

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<Suspense fallback={<div>loading...</div>}>
  <ErrorBoundary
    fallbackRender={() => <div>Configuration file not defined</div>}
  >
    <App />
  </ErrorBoundary>
</Suspense>);