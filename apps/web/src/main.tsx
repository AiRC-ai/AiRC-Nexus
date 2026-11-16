import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './style.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4/standard.css';
import '@fontsource-variable/source-serif-4/standard-italic.css';
import './workbench.css';
import './federation.css';
const element = document.getElementById('root');
if (!element) throw new Error('Application root missing');
createRoot(element).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
