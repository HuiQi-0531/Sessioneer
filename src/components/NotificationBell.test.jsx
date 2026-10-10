// The bell switches to the notification's unit and role before following its link.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import { notificationsAPI } from '../config/api';

const mockSetActiveUnitId = jest.fn();
const mockSetActiveViewRole = jest.fn();
const IFB105 = '22222222-2222-2222-2222-222222222222';

jest.mock('../config/api', () => ({
  notificationsAPI: { getAll: jest.fn(), getUnreadCount: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn() }
}));
jest.mock('../context/ActiveUnitContext', () => ({
  useActiveUnit: () => ({
    allUnits: [
      { id: 'cab201', unitCode: 'CAB201', roles: ['coordinator'] },
      { id: IFB105, unitCode: 'IFB105', roles: ['tutor'] }
    ],
    activeUnitId: 'cab201',
    activeViewRole: 'coordinator',
    setActiveUnitId: mockSetActiveUnitId,
    setActiveViewRole: mockSetActiveViewRole
  })
}));

test('clicking an IFB105 notification while on CAB201 opens IFB105 as tutor', async () => {
  const n = { id: 'n1', title: 'New session assignment', content: 'THU session in IFB105', isRead: true,
    relatedUnitId: IFB105, actionUrl: `/tutor-schedule/${IFB105}`, createdAt: new Date().toISOString() };
  notificationsAPI.getAll.mockResolvedValue({ notifications: [n], unreadCount: 0 });
  render(
    <MemoryRouter initialEntries={['/uc-dashboard']}>
      <Routes>
        <Route path="/uc-dashboard" element={<NotificationBell />} />
        <Route path="/tutor-schedule/:unitId" element={<p>Tutor schedule page</p>} />
      </Routes>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
  fireEvent.click(await screen.findByText('New session assignment'));
  await waitFor(() => expect(screen.getByText('Tutor schedule page')).toBeInTheDocument());
  expect(mockSetActiveUnitId).toHaveBeenCalledWith(IFB105);
  expect(mockSetActiveViewRole).toHaveBeenCalledWith('tutor');
});