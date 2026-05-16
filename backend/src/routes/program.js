const express = require('express');
const { authMiddleware, premiumMiddleware } = require('../middleware/auth');
const supabase = require('../lib/supabase');

const router = express.Router();

// GET /program/stream - current live stream (free)
router.get('/stream', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:00`;

    const { data: programs, error } = await supabase
      .from('programs')
      .select(`
        *,
        videos (
          id, title, youtube_id, duration, category, thumbnail_url, description, is_premium
        )
      `)
      .eq('program_date', today)
      .order('start_time', { ascending: true });

    if (error) throw error;

    // Find currently playing
    let currentIdx = 0;
    programs.forEach((p, i) => {
      if (p.start_time <= currentTime) currentIdx = i;
    });

    const current = programs[currentIdx] || null;
    const upcoming = programs.slice(currentIdx + 1);

    res.json({
      success: true,
      data: {
        current,
        upcoming,
        all: programs,
        server_time: now.toISOString()
      }
    });
  } catch (err) {
    console.error('Stream error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /program/schedule - weekly schedule (free)
router.get('/schedule', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const dates = [];
    for (let i = 0; i < parseInt(days); i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const { data: programs, error } = await supabase
      .from('programs')
      .select(`
        *,
        videos (id, title, category, duration, is_premium)
      `)
      .in('program_date', dates)
      .order('program_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;

    // Group by date
    const grouped = {};
    programs.forEach(p => {
      if (!grouped[p.program_date]) grouped[p.program_date] = [];
      grouped[p.program_date].push(p);
    });

    res.json({ success: true, data: { schedule: grouped, dates } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /program/archive - all videos (premium locked)
router.get('/archive', async (req, res) => {
  try {
    const { category } = req.query;

    let query = supabase
      .from('videos')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data: videos, error } = await query;
    if (error) throw error;

    // Check if request has valid premium token
    let isPremium = false;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        isPremium = decoded.is_premium;
      } catch {}
    }

    // Mask premium video details for free users
    const result = videos.map(v => ({
      id: v.id,
      title: v.title,
      category: v.category,
      duration: v.duration,
      thumbnail_url: v.thumbnail_url,
      is_premium: v.is_premium,
      description: isPremium || !v.is_premium ? v.description : null,
      youtube_id: isPremium || !v.is_premium ? v.youtube_id : null,
      created_at: v.created_at
    }));

    res.json({ success: true, data: { videos: result, is_premium: isPremium } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /program/video/:id - single video (premium check)
router.get('/video/:id', async (req, res) => {
  try {
    const { data: video, error } = await supabase
      .from('videos')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !video) return res.status(404).json({ success: false, message: 'Video not found' });

    // Check premium
    let isPremium = false;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        isPremium = decoded.is_premium;
      } catch {}
    }

    if (video.is_premium && !isPremium) {
      return res.status(403).json({ success: false, message: 'Premium required', is_premium: false });
    }

    res.json({ success: true, data: { video } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
