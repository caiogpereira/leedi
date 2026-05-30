import { Html, Body, Container, Heading, Text, Button, Section } from '@react-email/components';

export interface InvitationProps {
  acceptUrl: string;
  role: string;
}

/** Human-readable pt-BR labels for the tenant roles shown in the invite email. */
const ROLE_LABELS: Record<string, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  operator: 'Operador',
  viewer: 'Visualizador',
};

export default function Invitation({ acceptUrl, role }: InvitationProps) {
  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <Html lang="pt-BR">
      <Body style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#f4f4f5' }}>
        <Container style={{ padding: '24px', maxWidth: '480px' }}>
          <Section>
            <Heading as="h1">Você foi convidado para a Leedi</Heading>
            <Text>
              Você recebeu um convite para participar de uma equipe como {roleLabel}. Clique no
              botão abaixo para aceitar.
            </Text>
            <Button
              href={acceptUrl}
              style={{
                backgroundColor: '#111827',
                color: '#ffffff',
                padding: '12px 20px',
                borderRadius: '6px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Aceitar convite
            </Button>
            <Text style={{ color: '#6b7280', fontSize: '12px' }}>
              Este convite expira em 72 horas. Se você não reconhece este convite, ignore este
              e-mail.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
