import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { lazy, Suspense } from 'react';
import './styles.css';
import './report-document.css';
import './research-progress.css';

const Scenario=lazy(()=>import('./SyntheticScenario.tsx'));
const synthetic=new URLSearchParams(window.location.search).get('scenario')==='synthetic';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{synthetic?<Suspense fallback={<p>합성 시나리오를 불러오고 있습니다.</p>}><Scenario/></Suspense>:<App />}</React.StrictMode>);
