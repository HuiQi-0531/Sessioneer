// The profile header shows the same role as the sidebar for the active unit.
import { render, screen } from '@testing-library/react';
import Profile from './Profile';
import { profileAPI } from '../config/api';

let mockUnitContext;
jest.mock('../config/api', () => ({ profileAPI: { get: jest.fn() } }));
jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: () => mockUnitContext }));
jest.mock('../components/TutorSidebar', () => () => null);
jest.mock('../components/UCSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => <h1>{title}</h1>);
jest.mock('../components/ProfileLanyard', () => ({ roleLabel }) => <p>Card: {roleLabel}</p>);

beforeEach(() => {
  localStorage.setItem('currentUser', JSON.stringify({ id: 'b1', name: 'Alex', role: 'coordinator' }));
  profileAPI.get.mockResolvedValue({ firstName: 'Alex', lastName: 'UC', email: 'alex@test.local', maximumHours: 60 });
});

const unit = (roles) => ({ id: 'u', unitCode: 'IFB105', roles });

test('a super tutor on the active unit is labelled Super Tutor, not Tutor', async () => {
  mockUnitContext = { activeViewRole: 'tutor', activeUnit: unit(['super_tutor']) };
  render(<Profile />);
  expect(await screen.findByText('Card: Super Tutor')).toBeInTheDocument();
  expect(screen.getAllByText('Super Tutor').length).toBeGreaterThan(0);
});

test('a plain tutor stays Tutor, and the UC view says Unit Coordinator', async () => {
  mockUnitContext = { activeViewRole: 'tutor', activeUnit: unit(['tutor']) };
  const { unmount } = render(<Profile />);
  expect(await screen.findByText('Card: Tutor')).toBeInTheDocument();
  unmount();
  mockUnitContext = { activeViewRole: 'coordinator', activeUnit: unit(['coordinator']) };
  render(<Profile />);
  expect(await screen.findByText('Card: Unit Coordinator')).toBeInTheDocument();
});