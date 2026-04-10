import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ThemeProvider, AuthProvider, SecondaryNavProvider } from './context'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <SecondaryNavProvider>
          <App />
        </SecondaryNavProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
