import { RestrictedFeaturesProvider } from './security/RestrictedFeatures';
import './utils/themeManager';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RestrictedFeaturesProvider><App /></RestrictedFeaturesProvider>
  </React.StrictMode>
);
