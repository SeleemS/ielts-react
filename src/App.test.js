import { render, screen } from '@testing-library/react';
import HomePage from './pages/HomePage';

test('renders IELTS-Bank title', () => {
  render(<HomePage />);
  const titleElement = screen.getByText(/IELTS-Bank/i);
  expect(titleElement).toBeInTheDocument();
});
