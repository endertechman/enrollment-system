import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'

import HomePage from './pages/HomePage'

import Login from './components/Login'
import Register from './components/Register'
import ResetPassword from './components/ResetPassword'
import EnrollmentForm from './components/EnrollmentForm'
import ParentDashboard from './pages/ParentDashboard'
import TeacherDashboard from './pages/TeacherDashboard'
import TeacherAideDashboard from './pages/TeacherAideDashboard'
import RoleRoute from './components/RoleRoute'

function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}

export default App
