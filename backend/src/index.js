require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const programRoutes = require('./routes/program');
const webhookRoutes = require('./routes/webhook');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'https://tvarz.vercel.app'
  ],
  credentials: true
}));

// Webhook route needs raw body — must be BEFORE express.json()
app.use('/webhook', webhookRoutes);

// JSON body parser
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'tvarz-api', time: new Date().toISOString() });
});

// Routes
app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/program', programRoutes);
app.use('/admin', adminRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Tvarz API running on port ${PORT}`);
});
