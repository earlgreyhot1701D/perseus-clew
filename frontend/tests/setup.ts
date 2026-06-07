import React from 'react';

// Make React available globally for components that don't explicitly import it
// (Next.js handles this at build time via its own JSX transform, but vitest needs it)
globalThis.React = React;
