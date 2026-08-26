import { BrowserRouter, Routes, Route } from 'react-router-dom'

import HomePage from './pages/HomePage'

import Login from './components/Login'
import Register from './components/Register'
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
