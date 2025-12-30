import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './HomePage.tsx'
import StevePage from './StevePage.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Home page */}
        <Route path="/" element={<HomePage />} />
        {/* Address page */}
        <Route path="/:address" element={<StevePage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)

