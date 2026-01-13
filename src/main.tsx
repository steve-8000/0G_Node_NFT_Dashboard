import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './HomePage.tsx'
import StevePage from './StevePage.tsx'
import MarketPage from './MarketPage.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Home page */}
        <Route path="/" element={<HomePage />} />
        {/* Market page */}
        <Route path="/market" element={<MarketPage />} />
        {/* Market address page */}
        <Route path="/market/:address" element={<StevePage />} />
        {/* Address page */}
        <Route path="/:address" element={<StevePage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)

