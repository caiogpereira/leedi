import { Html, Body, Container, Heading, Text, Button, Section } from '@react-email/components';

export interface PasswordResetProps {
  url: string;
}

export default function PasswordReset({ url }: PasswordResetProps) {
  return (
    <Html lang="pt-BR">
      <Body style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#f4f4f5' }}>
        <Container style={{ padding: '24px', maxWidth: '480px' }}>
          <Section>
            <Heading as="h1">Redefinição de senha</Heading>
            <Text>
              Clique no botão abaixo para redefinir sua senha. Este link é válido por 60 minutos.
            </Text>
            <Button
              href={url}
              style={{
                backgroundColor: '#111827',
                color: '#ffffff',
                padding: '12px 20px',
                borderRadius: '6px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Redefinir senha
            </Button>
            <Text style={{ color: '#6b7280', fontSize: '12px' }}>
              Se você não solicitou esta redefinição, ignore este e-mail.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
