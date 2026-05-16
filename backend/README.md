# Tvarz Backend API

Node.js + Express backend for Tvarz — deployed on Railway.

## Stack
- **Runtime**: Node.js 18+
- **Framework**: Express
- **Database**: Supabase (PostgreSQL)
- **Auth**: Google OAuth + JWT
- **Payments**: Lemon Squeezy
- **Deploy**: Railway

## Setup

### 1. Supabase
1. Create project at supabase.com
2. Run `supabase-schema.sql` in SQL Editor
3. Copy Project URL and service_role key

### 2. Google OAuth
1. Go to console.cloud.google.com
2. Create new project → Enable Google+ API
3. OAuth 2.0 → Create credentials
4. Authorized origins: `https://tvarz.vercel.app`
5. Copy Client ID and Secret

### 3. Lemon Squeezy
1. Create account at lemonsqueezy.com
2. Create a Store → Create Product → Create Variant ($3.99/mo, 3 day trial)
3. Get API key from Settings → API
4. Set webhook URL: `https://your-railway-url/webhook/lemonsqueezy`
5. Copy Store ID, Variant ID, Webhook Secret

### 4. Railway Deploy
1. Push this folder to GitHub under `tvarz/backend`
2. Railway → New Service → GitHub Repo → select `tvarz` → Root: `backend`
3. Add all environment variables from `.env.example`
4. Deploy

## API Endpoints

### Auth
- `POST /auth/google` — Google OAuth login
- `GET /auth/me` — Refresh session

### User
- `GET /user/profile` — Get user + subscription info
- `POST /user/checkout` — Create Lemon Squeezy checkout URL
- `GET /user/subscription` — Get subscription status

### Program
- `GET /program/stream` — Current live stream data (free)
- `GET /program/schedule?days=7` — Weekly schedule (free)
- `GET /program/archive?category=film` — All videos (premium-locked)
- `GET /program/video/:id` — Single video (premium check)

### Webhook
- `POST /webhook/lemonsqueezy` — Payment webhook

## Environment Variables

See `.env.example` for all required variables.
