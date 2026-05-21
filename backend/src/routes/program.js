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

// GET /program/live
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

    res.json({ success: true, data: { ...live, server_time: new Date().toISOString() } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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

module.exports = router;
