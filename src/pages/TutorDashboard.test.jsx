import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

import TutorDashboard from './TutorDashboard';
import { tutorDashboardAPI, notificationsAPI } from '../config/api';

// ---------- Mocks ----------

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../config/api', () => ({
  tutorDashboardAPI: { getSummary: jest.fn() },
  notificationsAPI: { getAll: jest.fn(), markRead: jest.fn() },
}));

jest.mock('../components/TutorSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => title);
jest.mock('../utils/time', () => ({ formatTimeAgo: () => '5 minutes ago' }));
jest.mock('../utils/userName', () => ({ getDisplayName: (user) => (user && user.name) || 'there' }));
jest.mock('lucide-react', () => ({
  CalendarDays: () => null,
  Clock: () => null,
  ListChecks: () => null,
  RefreshCw: () => null,
  MessageSquare: () => null,
  UserCog: () => null,
}));

// ---------- Test data ----------

const summary = {
  availabilitySubmittedCount: 2,
  pendingRequestsCount: 1,
  totalSessions: 6,
  confirmedSessions: 4,
};

const makeNotification = (overrides = {}) => ({
  id: 1,
  title: 'You have been assigned a new session',
  createdAt: '2026-09-25T10:00:00Z',
  isRead: false,
  actionUrl: '/tutor-schedule',
  ...overrides,
});

// ---------- Helpers ----------

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <TutorDashboard />
    </MemoryRouter>
  );

const renderAndWait = async () => {
  renderDashboard();
  await screen.findByText('Quick Actions');
};

// The stat card (a link) whose label is the given text
const statCard = (label) => screen.getByText(label, { selector: '.td-stat-label' }).closest('a');

// ---------- Setup ----------

beforeEach(() => {
  mockNavigate.mockReset();
  localStorage.clear();
  localStorage.setItem('currentUser', JSON.stringify({ name: 'Sam' }));

  tutorDashboardAPI.getSummary.mockResolvedValue(summary);
  notificationsAPI.getAll.mockResolvedValue({ notifications: [] });
  notificationsAPI.markRead.mockResolvedValue({});

  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- Tests ----------

describe('TutorDashboard', () => {
  describe('loading and error states', () => {
    test('shows a loading message while the summary loads', () => {
      tutorDashboardAPI.getSummary.mockReturnValue(new Promise(() => {}));
      renderDashboard();
      expect(screen.getByText('Loading your dashboard...')).toBeInTheDocument();
    });

    test('shows an error message when the summary fails to load', async () => {
      tutorDashboardAPI.getSummary.mockRejectedValue(new Error('Server down'));
      renderDashboard();
      expect(await screen.findByText('Could not load your dashboard. Please refresh.')).toBeInTheDocument();
    });
  });

  describe('welcome', () => {
    test('greets the user by name', () => {
      renderDashboard();
      expect(screen.getByRole('heading', { name: 'Welcome back, Sam' })).toBeInTheDocument();
    });

    test('still renders when no user is saved', () => {
      localStorage.clear();
      renderDashboard();
      expect(screen.getByRole('heading', { name: 'Welcome back, there' })).toBeInTheDocument();
    });
  });

  describe('stats', () => {
    test('shows request and session numbers', async () => {
      await renderAndWait();

      const requests = within(statCard('Pending Requests'));
      expect(requests.getByText('1')).toBeInTheDocument();
      expect(requests.getByText('Waiting for approval')).toBeInTheDocument();

      const sessions = within(statCard('Sessions'));
      expect(sessions.getByText('6')).toBeInTheDocument();
      expect(sessions.getByText('4 confirmed')).toBeInTheDocument();
    });

    test('shows "Submitted" when availability has been submitted', async () => {
      await renderAndWait();
      expect(within(statCard('Availability')).getByText('Submitted')).toBeInTheDocument();
    });

    test('shows "Not yet submitted" when availability has not been submitted', async () => {
      tutorDashboardAPI.getSummary.mockResolvedValue({ ...summary, availabilitySubmittedCount: 0 });
      await renderAndWait();
      expect(within(statCard('Availability')).getByText('Not yet submitted')).toBeInTheDocument();
    });

    test('stat cards link to the right pages', async () => {
      await renderAndWait();
      expect(statCard('Availability')).toHaveAttribute('href', '/availability');
      expect(statCard('Pending Requests')).toHaveAttribute('href', '/requests');
      expect(statCard('Sessions')).toHaveAttribute('href', '/tutor-schedule');
    });
  });

  describe('quick actions', () => {
    test.each([
      ['Sessions', '/tutor-sessions'],
      ['Availability', '/availability'],
      ['Schedule', '/tutor-schedule'],
      ['Requests', '/requests'],
      ['Messages', '/tutor-messages'],
      ['Edit Profile', '/profile'],
    ])('"%s" links to %s', async (label, href) => {
      await renderAndWait();
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    });
  });

  describe('notifications', () => {
    test('shows an empty message when there are no notifications', async () => {
      await renderAndWait();
      expect(screen.getByText('No notifications yet.')).toBeInTheDocument();
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
      expect(screen.getAllByText('5 minutes ago')).toHaveLength(5);
    });

    test('clicking an unread notification marks it read and navigates', async () => {
      notificationsAPI.getAll.mockResolvedValue({ notifications: [makeNotification()] });
      renderDashboard();

      await userEvent.click(await screen.findByRole('button', { name: /assigned a new session/i }));

      expect(notificationsAPI.markRead).toHaveBeenCalledWith(1);
      expect(mockNavigate).toHaveBeenCalledWith('/tutor-schedule');
    });

    test('clicking an already-read notification navigates without marking it read', async () => {
      notificationsAPI.getAll.mockResolvedValue({ notifications: [makeNotification({ isRead: true })] });
      renderDashboard();

      await userEvent.click(await screen.findByRole('button', { name: /assigned a new session/i }));

      expect(notificationsAPI.markRead).not.toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/tutor-schedule');
    });

    test('still navigates if marking as read fails', async () => {
      notificationsAPI.getAll.mockResolvedValue({ notifications: [makeNotification()] });
      notificationsAPI.markRead.mockRejectedValue(new Error('Network error'));
      renderDashboard();

      await userEvent.click(await screen.findByRole('button', { name: /assigned a new session/i }));

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/tutor-schedule'));
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