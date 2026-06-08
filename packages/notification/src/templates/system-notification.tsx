import { Html, Body, Container, Heading, Text, Button, Section } from '@react-email/components';

export interface SystemNotificationProps {
  titulo: string;
  corpo: string;
}

export default function SystemNotification({ titulo, corpo }: SystemNotificationProps) {
  return (
    <Html lang="pt-BR">
      <Body style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#f4f4f5' }}>
        <Container style={{ padding: '24px', maxWidth: '480px' }}>
          <Section>
            <Heading as="h1" style={{ fontSize: '20px', marginBottom: '8px' }}>
              {titulo}
            </Heading>
            <Text style={{ color: '#374151', lineHeight: '1.6' }}>{corpo}</Text>
            <Button
              href="https://app.leedi.digital"
              style={{
                backgroundColor: '#111827',
                color: '#ffffff',
                padding: '12px 20px',
                borderRadius: '6px',
                textDecoration: 'none',
                display: 'inline-block',
                marginTop: '16px',
              }}
            >
              Ir para o painel
            </Button>
            <Text style={{ color: '#9ca3af', fontSize: '11px', marginTop: '24px' }}>
              Você recebeu esta notificação porque está cadastrado na plataforma Leedi.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
