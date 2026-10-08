import React from 'react';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import Messages from './Messages';
import { messagesAPI, sessionsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import { getSocket } from '../utils/socket';

// ---------- Mocks ----------

jest.mock('../config/api', () => ({
  messagesAPI: {
    getUnitContacts: jest.fn(),
    getGroupUnreadCount: jest.fn(),
    getThread: jest.fn(),
    getGroupThread: jest.fn(),
    markGroupRead: jest.fn(),
    markRead: jest.fn(),
    send: jest.fn(),
    sendGroup: jest.fn(),
  },
  sessionsAPI: { getAll: jest.fn() },
}));

jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: jest.fn() }));
jest.mock('../utils/socket', () => ({ getSocket: jest.fn() }));
jest.mock('../utils/userName', () => ({
  getAvatarLetter: (value) => String((value && value.name) || value || 'U').charAt(0),
  getDisplayName: (user, fallback) => (user && user.name) || fallback,
}));
jest.mock('../components/UCSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => title);

// ---------- Test data ----------

const u1 = { id: 'u1', unitCode: 'FIT1001', roles: ['coordinator'], isActive: true };
const u2 = { id: 'u2', unitCode: 'FIT2002', roles: ['coordinator'], isActive: true };
const u3 = { id: 'u3', unitCode: 'FIT3003', roles: ['coordinator'], isActive: false }; // inactive
const u4 = { id: 'u4', unitCode: 'FIT4004', roles: ['tutor'], isActive: true }; // not coordinating
const allUnits = [u1, u2, u3, u4];

const contacts = [
  { userId: 'c1', name: 'Zoe Park', email: 'zoe@uni.edu', lastMessageAt: '2026-09-25T09:00:00Z', unreadCount: 2 },
  { userId: 'c2', name: 'Adam Lee', email: 'adam@uni.edu', lastMessageAt: '2026-09-25T11:00:00Z', unreadCount: 0 },
  { userId: 'c3', name: 'Mia Chen', lastMessageAt: null, unreadCount: 0 },
  { userId: 'c4', name: 'Ben Ong', lastMessageAt: null, unreadCount: 0 },
];

const groupThread = [
  { id: 'g1', senderId: 'c2', senderName: 'Adam Lee', content: 'Hello team', sentAt: '2026-09-25T10:00:00Z', isMine: false },
  { id: 'g2', senderId: 'me', content: 'Hi all', sentAt: '2026-09-25T10:05:00Z', isMine: true },
  {
    id: 'g3', senderId: 'c2', senderName: 'Adam Lee', content: '', sentAt: '2026-09-25T10:10:00Z', isMine: false,
    attachmentUrl: 'https://example.com/photo.png', attachmentType: 'image/png', attachmentName: 'photo.png',
  },
];

const zoeThread = [
  { id: 'd1', senderId: 'c1', content: 'Can you swap Friday?', sentAt: '2026-09-25T09:00:00Z', isMine: false },
  {
    id: 'd2', senderId: 'me', content: 'Sure', sentAt: '2026-09-25T09:05:00Z', isMine: true,
    attachmentUrl: 'https://example.com/roster.pdf', attachmentType: 'application/pdf',
    attachmentName: 'roster.pdf', attachmentSize: 2048,
  },
];

const unitSessions = [
  { id: 's1', assignedTutorId: 'c1', day: 'MON', startTime: '09:00:00', endTime: '10:00:00', sessionCode: 'T01', location: 'Room 1' },
  { id: 's2', assignedTutorId: 'other', day: 'TUE', startTime: '10:00:00', endTime: '11:00:00', sessionCode: 'T02', location: 'Room 2' },
];

// A pretend socket that lets tests send "live" messages
const createFakeSocket = () => {
  const handlers = {};
  return {
    emit: jest.fn(),
    on: jest.fn((event, fn) => { handlers[event] = fn; }),
    off: jest.fn((event, fn) => { if (handlers[event] === fn) delete handlers[event]; }),
    trigger: (event, payload) => handlers[event] && handlers[event](payload),
  };
};

let fakeSocket;

// ---------- Helpers ----------

const renderAndWait = async () => {
  render(<Messages />);
  await screen.findByText('Hello team');
  await screen.findByText('Zoe Park');
  await waitFor(() => expect(messagesAPI.getGroupUnreadCount).toHaveBeenCalledTimes(2));
};

const contactItem = (name) => screen.getByText(name).closest('.msg-contact-item');
const contactNames = () =>
  Array.from(document.querySelectorAll('.msg-contact-name')).map(el => el.textContent);
const messageInput = () => screen.getByPlaceholderText('Send Message...');
const sendButton = () => screen.getByRole('button', { name: 'Send' });
const fileInput = () => document.querySelector('input[type="file"]');
const profile = () => within(document.querySelector('.msg-profile-col'));

const openZoe = async () => {
  await userEvent.click(screen.getByText('Zoe Park'));
  await screen.findByText('Can you swap Friday?');
  await waitFor(() => expect(messagesAPI.markRead).toHaveBeenCalledWith('c1'));
};

const socketEvent = (event, payload) => act(() => { fakeSocket.trigger(event, payload); });

// Runs the 30-second refresh once, without waiting 30 seconds
const runPoll = async () => {
  const pollCalls = window.setInterval.mock.calls.filter(call => call[1] === 30000);
  const latestPoll = pollCalls[pollCalls.length - 1][0];
  await act(async () => { latestPoll(); });
};

// ---------- Setup ----------

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('currentUser', JSON.stringify({ id: 'me', name: 'Sam' }));
  useActiveUnit.mockReturnValue({ allUnits, activeUnit: u1, isLoading: false });

  fakeSocket = createFakeSocket();
  getSocket.mockReturnValue(fakeSocket);

  messagesAPI.getUnitContacts.mockImplementation(() => Promise.resolve(contacts.map(c => ({ ...c }))));
  messagesAPI.getGroupUnreadCount.mockResolvedValue({ unreadCount: 0 });
  messagesAPI.getGroupThread.mockResolvedValue(groupThread);
  messagesAPI.getThread.mockResolvedValue(zoeThread);
  messagesAPI.markGroupRead.mockResolvedValue({});
  messagesAPI.markRead.mockResolvedValue({});
  messagesAPI.send.mockResolvedValue({});
  messagesAPI.sendGroup.mockResolvedValue({});
  sessionsAPI.getAll.mockResolvedValue(unitSessions);

  // Things the browser has but jsdom doesn't
  Element.prototype.scrollIntoView = jest.fn();
  URL.createObjectURL = jest.fn(() => 'blob:fake');
  URL.revokeObjectURL = jest.fn();

  jest.spyOn(window, 'setInterval');
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- Tests ----------

describe('Messages (coordinator)', () => {
  describe('page setup', () => {
    test('shows a loading message while units load', () => {
      useActiveUnit.mockReturnValue({ allUnits, activeUnit: u1, isLoading: true });
      render(<Messages />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    test('lists only active units the user coordinates', async () => {
      await renderAndWait();
      expect(screen.getByText('#FIT1001')).toHaveClass('active');
      expect(screen.getByText('#FIT2002')).not.toHaveClass('active');
      expect(screen.queryByText('#FIT3003')).not.toBeInTheDocument();
      expect(screen.queryByText('#FIT4004')).not.toBeInTheDocument();
    });

    test('opens the active unit\'s group chat and marks it read', async () => {
      await renderAndWait();

      expect(screen.getByText('#FIT1001 Group Chat')).toBeInTheDocument();
      expect(contactItem('Group Chat')).toHaveClass('selected');
      expect(messagesAPI.getGroupThread).toHaveBeenCalledWith('u1');
      expect(messagesAPI.markGroupRead).toHaveBeenCalledWith('u1');
      expect(fakeSocket.emit).toHaveBeenCalledWith('join-unit', 'u1');
    });
  });

  describe('contacts', () => {
    test('sorts contacts by most recent message, then by name, with unread badges', async () => {
      await renderAndWait();

      expect(contactNames()).toEqual(['Group Chat', 'Adam Lee', 'Zoe Park', 'Ben Ong', 'Mia Chen']);
      expect(within(contactItem('Zoe Park')).getByText('2')).toHaveClass('msg-unread-badge');
      expect(contactItem('Zoe Park')).toHaveClass('has-unread');
      expect(contactItem('Adam Lee')).not.toHaveClass('has-unread');
    });

    test('choosing another unit loads its contacts and group chat', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByText('#FIT2002'));

      expect(await screen.findByText('#FIT2002 Group Chat')).toBeInTheDocument();
      expect(messagesAPI.getUnitContacts).toHaveBeenCalledWith('u2');
      expect(messagesAPI.getGroupThread).toHaveBeenCalledWith('u2');
      expect(fakeSocket.emit).toHaveBeenCalledWith('join-unit', 'u2');
      expect(screen.getByText('#FIT2002')).toHaveClass('active');
    });
  });

  describe('message thread', () => {
    test('shows my messages as "You" and others by name', async () => {
      await renderAndWait();

      const mine = screen.getByText('Hi all').closest('.msg-bubble-row');
      expect(mine).toHaveClass('mine');
      expect(within(mine).getByText(/^You - /)).toBeInTheDocument();

      const theirs = screen.getByText('Hello team').closest('.msg-bubble-row');
      expect(theirs).toHaveClass('theirs');
      expect(within(theirs).getByText(/^Adam Lee - /)).toBeInTheDocument();
    });

    test('shows image attachments as a picture linking to the file', async () => {
      await renderAndWait();
      const image = screen.getByRole('img', { name: 'photo.png' });

      expect(image).toHaveAttribute('src', 'https://example.com/photo.png');
      expect(image.closest('a')).toHaveAttribute('href', 'https://example.com/photo.png');
    });

    test('shows other attachments as a file link with its size', async () => {
      await renderAndWait();
      await openZoe();

      expect(screen.getByText('roster.pdf').closest('a')).toHaveAttribute('href', 'https://example.com/roster.pdf');
      expect(screen.getByText('2 KB')).toBeInTheDocument();
    });
  });

  describe('direct messages', () => {
    test('clicking a tutor opens a direct chat and marks it read', async () => {
      await renderAndWait();
      await openZoe();

      expect(screen.getByText('#FIT1001 - Zoe Park')).toBeInTheDocument();
      expect(contactItem('Zoe Park')).toHaveClass('selected');
      expect(contactItem('Group Chat')).not.toHaveClass('selected');
      expect(messagesAPI.getThread).toHaveBeenCalledWith('c1');
      expect(screen.getByText(/^Zoe Park - /)).toBeInTheDocument();
      expect(screen.queryByText('Hello team')).not.toBeInTheDocument();
      await waitFor(() => expect(messagesAPI.getUnitContacts).toHaveBeenCalledTimes(2)); // refreshed badges
    });

    test('clicking "Group Chat" goes back to the group', async () => {
      await renderAndWait();
      await openZoe();
      await userEvent.click(screen.getByText('Group Chat'));

      expect(await screen.findByText('Hello team')).toBeInTheDocument();
      expect(screen.getByText('#FIT1001 Group Chat')).toBeInTheDocument();
    });

    test('clicking the chat header shows the tutor\'s profile and their sessions', async () => {
      await renderAndWait();
      await openZoe();
      await userEvent.click(screen.getByText('#FIT1001 - Zoe Park'));

      expect(sessionsAPI.getAll).toHaveBeenCalledWith('u1');
      const panel = profile();
      expect(panel.getByText('Zoe Park')).toBeInTheDocument();
      expect(panel.getByText('Tutor')).toBeInTheDocument();
      expect(panel.getByText('zoe@uni.edu')).toBeInTheDocument();
      expect(panel.getByText('FIT1001')).toBeInTheDocument();
      expect(await panel.findByText('T01 - Room 1')).toBeInTheDocument();
      expect(panel.getByText('09:00-10:00')).toBeInTheDocument();
      expect(panel.queryByText('T02 - Room 2')).not.toBeInTheDocument(); // someone else's session

      await userEvent.click(panel.getByRole('button', { name: '×' }));
      expect(document.querySelector('.msg-profile-col')).not.toBeInTheDocument();
    });

    test('the group header has no profile, and a tutor with no sessions says so', async () => {
      sessionsAPI.getAll.mockResolvedValue([]);
      await renderAndWait();

      await userEvent.click(screen.getByText('#FIT1001 Group Chat'));
      expect(document.querySelector('.msg-profile-col')).not.toBeInTheDocument();
      expect(sessionsAPI.getAll).not.toHaveBeenCalled();

      await openZoe();
      await userEvent.click(screen.getByText('#FIT1001 - Zoe Park'));
      expect(await profile().findByText('No sessions assigned yet.')).toBeInTheDocument();
    });
  });

  describe('sending', () => {
    test('Send is disabled until there is a message or attachment', async () => {
      await renderAndWait();
      expect(sendButton()).toBeDisabled();

      await userEvent.type(messageInput(), '   ');
      expect(sendButton()).toBeDisabled();

      await userEvent.type(messageInput(), 'Hi');
      expect(sendButton()).toBeEnabled();
    });

    test('sends a group message, clears the box and reloads the chat', async () => {
      await renderAndWait();
      await userEvent.type(messageInput(), 'Hello');
      await userEvent.click(sendButton());

      expect(messagesAPI.sendGroup).toHaveBeenCalledWith('u1', 'Hello', null);
      await waitFor(() => expect(messagesAPI.getGroupThread).toHaveBeenCalledTimes(2));
      expect(messageInput()).toHaveValue('');
    });

    test('pressing Enter sends, with extra spaces trimmed', async () => {
      await renderAndWait();
      await userEvent.type(messageInput(), '  Hi there  {enter}');

      expect(messagesAPI.sendGroup).toHaveBeenCalledWith('u1', 'Hi there', null);
    });

    test('sends a direct message and refreshes the chat and contacts', async () => {
      await renderAndWait();
      await openZoe();
      const contactLoads = messagesAPI.getUnitContacts.mock.calls.length;

      await userEvent.type(messageInput(), 'Thanks');
      await userEvent.click(sendButton());

      expect(messagesAPI.send).toHaveBeenCalledWith('c1', 'Thanks', null);
      await waitFor(() => expect(messagesAPI.getThread).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(messagesAPI.getUnitContacts.mock.calls.length).toBeGreaterThan(contactLoads));
      expect(messagesAPI.sendGroup).not.toHaveBeenCalled();
    });

    test('shows an alert and keeps the text if sending fails', async () => {
      messagesAPI.sendGroup.mockRejectedValue(new Error('Network down'));
      await renderAndWait();
      await userEvent.type(messageInput(), 'Hello');
      await userEvent.click(sendButton());

      await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Network down'));
      expect(messageInput()).toHaveValue('Hello');
    });

    test('a file can be attached and sent on its own', async () => {
      const file = new File(['a'.repeat(2048)], 'notes.pdf', { type: 'application/pdf' });
      await renderAndWait();
      await userEvent.upload(fileInput(), file);

      const preview = within(document.querySelector('.msg-attachment-preview'));
      expect(preview.getByText('notes.pdf')).toBeInTheDocument();
      expect(preview.getByText('2 KB')).toBeInTheDocument();
      expect(sendButton()).toBeEnabled();

      await userEvent.click(sendButton());

      expect(messagesAPI.sendGroup).toHaveBeenCalledWith('u1', '', file);
      await waitFor(() => expect(document.querySelector('.msg-attachment-preview')).not.toBeInTheDocument());
    });

    test('an image attachment shows a preview and can be removed', async () => {
      const image = new File(['img'], 'pic.png', { type: 'image/png' });
      await renderAndWait();
      await userEvent.upload(fileInput(), image);

      expect(screen.getByRole('img', { name: 'pic.png' })).toHaveAttribute('src', 'blob:fake');

      await userEvent.click(screen.getByRole('button', { name: 'Remove attachment' }));

      expect(document.querySelector('.msg-attachment-preview')).not.toBeInTheDocument();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
      expect(sendButton()).toBeDisabled();
    });

    test('files over 5 MB are rejected', async () => {
      const bigFile = new File(['x'], 'huge.pdf', { type: 'application/pdf' });
      Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 });
      await renderAndWait();
      await userEvent.upload(fileInput(), bigFile);

      expect(window.alert).toHaveBeenCalledWith('File is too large. Please choose a file under 5 MB.');
      expect(document.querySelector('.msg-attachment-preview')).not.toBeInTheDocument();
    });
  });

  describe('live messages', () => {
    test('a new message from the open tutor appears and is marked read', async () => {
      await renderAndWait();
      await openZoe();

      socketEvent('direct-message', {
        id: 'd9', senderId: 'c1', recipientId: 'me', content: 'New one', sentAt: '2026-09-25T09:10:00Z',
      });

      expect(await screen.findByText('New one')).toBeInTheDocument();
      await waitFor(() => expect(messagesAPI.markRead).toHaveBeenCalledTimes(2));
    });

    test('a message from someone else is not added to the open chat, but contacts refresh', async () => {
      await renderAndWait();
      const contactLoads = messagesAPI.getUnitContacts.mock.calls.length;

      socketEvent('direct-message', {
        id: 'd10', senderId: 'c2', recipientId: 'me', content: 'Other message', sentAt: '2026-09-25T09:10:00Z',
      });

      await waitFor(() => expect(messagesAPI.getUnitContacts.mock.calls.length).toBeGreaterThan(contactLoads));
      expect(screen.queryByText('Other message')).not.toBeInTheDocument();
    });

    test('a group message appears once in the open group chat', async () => {
      await renderAndWait();
      const message = { id: 'g9', senderId: 'c2', senderName: 'Adam Lee', content: 'Group news', sentAt: '2026-09-25T10:20:00Z' };

      socketEvent('group-message', { unitId: 'u1', message });
      socketEvent('group-message', { unitId: 'u1', message }); // same message twice

      expect(await screen.findByText('Group news')).toBeInTheDocument();
      expect(screen.getAllByText('Group news')).toHaveLength(1);
      expect(messagesAPI.markGroupRead).toHaveBeenCalledTimes(3); // once on open, once per live message
    });

    test('a group message while in a direct chat updates the group unread badge', async () => {
      await renderAndWait();
      await openZoe();
      messagesAPI.getGroupUnreadCount.mockResolvedValue({ unreadCount: 4 });

      socketEvent('group-message', {
        unitId: 'u1',
        message: { id: 'g10', senderId: 'c2', senderName: 'Adam Lee', content: 'Missed this', sentAt: '2026-09-25T10:30:00Z' },
      });

      expect(await within(contactItem('Group Chat')).findByText('4')).toBeInTheDocument();
      expect(screen.queryByText('Missed this')).not.toBeInTheDocument();
    });
  });

  describe('auto refresh', () => {
    test('every 30 seconds it reloads the chat, contacts and unread count', async () => {
      await renderAndWait();
      const before = {
        thread: messagesAPI.getGroupThread.mock.calls.length,
        contacts: messagesAPI.getUnitContacts.mock.calls.length,
        unread: messagesAPI.getGroupUnreadCount.mock.calls.length,
      };

      await runPoll();

      expect(messagesAPI.getGroupThread.mock.calls.length).toBe(before.thread + 1);
      expect(messagesAPI.getUnitContacts.mock.calls.length).toBe(before.contacts + 1);
      expect(messagesAPI.getGroupUnreadCount.mock.calls.length).toBe(before.unread + 1);
    });
  });
});