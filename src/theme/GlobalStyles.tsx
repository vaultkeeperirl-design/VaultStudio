import { createGlobalStyle } from 'styled-components';
import { tokens } from './tokens';

export const GlobalStyles = createGlobalStyle`
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html, body, #root {
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background-color: ${tokens.colors.bg};
    color: ${tokens.colors.text};
    font-size: ${tokens.fontSize.md};
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
  }

  body[data-view='chat-popout'] {
    background-color: transparent;
  }

  ::-webkit-scrollbar {
    width: 6px;
  }

  ::-webkit-scrollbar-track {
    background: ${tokens.colors.panel};
  }

  ::-webkit-scrollbar-thumb {
    background: ${tokens.colors.border};
    border-radius: 3px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: ${tokens.colors.muted};
  }
`;
