const express = require('express');
const crypto = require('crypto');
const supabase = require('../lib/supabase');

const router = express.Router();

// Raw body needed for signature verification
router.post('/lemonsqueezy', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify signature
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    const signature = req.headers['x-signature'];
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(req.body).digest('hex');

    if (signature !== digest) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const payload = JSON.parse(req.body.toString());
    const eventName = payload.meta.event_name;
    const data = payload.data;
    const userId = payload.meta.custom_data?.user_id;

    console.log(`Webhook received: ${eventName} for user ${userId}`);

    switch (eventName) {

      // Subscription created or trial started
      case 'subscription_created':
      case 'subscription_trial_started': {
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          lemonsqueezy_id: String(data.id),
          status: 'active',
          plan: 'premium',
          trial_ends_at: data.attributes.trial_ends_at,
          renews_at: data.attributes.renews_at,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'lemonsqueezy_id' });
        break;
      }

      // Payment successful - activate/keep active
      case 'subscription_payment_success': {
        await supabase.from('subscriptions')
          .update({
            status: 'active',
            renews_at: data.attributes.renews_at,
            updated_at: new Date().toISOString()
          })
          .eq('lemonsqueezy_id', String(data.id));
        break;
      }

      // Subscription cancelled - still active until period ends
      case 'subscription_cancelled': {
        await supabase.from('subscriptions')
          .update({
            status: 'cancelled',
            ends_at: data.attributes.ends_at,
            updated_at: new Date().toISOString()
          })
          .eq('lemonsqueezy_id', String(data.id));
        break;
      }

      // Subscription expired - revoke premium
      case 'subscription_expired':
      case 'subscription_payment_failed': {
        await supabase.from('subscriptions')
          .update({
            status: 'expired',
            updated_at: new Date().toISOString()
          })
          .eq('lemonsqueezy_id', String(data.id));
        break;
      }

      // Subscription resumed
      case 'subscription_resumed': {
        await supabase.from('subscriptions')
          .update({
            status: 'active',
            updated_at: new Date().toISOString()
          })
          .eq('lemonsqueezy_id', String(data.id));
        break;
      }
    }

    res.json({ success: true });

  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

module.exports = router;
