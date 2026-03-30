require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your_project_url_here')) {
  console.error('❌ ERROR: Supabase URL or Key is missing in .env file.');
  console.log('Please update your .env file with actual credentials from your Supabase Dashboard.');
  // We'll still start the server so the user can see the error in console, 
  // but most API calls will fail.
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Generate hourly time slots for a given date (9 AM to 5 PM)
 * Only generates if no slots exist for that date yet
 */
async function generateSlotsForDate(date) {
  // Check if slots exist
  const { data: existingSlots, error: fetchError } = await supabase
    .from('slots')
    .select('slot_time')
    .gte('slot_time', `${date}T00:00:00Z`)
    .lt('slot_time', `${date}T23:59:59Z`);

  if (fetchError) {
    console.error('Error checking slots:', fetchError);
    return;
  }

  if (existingSlots && existingSlots.length > 0) return;

  const slots = [];
  for (let hour = 9; hour <= 17; hour++) {
    // Generate as local time (without Z) so it's treated as the intended hour
    const timeStr = `${date}T${String(hour).padStart(2, '0')}:00:00`;
    slots.push({ slot_time: timeStr, is_booked: false });
  }

  const { error: insertError } = await supabase.from('slots').insert(slots);
  if (insertError) {
    console.error('Error generating slots:', insertError);
  }
}

// ==================== API ROUTES ====================

/**
 * GET /api/slots?date=YYYY-MM-DD
 * Returns all slots for the given date. Auto-generates if none exist.
 */
app.get('/api/slots', async (req, res) => {
  const { date } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  try {
    // Generate slots if they don't exist for this date
    await generateSlotsForDate(date);

    // Filter slots for the specific local date
    const { data: slots, error } = await supabase
      .from('slots')
      .select('slot_time, is_booked')
      .gte('slot_time', `${date}T00:00:00`)
      .lt('slot_time', `${date}T23:59:59`)
      .order('slot_time', { ascending: true });

    if (error) throw error;

    const formattedSlots = slots.map(slot => ({
      slot_time: slot.slot_time,
      is_booked: Boolean(slot.is_booked),
      display_time: formatDisplayTime(slot.slot_time)
    }));

    res.json({ date, slots: formattedSlots });
  } catch (err) {
    console.error('Error fetching slots:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * POST /api/book
 * Books one or more time slots. Prevents double booking atomically.
 * Body: { slot_times: ["YYYY-MM-DDTHH:MM:SS", ...] }
 */
app.post('/api/book', async (req, res) => {
  const { slot_times } = req.body;

  if (!slot_times || !Array.isArray(slot_times) || slot_times.length === 0) {
    return res.status(400).json({ error: 'slot_times array is required.' });
  }

  try {
    const { data, error } = await supabase
      .from('slots')
      .update({ is_booked: true })
      .in('slot_time', slot_times)
      .eq('is_booked', false)
      .select();

    if (error) throw error;

    if (data.length === slot_times.length) {
      return res.json({
        success: true,
        message: `${slot_times.length} slot(s) booked successfully!`,
        booked_slots: slot_times
      });
    } else {
      return res.status(409).json({ 
        error: 'One or more slots were already booked or could not be found.',
        succeeded_count: data.length,
        requested_count: slot_times.length
      });
    }
  } catch (err) {
    console.error('Error booking slots:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * POST /api/cancel
 * Cancels a booked slot.
 * Body: { slot_time: "YYYY-MM-DDTHH:MM:SS" }
 */
app.post('/api/cancel', async (req, res) => {
  const { slot_time } = req.body;

  if (!slot_time) {
    return res.status(400).json({ error: 'slot_time is required.' });
  }

  try {
    const { data, error } = await supabase
      .from('slots')
      .update({ is_booked: false })
      .eq('slot_time', slot_time)
      .eq('is_booked', true)
      .select();

    if (error) throw error;

    if (data.length === 0) {
      return res.status(404).json({ error: 'Slot not found or is not currently booked.' });
    }

    res.json({
      success: true,
      message: 'Appointment cancelled successfully.',
      slot: {
        slot_time: slot_time,
        is_booked: false,
        display_time: formatDisplayTime(slot_time)
      }
    });
  } catch (err) {
    console.error('Error cancelling slot:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// ==================== HELPERS ====================

/**
 * Formats a slot_time string to a human-readable display time
 */
function formatDisplayTime(slotTime) {
  // Use regex to extract hour from "YYYY-MM-DDTHH:MM:SS"
  const match = slotTime.match(/T(\d{2}):/);
  if (!match) return slotTime;
  
  const hours = parseInt(match[1]);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:00 ${ampm}`;
}

// ==================== START ====================
app.listen(PORT, () => {
  console.log(`🚀 Appointment Booking Server (Supabase) running at http://localhost:${PORT}`);
  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your_project_url_here')) {
    console.log('⚠️  WARNING: Supabase credentials not set. API calls will fail.');
  }
});

module.exports = app;
