const express = require('express');
const supabase = require('../lib/supabase');

const router = express.Router();

// Simple admin key check
const adminAuth = (req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
};

// GET /admin/videos — list all videos
router.get('/videos', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data: { videos: data } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /admin/videos — add new video
router.post('/videos', adminAuth, async (req, res) => {
  try {
    const { title, youtube_id, duration, duration_seconds, category, channel, is_premium, description } = req.body;

    if (!title || !youtube_id || !duration_seconds) {
      return res.status(400).json({ success: false, message: 'title, youtube_id, duration_seconds required' });
    }

    // Get next sort_order
    const { data: last } = await supabase
      .from('videos')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const sort_order = (last?.sort_order || 0) + 1;

    const { data, error } = await supabase
      .from('videos')
      .insert({
        title,
        youtube_id,
        duration: duration || `${Math.floor(duration_seconds/60)}:${String(duration_seconds%60).padStart(2,'0')}`,
        duration_seconds: parseInt(duration_seconds),
        category: category || 'film',
        channel: channel || 'main',
        is_premium: is_premium || false,
        is_active: true,
        description: description || null,
        sort_order
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data: { video: data } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /admin/videos/:id — update video
router.patch('/videos/:id', adminAuth, async (req, res) => {
  try {
    const updates = req.body;
    // Recalculate duration string if duration_seconds changed
    if (updates.duration_seconds && !updates.duration) {
      const s = parseInt(updates.duration_seconds);
      updates.duration = `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('videos')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data: { video: data } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /admin/videos/:id — delete video
router.delete('/videos/:id', adminAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('videos').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /admin/videos/:id/toggle — active/inactive
router.patch('/videos/:id/toggle', adminAuth, async (req, res) => {
  try {
    const { data: video } = await supabase.from('videos').select('is_active').eq('id', req.params.id).single();
    const { data, error } = await supabase
      .from('videos')
      .update({ is_active: !video.is_active, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data: { video: data } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /admin/videos/reorder — update sort orders
router.patch('/reorder', adminAuth, async (req, res) => {
  try {
    const { order } = req.body; // array of {id, sort_order}
    await Promise.all(order.map(item =>
      supabase.from('videos').update({ sort_order: item.sort_order }).eq('id', item.id)
    ));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /admin/live-preview — preview today's schedule
router.get('/live-preview', adminAuth, async (req, res) => {
  try {
    const { data: videos, error } = await supabase
      .from('videos')
      .select('*')
      .eq('is_active', true)
      .eq('channel', 'main')
      .gt('duration_seconds', 0)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    const eligible = videos.filter(v => v.duration_seconds > 0);
    const totalSeconds = eligible.reduce((sum, v) => sum + v.duration_seconds, 0);
    const totalHours = (totalSeconds / 3600).toFixed(1);

    // Build 24h preview
    const schedule = [];
    let cursor = 0;
    let idx = 0;
    while (cursor < 86400) {
      const video = eligible[idx % eligible.length];
      schedule.push({
        time: `${String(Math.floor(cursor/3600)).padStart(2,'0')}:${String(Math.floor((cursor%3600)/60)).padStart(2,'0')}`,
        title: video.title,
        duration: video.duration
      });
      cursor += video.duration_seconds;
      idx++;
      if (cursor > 86400) break;
    }

    res.json({
      success: true,
      data: {
        video_count: eligible.length,
        total_hours: totalHours,
        loops_per_day: (86400 / totalSeconds).toFixed(1),
        schedule
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
