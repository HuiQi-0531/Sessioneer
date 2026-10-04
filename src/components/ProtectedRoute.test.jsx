// Frontend RBAC: which role may open which page (ProtectedRoute).
// The backend is the real guard (see backend RBAC tests); this checks the
// UI sends each role to the right place instead of showing a wrong page.
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { useActiveUnit } from '../context/ActiveUnitContext';

jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: jest.fn() }));

const loginAs = (role, viewRole = null, isLoading = false) => {
  localStorage.setItem('token', 'fake-token');
  localStorage.setItem('currentUser', JSON.stringify({ id: 'u1', role }));
  useActiveUnit.mockReturnValue({ activeViewRole: viewRole, isLoading });
};

const renderAt = (allowedRoles) => render(
  <MemoryRouter initialEntries={['/secret']}>
    <Routes>
      <Route path="/secret" element={<ProtectedRoute allowedRoles={allowedRoles}><p>secret page</p></ProtectedRoute>} />
      <Route path="/login" element={<p>login page</p>} />
      <Route path="/uc-dashboard" element={<p>uc dashboard</p>} />
      <Route path="/tutor-dashboard" element={<p>tutor dashboard</p>} />
      <Route path="/admin-dashboard" element={<p>admin dashboard</p>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  localStorage.clear();
  useActiveUnit.mockReturnValue({ activeViewRole: null, isLoading: false });
});

test('FE-03 no token goes to login', () => {
  renderAt(['coordinator']);
  expect(screen.getByText('login page')).toBeInTheDocument();
});

test('FE-04 a coordinator can open a coordinator page', () => {
  loginAs('coordinator');
  renderAt(['coordinator']);
  expect(screen.getByText('secret page')).toBeInTheDocument();
});

test('FE-05 a tutor opening a coordinator page is sent to the tutor dashboard', () => {
  loginAs('tutor');
  renderAt(['coordinator']);
  expect(screen.getByText('tutor dashboard')).toBeInTheDocument();
});

test('FE-06 an admin opening a tutor page is sent to the admin dashboard', () => {
  loginAs('admin');
  renderAt(['tutor']);
  expect(screen.getByText('admin dashboard')).toBeInTheDocument();
});

test('FE-07 a coordinator viewing a unit as a tutor uses the tutor view', () => {
  loginAs('coordinator', 'tutor');
  renderAt(['coordinator']);
  expect(screen.getByText('tutor dashboard')).toBeInTheDocument();
});

test('FE-08 nothing is shown while the unit roles are still loading', () => {
  loginAs('coordinator', null, true);
  const { container } = renderAt(['coordinator']);
  expect(container).toBeEmptyDOMElement();
});

test('FE-09 a page with no role list only needs a login', () => {
  loginAs('tutor');
  renderAt(undefined);
  expect(screen.getByText('secret page')).toBeInTheDocument();
});
