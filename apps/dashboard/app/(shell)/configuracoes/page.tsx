import { redirect } from 'next/navigation';

// The "Configurações" sidebar item points at the section root; "Uso" is the
// first settings surface. Redirect so the nav link never 404s.
export default function ConfiguracoesPage() {
  redirect('/configuracoes/uso');
}
