import { redirect } from 'next/navigation';

// The "Conhecimento" sidebar item points at the section root; FAQ is the first
// knowledge surface. Redirect so the nav link never 404s.
export default function ConhecimentoPage() {
  redirect('/conhecimento/faq');
}
