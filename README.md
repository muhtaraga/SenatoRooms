# SenatoRoom

SenatoRoom is a single-page messaging MVP for private member chats and invited group chats called senates.

## Stack

- React + Vite SPA
- Node.js + Express API
- Socket.IO realtime messaging
- SQLite + Drizzle ORM
- Local file uploads for profile photos and message attachments

## Local Setup

1. Install dependencies:

   ```powershell
   npm.cmd install
   ```

2. Create `.env` from `.env.example` and set stable secrets:

   ```powershell
   Copy-Item .env.example .env
   ```

   Use a fixed `MESSAGE_ENCRYPTION_KEY`; changing it makes previously stored encrypted messages unreadable. Set `ADMIN_PHONE` to the phone number of the account that may use the localhost-only backup panel.

3. Apply the database migration:

   ```powershell
   npm.cmd run db:migrate
   ```

4. Start the app:

   ```powershell
   npm.cmd run dev
   ```

   Frontend: `http://localhost:5173`  
   Backend: `http://localhost:4000`

The first registered account receives the `owner` role. Admin backup requires both the configured `ADMIN_PHONE` account and a `localhost` request.

## Production Notes

- Set `JWT_SECRET` and `MESSAGE_ENCRYPTION_KEY` before publishing.
- Keep `data/`, `uploads/`, and `backups/` outside Git.
- The API is designed for a future mobile app: JSON REST endpoints plus Socket.IO events.
- Browser/system push notifications and real voice/video calls are not part of this MVP.

## Cloudflare Tunnel

Install `cloudflared`, authenticate it, then create a tunnel to the backend port:

```powershell
cloudflared tunnel login
cloudflared tunnel create senatoroom
cloudflared tunnel route dns senatoroom chat.example.com
cloudflared tunnel run --url http://localhost:4000 senatoroom
```

For a production build:

```powershell
npm.cmd run build
npm.cmd run db:migrate
npm.cmd start
```

Point the tunnel to `http://localhost:4000`. The Express server can serve API/upload traffic; Vite is for development.
