import React from 'react';
import ReactDOM from 'react-dom/client';
// @ts-ignore
import Test_App from './Test_App';

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);
root.render(
    <React.StrictMode>
        <Test_App/>
    </React.StrictMode>
);
