import React, {Suspense} from "react";
import { createRoot } from 'react-dom/client';
import App from './app';

import '@patternfly/react-core/dist/styles/base.css';

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<Suspense fallback={<div>loading...</div>}>
  <App />
</Suspense>);