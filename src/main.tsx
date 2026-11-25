import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { DawApp } from './daw/DawApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DawApp />
  </StrictMode>,
)
