import '@patternfly/react-core/dist/styles/base.css';

import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';
import { ErrorBoundary } from 'react-error-boundary';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');
const root = createRoot(container);
root.render(
  <Suspense fallback={<div>loading...</div>}>
    <ErrorBoundary
      fallbackRender={(props) => (
        <pre style={{ whiteSpace: 'pre-wrap' }}>{props.error?.message || 'Configuration error'}</pre>
      )}
    >
      <App />
    </ErrorBoundary>
  </Suspense>
);
