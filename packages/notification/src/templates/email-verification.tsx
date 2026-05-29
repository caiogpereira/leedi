import { Html, Body, Container, Heading, Text, Button, Section } from '@react-email/components';

export interface EmailVerificationProps {
  url: string;
}

export default function EmailVerification({ url }: EmailVerificationProps) {
  return (
    <Html lang="pt-BR">
      <Body style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#f4f4f5' }}>
        <Container style={{ padding: '24px', maxWidth: '480px' }}>
          <Section>
            <Heading as="h1">Verifique seu e-mail</Heading>
            <Text>Clique no botão abaixo para ativar sua conta Leedi.</Text>
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
              Verificar e-mail
            </Button>
            <Text style={{ color: '#6b7280', fontSize: '12px' }}>
              Este link expira em 24 horas. Se você não criou esta conta, ignore este e-mail.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
