import { redirect } from 'next/navigation';

// The "Agente" sidebar item points at the section root; the section's landing
// surface is the agent configuration. Redirect so the nav link never 404s.
export default function AgentePage() {
  redirect('/agente/configuracoes');
}
