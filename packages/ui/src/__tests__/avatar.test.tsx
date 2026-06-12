import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, avatarColorIndex, initialsFromName } from '../components/ui/avatar.js';

describe('initialsFromName', () => {
  it('takes first letters of first and last word, uppercased', () => {
    expect(initialsFromName('Caio Pereira')).toBe('CP');
  });
  it('handles a single word', () => {
    expect(initialsFromName('Acme')).toBe('AC');
  });
  it('handles empty/whitespace by returning "?"', () => {
    expect(initialsFromName('   ')).toBe('?');
  });
});

describe('avatarColorIndex', () => {
  it('is deterministic for the same name', () => {
    expect(avatarColorIndex('Acme', 6)).toBe(avatarColorIndex('Acme', 6));
  });
  it('stays within palette bounds', () => {
    for (const n of ['a', 'Beta Corp', 'Zzz', '李', 'Acme']) {
      const i = avatarColorIndex(n, 6);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(6);
    }
  });
  it('distributes different names (not all identical)', () => {
    const idxs = ['Acme', 'Beta', 'Gamma', 'Delta', 'Echo'].map((n) => avatarColorIndex(n, 6));
    expect(new Set(idxs).size).toBeGreaterThan(1);
  });
});

describe('Avatar', () => {
  it('renders initials', () => {
    render(<Avatar name="Caio Pereira" />);
    expect(screen.getByText('CP')).toBeTruthy();
  });
  it('exposes an accessible label', () => {
    render(<Avatar name="Acme" />);
    expect(screen.getByLabelText('Acme')).toBeTruthy();
  });
  it('shows the online dot only when online', () => {
    const { rerender } = render(<Avatar name="Acme" />);
    expect(screen.queryByTestId('avatar-online')).toBeNull();
    rerender(<Avatar name="Acme" online />);
    expect(screen.getByTestId('avatar-online')).toBeTruthy();
  });
});
