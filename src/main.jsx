import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Clean any legacy dummy data from localStorage
try {
  [
    'refrasynth_mock_orders',
    'refrasynth_mock_orders_v2',
    'refrasynth_mock_users',
    'refrasynth_mock_users_full',
    'refrasynth_mock_master_data',
    'refrasynth_cached_master_data',
  ].forEach((k) => localStorage.removeItem(k));
} catch {}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
