# Deploy VPS PostgreSQL

## 1. Environment

Copy `.env.example` to `.env` and fill the VPS PostgreSQL connection:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/mandarin_class?schema=public"
JWT_SECRET="use-a-long-random-secret-minimum-32-characters"
DEFAULT_TEACHER_USERNAME="laoshi"
DEFAULT_TEACHER_PASSWORD="replace-this-password"
IMPORT_API_TOKEN="use-a-different-long-random-secret"
PUBLIC_APP_URL="https://kelas.example.com"
PORT=3001
```

## 2. Install and Prepare Database

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
```

The seed creates the first teacher account from `DEFAULT_TEACHER_USERNAME` and `DEFAULT_TEACHER_PASSWORD`.

Generate secrets with:

```bash
openssl rand -base64 32
```

After schema/security updates:

```bash
npm run db:generate
npm run db:push
npm run db:seed
npm run build
pm2 restart mandarin-class
```

Use HTTPS. Keep PostgreSQL bound to localhost/internal network only.

Use `db:push` for the current MVP. When the schema is stable, switch to migration files.

## 3. Build and Run

```bash
npm run build
npm run start
```

On Windows:

```powershell
npm run start:win
```

This app must run through `server.js`, not plain `next start`, because Socket.IO realtime monitoring is attached to the custom HTTP server.

## 4. Nginx Reverse Proxy Example

```nginx
server {
  server_name kelas.yourdomain.com;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Use HTTPS before using it with students.
