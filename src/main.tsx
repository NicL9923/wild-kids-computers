import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installInputGuards } from './app/inputGuards.ts';
import { createAppRouter } from './app/router.ts';
import { getBridge } from './platform/getBridge.ts';
import { installTestHook } from './platform/testHook.ts';
import './styles/index.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html is missing the #root element.');
}

installInputGuards(document);
void installTestHook(getBridge(), window.location);

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={createAppRouter()} />
  </StrictMode>,
);
