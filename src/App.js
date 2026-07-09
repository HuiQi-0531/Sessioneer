import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import RoleBasedHome from './components/RoleBasedHome.jsx'
import TutorAvailability from './pages/TutorAvailability.jsx';
import TutorSession from './pages/TutorSession.jsx';
import TutorMessages from './pages/TutorMessages.jsx';
import UCDashboard from './pages/UCDashboard.jsx';
import Profile from './pages/Profile.jsx';
import LogoutConfirm from './pages/LogoutConfirm.jsx';
import TutorRequests from './pages/TutorRequests.jsx';
import UCRequests from './pages/UCRequests.jsx';
import UCAvailability from './pages/UCAvailability.jsx';
import UnitSetup from './pages/UnitSetup.jsx';
import CreateUnit from './pages/CreateUnit.jsx';
import Sessions from './pages/Sessions.jsx';
import ImportSessions from './pages/ImportSessions.jsx';
import Tutors from './pages/Tutors.jsx';
import ScheduleBuilder from './pages/ScheduleBuilder.jsx';
import Messages from './pages/Messages.jsx';
import TutorSchedule from './pages/TutorSchedule.jsx';
import Register from './pages/Register';
import Login from './pages/Login';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { ActiveUnitProvider } from './context/ActiveUnitContext.jsx';
import './App.css'

function App() {
  return (
    <Router>
      <div className="App">
        <ActiveUnitProvider>
        <Routes>
          <Route path="/" element={
            <ProtectedRoute><RoleBasedHome /></ProtectedRoute>
          } />
          <Route path="/availability" element={
            <ProtectedRoute><TutorAvailability /></ProtectedRoute>
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
          <Route path="/unit-setup" element={
            <ProtectedRoute allowedRoles={['coordinator']}><UnitSetup /></ProtectedRoute>
          } />
          <Route path="/unit-setup/create" element={
            <ProtectedRoute allowedRoles={['coordinator']}><CreateUnit /></ProtectedRoute>
          } />
          <Route path="/unit-setup/edit/:id" element={
            <ProtectedRoute allowedRoles={['coordinator']}><CreateUnit /></ProtectedRoute>
          } />
          <Route path="/sessions/:unitId" element={
            <ProtectedRoute allowedRoles={['coordinator']}><Sessions /></ProtectedRoute>
          } />
          <Route path="/sessions/:unitId/import" element={
            <ProtectedRoute allowedRoles={['coordinator']}><ImportSessions /></ProtectedRoute>
          } />
          <Route path="/tutors/:unitId" element={
            <ProtectedRoute allowedRoles={['coordinator']}><Tutors /></ProtectedRoute>
          } />
          <Route path="/schedule-builder/:unitId" element={
            <ProtectedRoute allowedRoles={['coordinator']}><ScheduleBuilder /></ProtectedRoute>
          } />
          <Route path="/messages" element={
            <ProtectedRoute allowedRoles={['coordinator']}><Messages /></ProtectedRoute>
          } />
          <Route path="/tutor-schedule/:unitId" element={
            <ProtectedRoute allowedRoles={['tutor']}><TutorSchedule /></ProtectedRoute>
          } />
          <Route path="/tutor-sessions/:unitId" element={
            <ProtectedRoute allowedRoles={['tutor']}><TutorSession /></ProtectedRoute>
          } />
          <Route path="/tutor-messages" element={
            <ProtectedRoute allowedRoles={['tutor']}><TutorMessages /></ProtectedRoute>
          } />
          <Route path="/uc-dashboard" element={
            <ProtectedRoute allowedRoles={['coordinator']}><UCDashboard /></ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute><Profile /></ProtectedRoute>
          } />
          <Route path="/logout" element={
            <ProtectedRoute><LogoutConfirm /></ProtectedRoute>
          } />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
        </ActiveUnitProvider>
      </div>
    </Router>
  );
}

export default App