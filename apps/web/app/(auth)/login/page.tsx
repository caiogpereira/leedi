import { LoginForm } from './login-form';

interface LoginPageProps {
  // Next 15: searchParams is async. `?reset=success` is set by the password-reset
  // flow after a successful reset (Story 2.3, AC#2).
  searchParams: Promise<{ reset?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { reset } = await searchParams;
  return <LoginForm resetSuccess={reset === 'success'} />;
}
