import React from 'react';
import ReactDOM from 'react-dom/client';
// @ts-ignore
import DEMO_App from './DEMO_App';

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);
root.render(
    <React.StrictMode>
        <DEMO_App/>
    </React.StrictMode>
);
