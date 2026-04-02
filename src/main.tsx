import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import './index.css';
import Page from './app/page';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
    <MantineProvider defaultColorScheme="light">
        <Page />
    </MantineProvider>
    </StrictMode>
);
