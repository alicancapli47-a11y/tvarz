const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const supabase = require('../lib/supabase');
const jwt = require('jsonwebtoken');

const router = express.Router();

// ── 24h live schedule calculator ──
function calcLive(videos) {
  if (!videos || videos.length === 0) return null;
  const eligible = videos.filter(v => v.duration_seconds > 0);
  if (eligible.length === 0) return null;

  const totalSeconds = eligible.reduce((sum, v) => sum + v.duration_seconds, 0);
  const now = new Date();
  const secondsSinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const position = secondsSinceMidnight % totalSeconds;

  let elapsed = 0;
  for (let i = 0; i < eligible.length; i++) {
    const v = eligible[i];
    if (position < elapsed + v.duration_seconds) {
      return {
        video: v,
        start_second: Math.floor(position - elapsed),
        remaining_seconds: Math.floor(v.duration_seconds - (position - elapsed)),
        position_in_day: Math.floor(position),
        total_day_seconds: totalSeconds,
        next_video: eligible[(i + 1) % eligible.length]
      };
    }
    elapsed += v.duration_seconds;
  }
  return null;
}

function buildDaySchedule(videos) {
  const eligible = videos.filter(v => v.duration_seconds > 0);
  if (eligible.length === 0) return [];
  const schedule = [];
  let cursor = 0;
  let idx = 0;
  while (cursor < 86400) {
    const video = eligible[idx % eligible.length];
    schedule.push({
      time: `${String(Math.floor(cursor/3600)).padStart(2,'0')}:${String(Math.floor((cursor%3600)/60)).padStart(2,'0')}`,
      start_second: cursor,
      title: video.title,
      category: video.category,
      duration: video.duration,
      duration_seconds: video.duration_seconds,
      is_premium: video.is_premium
    });
    cursor += video.duration_seconds;
    idx++;
    if (cursor > 86400) break;
  }
  return schedule;
}

// In-memory token store (resets on redeploy — fine for live stream)
const streamTokens = new Map();

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// GET /program/live — returns stream info WITHOUT youtube_id
router.get('/live', async (req, res) => {
  try {
    const { data: videos, error } = await supabase
      .from('videos')
      .select('*')
      .eq('is_active', true)
      .eq('channel', 'main')
      .gt('duration_seconds', 0)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    const live = calcLive(videos);
    if (!live) return res.status(404).json({ success: false, message: 'No active videos' });

    // Generate short-lived token for this stream session
    const token = generateToken();
    const expiresAt = Date.now() + (live.remaining_seconds + 10) * 1000;
    streamTokens.set(token, {
      youtube_id: live.video.youtube_id,
      start_second: live.start_second,
      expiresAt
    });

    // Clean expired tokens
    for (const [k, v] of streamTokens.entries()) {
      if (v.expiresAt < Date.now()) streamTokens.delete(k);
    }

    res.json({
      success: true,
      data: {
        stream_token: token,
        title: live.video.title,
        category: live.video.category,
        start_second: live.start_second,
        remaining_seconds: live.remaining_seconds,
        next_video: live.next_video ? { title: live.next_video.title } : null,
        server_time: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /program/stream?token=xxx — returns embed URL, validates token
router.get('/stream', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ success: false, message: 'Token required' });

  const data = streamTokens.get(token);
  if (!data) return res.status(404).json({ success: false, message: 'Invalid or expired token' });
  if (data.expiresAt < Date.now()) {
    streamTokens.delete(token);
    return res.status(410).json({ success: false, message: 'Token expired' });
  }

  res.json({
    success: true,
    data: {
      embed_url: `https://www.youtube.com/embed/${data.youtube_id}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&playsinline=1&start=${data.start_second}`
    }
  });
});

// GET /program/schedule-today
router.get('/schedule-today', async (req, res) => {
  try {
    const { data: videos, error } = await supabase
      .from('videos')
      .select('id,title,category,duration,duration_seconds,is_premium')
      .eq('is_active', true)
      .eq('channel', 'main')
      .gt('duration_seconds', 0)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    res.json({ success: true, data: { schedule: buildDaySchedule(videos) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /program/archive
router.get('/archive', async (req, res) => {
  try {
    const { category } = req.query;
    let query = supabase.from('videos').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (category && category !== 'all') query = query.eq('category', category);

    const { data: videos, error } = await query;
    if (error) throw error;

    let isPremium = false;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try { const d = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET); isPremium = d.is_premium; } catch {}
    }

    const result = videos.map(v => ({
      id: v.id,
      title: v.title,
      category: v.category,
      duration: v.duration,
      duration_seconds: v.duration_seconds,
      thumbnail_url: v.thumbnail_url,
      is_premium: v.is_premium,
      channel: v.channel,
      sort_order: v.sort_order,
      trailer_id: v.trailer_id || null,
      description: isPremium || !v.is_premium ? v.description : null,
      youtube_id: isPremium || !v.is_premium ? v.youtube_id : null,
      created_at: v.created_at
    }));

    res.json({ success: true, data: { videos: result, is_premium: isPremium } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /program/watch — request to watch an on-demand archive title
// Archive on-demand is Premium-only. Premium users get 2 distinct titles per day.
// Free users only watch the live stream (handled separately by /program/live).
router.post('/watch', authMiddleware, async (req, res) => {
  try {
    const { video_id } = req.body;
    if (!video_id) return res.status(400).json({ success: false, message: 'video_id required' });

    const isPremium = req.user.is_premium;
    if (!isPremium) {
      return res.status(403).json({
        success: false,
        code: 'PREMIUM_REQUIRED',
        message: 'Archive access is a Premium feature. Free members watch the live stream only.'
      });
    }

    const { data: video, error: vErr } = await supabase
      .from('videos')
      .select('*')
      .eq('id', video_id)
      .single();

    if (vErr || !video) return res.status(404).json({ success: false, message: 'Video not found' });

    const dailyLimit = 2;
    const today = new Date().toISOString().split('T')[0];
    const { data: todayWatches } = await supabase
      .from('daily_watches')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('watched_date', today);

    const watches = todayWatches || [];
    const alreadyWatchedThis = watches.find(w => w.video_id === video_id);

    if (!alreadyWatchedThis && watches.length >= dailyLimit) {
      const titles = watches.map(w => `"${w.video_title}"`).join(' and ');
      return res.status(403).json({
        success: false,
        code: 'DAILY_LIMIT_REACHED',
        message: `You've used today's 2 watches on ${titles}. Come back tomorrow for more.`
      });
    }

    if (!alreadyWatchedThis) {
      await supabase.from('daily_watches').insert({
        user_id: req.user.id,
        video_id: video_id,
        video_title: video.title,
        watched_date: today
      });
    }

    res.json({
      success: true,
      data: {
        embed_url: `https://www.youtube.com/embed/${video.youtube_id}?autoplay=1&mute=0&controls=1&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&playsinline=1`,
        watches_used: alreadyWatchedThis ? watches.length : watches.length + 1,
        daily_limit: dailyLimit
      }
    });

  } catch (err) {
    console.error('Watch error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
