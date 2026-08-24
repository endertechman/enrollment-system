import { BrowserRouter, Routes, Route } from 'react-router-dom'

import HomePage from './pages/HomePage'

import Login from './components/Login'
import Register from './components/Register'
import EnrollmentForm from './components/EnrollmentForm'
import TeacherReview from './components/TeacherReview'
import TeacherAideDashboard from './components/TeacherAideDashboard'
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

        {/* Teacher only */}
        <Route
          path="/teacher"
          element={
            <RoleRoute allowedRole="teacher">
              <TeacherReview />
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