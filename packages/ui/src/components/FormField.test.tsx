import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FormField } from './FormField';
import { Input } from './ui/input';

afterEach(cleanup);

describe('FormField', () => {
  it('renders label with correct htmlFor pointing to input id', () => {
    render(
      <FormField id="email" label="E-mail">
        <Input />
      </FormField>
    );
    const label = screen.getByText('E-mail');
    expect(label.tagName.toLowerCase()).toBe('label');
    expect(label.getAttribute('for')).toBe('email');
    expect(screen.getByRole('textbox').getAttribute('id')).toBe('email');
  });

  it('does not render error element when no error', () => {
    render(
      <FormField id="name" label="Nome">
        <Input />
      </FormField>
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders error message with correct id and aria-describedby', () => {
    render(
      <FormField id="email" label="E-mail" error="E-mail é obrigatório">
        <Input />
      </FormField>
    );
    const error = screen.getByRole('alert');
    expect(error.textContent).toBe('E-mail é obrigatório');
    expect(error.id).toBe('email-error');
    expect(screen.getByRole('textbox').getAttribute('aria-describedby')).toBe('email-error');
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
  });

  it('sets aria-invalid only when error is present', () => {
    render(
      <FormField id="name" label="Nome">
        <Input />
      </FormField>
    );
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBeNull();
  });
});
