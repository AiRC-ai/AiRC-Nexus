import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './style.css';
const element = document.getElementById('root');
if (!element) throw new Error('Application root missing');
createRoot(element).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
