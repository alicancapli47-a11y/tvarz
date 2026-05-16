const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /auth/google
// Body: { token: google_id_token }
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const { sub: google_id, email, name, picture } = payload;

    // Upsert user in Supabase
    const { data: user, error } = await supabase
      .from('users')
      .upsert({
        google_id,
        email,
        name,
        avatar: picture,
        updated_at: new Date().toISOString()
      }, { onConflict: 'google_id' })
      .select()
      .single();

    if (error) throw error;

    // Check active subscription
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    const isPremium = !!sub;

    // Issue JWT
    const jwtToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        is_premium: isPremium
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      data: {
        token: jwtToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          is_premium: isPremium
        }
      }
    });

  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ success: false, message: 'Authentication failed' });
  }
});

// GET /auth/me - refresh token & status
router.get('/me', require('../middleware/auth').authMiddleware, async (req, res) => {
  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .single();

    const isPremium = !!sub;

    // Re-issue token with fresh premium status
    const jwtToken = jwt.sign(
      { ...req.user, is_premium: isPremium },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      data: {
        token: jwtToken,
        user: { ...req.user, is_premium: isPremium }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error refreshing session' });
  }
});

module.exports = router;
