import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { JarvisPetWindow } from './components/ai/JarvisPetWindow';
import './index.css';

const isPetMode = new URLSearchParams(window.location.search).get('mode') === 'pet';

if (isPetMode) {
  document.documentElement.style.backgroundColor = 'transparent';
  document.body.style.backgroundColor = 'transparent';
  document.body.className = 'bg-transparent text-slate-100 antialiased overflow-hidden select-none';
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isPetMode ? <JarvisPetWindow /> : <App />}
  </React.StrictMode>
);
