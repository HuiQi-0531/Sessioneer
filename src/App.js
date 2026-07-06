import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage.jsx'
import TutorAvailability from './pages/TutorAvailability.jsx';
import TutorSession from './pages/TutorSession.jsx';
import TutorRequests from './pages/TutorRequests.jsx';
import UCRequests from './pages/UCRequests.jsx';
import UCAvailability from './pages/UCAvailability.jsx';
import Register from './pages/Register';
import Login from './pages/Login';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import './App.css'

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={
            <ProtectedRoute><DashboardPage /></ProtectedRoute>
          } />
          <Route path="/availability" element={
            <ProtectedRoute><TutorAvailability /></ProtectedRoute>
          } />
          <Route path="/session" element={
            <ProtectedRoute><TutorSession /></ProtectedRoute>
          } />
          <Route path="/requests" element={
            <ProtectedRoute><TutorRequests /></ProtectedRoute>
          } />
          <Route path="/uc-requests" element={
            <ProtectedRoute allowedRoles={['coordinator']}><UCRequests /></ProtectedRoute>
          } />
          <Route path="/uc-availability" element={
            <ProtectedRoute allowedRoles={['coordinator']}><UCAvailability /></ProtectedRoute>
          } />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App
