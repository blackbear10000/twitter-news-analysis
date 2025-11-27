import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import AdminApp from './AdminApp'
import PublicApp from './PublicApp'
import { AppProviders } from './providers/AppProviders'

function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicApp />} />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProviders>
  )
}

export default App
