import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Sessions } from './pages/Sessions'
import { SessionDetail } from './pages/SessionDetail'
import { SessionForm } from './pages/SessionForm'
import { Members } from './pages/Members'
import { Equipment } from './pages/Equipment'
import { Locations } from './pages/Locations'
import { Settings } from './pages/Settings'

function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <Layout />
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="sessions/new" element={<SessionForm />} />
            <Route path="sessions/:id" element={<SessionDetail />} />
            <Route path="sessions/:id/edit" element={<SessionForm />} />
            <Route path="members" element={<Members />} />
            <Route path="equipment" element={<Equipment />} />
            <Route path="locations" element={<Locations />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
