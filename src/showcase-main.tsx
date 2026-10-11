import React from 'react';
import { createRoot } from 'react-dom/client';
import { SubmissionShowcase } from './SubmissionShowcase.tsx';
import './styles.css';
import './report-document.css';
import './showcase.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><SubmissionShowcase /></React.StrictMode>);
