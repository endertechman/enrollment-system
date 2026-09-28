import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'

import HomePage from './pages/HomePage'
import RoleRoute from './components/RoleRoute'

const Login = lazy(() => import('./components/Login'))
const Register = lazy(() => import('./components/Register'))
const ResetPassword = lazy(() => import('./components/ResetPassword'))
const EnrollmentForm = lazy(() => import('./components/EnrollmentForm'))
const ParentDashboard = lazy(() => import('./pages/ParentDashboard'))
const TeacherDashboard = lazy(() => import('./pages/TeacherDashboard'))
const TeacherAideDashboard = lazy(() => import('./pages/TeacherAideDashboard'))

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="app-loading app-loading-full-page" role="status">Loading page...</div>}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<Navigate to="/login?forgot=1" replace />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Parent only */}
        <Route
          path="/enroll"
          element={
            <RoleRoute allowedRole="parent">
              <EnrollmentForm />
            </RoleRoute>
          }
        />

        <Route
          path="/parent"
          element={
            <RoleRoute allowedRole="parent">
              <ParentDashboard />
            </RoleRoute>
          }
        />

        {/* Teacher only */}
        <Route
          path="/teacher"
          element={
            <RoleRoute allowedRole="teacher">
              <TeacherDashboard />
            </RoleRoute>
          }
        />

        {/* Teacher Aide only */}
        <Route
          path="/teacher-aide"
          element={
            <RoleRoute allowedRole="teacher_aide">
              <TeacherAideDashboard />
            </RoleRoute>
          }
        />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
