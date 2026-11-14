import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppRouter } from './app/router.ts';
import './styles/index.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html is missing the #root element.');
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={createAppRouter()} />
  </StrictMode>,
);
