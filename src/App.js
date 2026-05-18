import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage.jsx'
import TutorAvailability from './pages/TutorAvailability.jsx';
import TutorSession from './pages/TutorSession.jsx';
import TutorRequests from './pages/TutorRequests.jsx';
import UCRequests from './pages/UCRequests';
import Register from './pages/Register';
import Login from './pages/Login';
import './App.css'

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/availability" element={<TutorAvailability />} />
          <Route path="/session" element={<TutorSession />} />
          <Route path="/requests" element={<TutorRequests />} />
          <Route path="/uc-requests" element={<UCRequests />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App