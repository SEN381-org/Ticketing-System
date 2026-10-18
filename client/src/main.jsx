import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';

// The mock is opt-in: only when the build or dev server was started with
// VITE_MOCK_API=1 (or =rich). In any other build this branch is removed.
if (import.meta.env.VITE_MOCK_API === '1' || import.meta.env.VITE_MOCK_API === 'rich') {
  await import('./mock/install.js');
}

createRoot(document.getElementById('root')).render(<App />);
