import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { LangProvider } from './contexts/LangContext'
import { ThemeProvider } from './contexts/ThemeContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <LangProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LangProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
