import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

import UCDashboard from './UCDashboard';
import { notificationsAPI, ucDashboardAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';

// ---------- Mocks ----------

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../config/api', () => ({
  ucDashboardAPI: { getSummary: jest.fn() },
  notificationsAPI: { getAll: jest.fn(), markRead: jest.fn() },
}));

jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: jest.fn() }));

jest.mock('../components/UCSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => title);
jest.mock('../utils/time', () => ({ formatTimeAgo: () => '5 minutes ago' }));
jest.mock('../utils/userName', () => ({ getDisplayName: (user) => (user && user.name) || 'there' }));
jest.mock('lucide-react', () => ({
  LayoutGrid: () => null,
  CalendarDays: () => null,
  Users: () => null,
  FileText: () => null,
  Clock: () => null,
  ListChecks: () => null,
  RefreshCw: () => null,
  MessageSquare: () => null,
}));

// ---------- Test data ----------

const summary = {
  activeUnitCount: 3,
  totalUnits: 5,
  pendingRequestsCount: 2,
  unassignedSessions: 0,
  totalSessions: 12,
  pendingConfirmations: 4,
};

const makeNotification = (overrides = {}) => ({
  id: 1,
  title: 'New session request',
  createdAt: '2026-09-25T10:00:00Z',
  isRead: false,
  actionUrl: '/uc-requests',
  ...overrides,
});

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <UCDashboard />
    </MemoryRouter>
  );

// ---------- Setup ----------

