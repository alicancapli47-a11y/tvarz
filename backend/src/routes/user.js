const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const supabase = require('../lib/supabase');
const axios = require('axios');

const router = express.Router();

// GET /user/profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .single();

    res.json({
      success: true,
      data: {
        user,
        subscription: sub || null,
        is_premium: !!sub
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /user/checkout - create Lemon Squeezy checkout
router.post('/checkout', authMiddleware, async (req, res) => {
  try {
    const response = await axios.post(
      'https://api.lemonsqueezy.com/v1/checkouts',
      {
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              email: req.user.email,
              name: req.user.name,
              custom: { user_id: req.user.id }
            },
            product_options: {
              redirect_url: `${process.env.FRONTEND_URL}?premium=success`,
              receipt_link_url: `${process.env.FRONTEND_URL}?premium=success`
            }
          },
          relationships: {
            store: {
              data: { type: 'stores', id: process.env.LEMONSQUEEZY_STORE_ID }
            },
            variant: {
              data: { type: 'variants', id: process.env.LEMONSQUEEZY_VARIANT_ID }
            }
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
          'Content-Type': 'application/vnd.api+json',
          Accept: 'application/vnd.api+json'
        }
      }
    );

    const checkoutUrl = response.data.data.attributes.url;
    res.json({ success: true, data: { checkout_url: checkoutUrl } });

  } catch (err) {
    console.error('Checkout error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'Checkout creation failed' });
  }
});

// GET /user/subscription
router.get('/subscription', authMiddleware, async (req, res) => {
  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    res.json({ success: true, data: { subscription: sub || null } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