beforeEach(() => {
  mockNavigate.mockReset();
  localStorage.clear();
  localStorage.setItem('currentUser', JSON.stringify({ name: 'Sam' }));

  useActiveUnit.mockReturnValue({ isLoading: false });
  ucDashboardAPI.getSummary.mockResolvedValue(summary);
  notificationsAPI.getAll.mockResolvedValue({ notifications: [] });
  notificationsAPI.markRead.mockResolvedValue({});

  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- Tests ----------

describe('UCDashboard', () => {
  describe('loading and error states', () => {
    test('shows a loading message while the summary is loading', () => {
      ucDashboardAPI.getSummary.mockReturnValue(new Promise(() => {}));
      renderDashboard();
      expect(screen.getByText(/loading your dashboard/i)).toBeInTheDocument();
    });

    test('shows a loading message while units are loading', async () => {
      useActiveUnit.mockReturnValue({ isLoading: true });
      renderDashboard();
      await waitFor(() => expect(ucDashboardAPI.getSummary).toHaveBeenCalled());
      expect(screen.getByText(/loading your dashboard/i)).toBeInTheDocument();
    });

    test('shows an error message when the summary fails to load', async () => {
      ucDashboardAPI.getSummary.mockRejectedValue(new Error('Server down'));
      renderDashboard();
      expect(await screen.findByText(/could not load your dashboard/i)).toBeInTheDocument();
    });
  });

  describe('welcome and stats', () => {
    test('greets the user by name from localStorage', () => {
      renderDashboard();
      expect(screen.getByRole('heading', { name: 'Welcome back, Sam' })).toBeInTheDocument();
    });

    test('still renders when no user is saved', () => {
      localStorage.clear();
      renderDashboard();
      expect(screen.getByRole('heading', { name: 'Welcome back, there' })).toBeInTheDocument();
    });

    test('displays the numbers from the summary', async () => {
      renderDashboard();

      const units = await screen.findByRole('link', { name: /active units/i });
      expect(within(units).getByText('3')).toBeInTheDocument();
      expect(within(units).getByText('of 5 total')).toBeInTheDocument();

      const requests = screen.getByRole('link', { name: /pending requests/i });
      expect(within(requests).getByText('2')).toBeInTheDocument();

      const unassigned = screen.getByRole('link', { name: /unassigned sessions/i });
      expect(within(unassigned).getByText('0')).toBeInTheDocument();
      expect(within(unassigned).getByText('of 12 total')).toBeInTheDocument();

      const confirmations = screen.getByRole('link', { name: /awaiting tutor confirmation/i });
      expect(within(confirmations).getByText('4')).toBeInTheDocument();
    });

    test('highlights stat cards with a warning only when the count is above zero', async () => {
      renderDashboard();

      expect(await screen.findByRole('link', { name: /pending requests/i })).toHaveClass('warn');
      expect(screen.getByRole('link', { name: /awaiting tutor confirmation/i })).toHaveClass('warn');
      expect(screen.getByRole('link', { name: /unassigned sessions/i })).not.toHaveClass('warn');
    });

    test('stat cards link to the right pages', async () => {
      renderDashboard();

      expect(await screen.findByRole('link', { name: /active units/i })).toHaveAttribute('href', '/unit-setup');
      expect(screen.getByRole('link', { name: /pending requests/i })).toHaveAttribute('href', '/uc-requests');
      expect(screen.getByRole('link', { name: /unassigned sessions/i })).toHaveAttribute('href', '/sessions');
    });
  });

  describe('quick actions', () => {
    test.each([
      ['Sessions', '/sessions'],
      ['Tutors', '/tutors'],
      ['Applications', '/tutor-applications'],
      ['Availability', '/uc-availability'],
      ['Schedule Builder', '/schedule-builder'],
      ['Requests', '/uc-requests'],
      ['Messages', '/messages'],
      ['View All Units', '/unit-setup'],
    ])('"%s" links to %s', async (label, href) => {
      renderDashboard();
      expect(await screen.findByRole('link', { name: label })).toHaveAttribute('href', href);
    });
  });

  describe('notifications', () => {
    test('shows an empty message when there are no notifications', async () => {
      renderDashboard();
      expect(await screen.findByText(/no notifications yet/i)).toBeInTheDocument();
    });

    test('shows at most 5 notifications', async () => {
      const many = Array.from({ length: 7 }, (_, i) =>
        makeNotification({ id: i + 1, title: `Notification ${i + 1}` })
      );
      notificationsAPI.getAll.mockResolvedValue({ notifications: many });

      renderDashboard();

      expect(await screen.findByText('Notification 1')).toBeInTheDocument();
      expect(screen.getByText('Notification 5')).toBeInTheDocument();
      expect(screen.queryByText('Notification 6')).not.toBeInTheDocument();
    });

    test('clicking an unread notification marks it read and navigates', async () => {
      notificationsAPI.getAll.mockResolvedValue({ notifications: [makeNotification()] });
      renderDashboard();

      await userEvent.click(await screen.findByRole('button', { name: /new session request/i }));

      expect(notificationsAPI.markRead).toHaveBeenCalledWith(1);
      expect(mockNavigate).toHaveBeenCalledWith('/uc-requests');
    });

    test('clicking an already-read notification navigates without marking it read', async () => {
      notificationsAPI.getAll.mockResolvedValue({
        notifications: [makeNotification({ isRead: true })],
      });
      renderDashboard();

      await userEvent.click(await screen.findByRole('button', { name: /new session request/i }));

      expect(notificationsAPI.markRead).not.toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/uc-requests');
    });

    test('still navigates if marking as read fails', async () => {
      notificationsAPI.getAll.mockResolvedValue({ notifications: [makeNotification()] });
      notificationsAPI.markRead.mockRejectedValue(new Error('Network error'));
      renderDashboard();

      await userEvent.click(await screen.findByRole('button', { name: /new session request/i }));

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/uc-requests'));
    });

    test('a notification without a link is disabled and does nothing', async () => {
      notificationsAPI.getAll.mockResolvedValue({
        notifications: [makeNotification({ actionUrl: null, title: 'FYI only' })],
      });
      renderDashboard();

      const button = await screen.findByRole('button', { name: /fyi only/i });
      expect(button).toBeDisabled();

      await userEvent.click(button);
      expect(notificationsAPI.markRead).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});