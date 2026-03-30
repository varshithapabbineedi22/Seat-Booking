// ==================== STATE ====================
const API_BASE = '';
let currentDate = '';
let selectedSlots = []; // Array of slot_time strings

// ==================== DOM ELEMENTS ====================
const datePicker = document.getElementById('date-picker');
const dateDisplay = document.getElementById('selected-date-display');
const slotsGrid = document.getElementById('slots-grid');
const emptyState = document.getElementById('empty-state');
const statsBar = document.getElementById('stats-bar');
const statAvailable = document.getElementById('stat-available');
const statBooked = document.getElementById('stat-booked');
const statTotal = document.getElementById('stat-total');
const modalOverlay = document.getElementById('modal-overlay');
const modalIcon = document.getElementById('modal-icon');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalDetail = document.getElementById('modal-detail');
const loadingOverlay = document.getElementById('loading-overlay');

const selectionBar = document.getElementById('selection-bar');
const selectionCount = document.getElementById('selection-count');
const bookSelectedBtn = document.getElementById('book-selected-btn');

// ==================== INITIALIZATION ====================
function init() {
  // Set date picker to today
  const today = new Date();
  const todayStr = formatDateForInput(today);
  datePicker.value = todayStr;
  datePicker.min = todayStr;

  // Listen for date changes
  datePicker.addEventListener('change', onDateChange);

  // Batch book listener
  bookSelectedBtn.addEventListener('click', bookSelectedSlots);

  // Load today's slots
  onDateChange();
}

// ==================== EVENT HANDLERS ====================
function onDateChange() {
  const selectedDate = datePicker.value;
  if (!selectedDate) return;

  currentDate = selectedDate;
  
  // Clear selection on date change
  selectedSlots = [];
  updateSelectionBar();

  // Update display
  const dateObj = new Date(selectedDate + 'T00:00:00');
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  dateDisplay.textContent = dateObj.toLocaleDateString('en-US', options);

  fetchSlots(selectedDate);
}

// ==================== API CALLS ====================
async function fetchSlots(date) {
  showLoading(true);

  try {
    const response = await fetch(`${API_BASE}/api/slots?date=${date}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch slots');
    }

    renderSlots(data.slots);
    updateStats(data.slots);
  } catch (err) {
    console.error('Error fetching slots:', err);
    showModal('error', 'Error', 'Could not load time slots. Please try again.', '');
  } finally {
    showLoading(false);
  }
}

async function bookSelectedSlots() {
  if (selectedSlots.length === 0) return;

  showLoading(true);

  try {
    const response = await fetch(`${API_BASE}/api/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot_times: selectedSlots })
    });

    const data = await response.json();

    if (!response.ok) {
      showModal('error', 'Booking Failed', data.error, '');
      return;
    }

    showModal('success', 'Booked!', `${selectedSlots.length} appointment(s) have been confirmed.`, '');

    // Clear selection
    selectedSlots = [];
    updateSelectionBar();

    // Refresh slots
    await fetchSlots(currentDate);
  } catch (err) {
    console.error('Error booking slots:', err);
    showModal('error', 'Error', 'Something went wrong. Please try again.', '');
  } finally {
    showLoading(false);
  }
}

async function cancelSlot(slotTime, displayTime) {
  showLoading(true);

  try {
    const response = await fetch(`${API_BASE}/api/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot_time: slotTime })
    });

    const data = await response.json();

    if (!response.ok) {
      showModal('error', 'Cancel Failed', data.error, displayTime);
      return;
    }

    showModal('success', 'Cancelled', 'Your appointment has been cancelled.', displayTime);

    // Refresh slots
    await fetchSlots(currentDate);
  } catch (err) {
    console.error('Error cancelling slot:', err);
    showModal('error', 'Error', 'Something went wrong. Please try again.', '');
  } finally {
    showLoading(false);
  }
}

// ==================== RENDERING ====================
function renderSlots(slots) {
  // Clear grid
  slotsGrid.innerHTML = '';

  if (!slots || slots.length === 0) {
    slotsGrid.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <p>No slots available for this date</p>
      </div>`;
    statsBar.style.display = 'none';
    return;
  }

  statsBar.style.display = 'flex';

  slots.forEach((slot, index) => {
    const isSelected = selectedSlots.includes(slot.slot_time);
    const card = document.createElement('div');
    card.className = `slot-card ${slot.is_booked ? 'booked' : 'available'} ${isSelected ? 'selected' : ''}`;
    card.style.animationDelay = `${index * 0.06}s`;

    if (slot.is_booked) {
      card.innerHTML = `
        <div class="slot-time">${slot.display_time}</div>
        <div class="slot-status">
          <span class="slot-status-dot"></span>
          Booked
        </div>
        <button class="cancel-btn" id="cancel-${index}">Cancel Booking</button>
      `;

      // Cancel button handler
      const cancelBtn = card.querySelector('.cancel-btn');
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelSlot(slot.slot_time, slot.display_time);
      });
    } else {
      card.innerHTML = `
        <div class="slot-time">${slot.display_time}</div>
        <div class="slot-status">
          <span class="slot-status-dot"></span>
          Available
        </div>
      `;

      card.addEventListener('click', () => {
        toggleSlotSelection(slot.slot_time, card);
      });
    }

    slotsGrid.appendChild(card);
  });
}

function toggleSlotSelection(slotTime, cardElement) {
  const index = selectedSlots.indexOf(slotTime);
  
  if (index === -1) {
    selectedSlots.push(slotTime);
    cardElement.classList.add('selected');
  } else {
    selectedSlots.splice(index, 1);
    cardElement.classList.remove('selected');
  }

  updateSelectionBar();
}

function updateSelectionBar() {
  const count = selectedSlots.length;
  selectionCount.textContent = count;
  
  if (count > 0) {
    selectionBar.classList.add('active');
  } else {
    selectionBar.classList.remove('active');
  }
}

function updateStats(slots) {
  const available = slots.filter(s => !s.is_booked).length;
  const booked = slots.filter(s => s.is_booked).length;
  const total = slots.length;

  animateNumber(statAvailable, available);
  animateNumber(statBooked, booked);
  animateNumber(statTotal, total);
}

function animateNumber(element, target) {
  const current = parseInt(element.textContent) || 0;
  if (current === target) return;

  const duration = 400;
  const start = performance.now();

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const value = Math.round(current + (target - current) * eased);
    element.textContent = value;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// ==================== MODAL ====================
function showModal(type, title, message, detail) {
  modalIcon.className = `modal-icon ${type}`;

  // Swap icon SVG
  if (type === 'success') {
    modalIcon.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>`;
  } else {
    modalIcon.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>`;
  }

  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalDetail.textContent = detail ? `⏰ ${detail}` : '';

  modalOverlay.classList.add('active');
}

function closeModal() {
  modalOverlay.classList.remove('active');
}

// Close modal on overlay click
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ==================== HELPERS ====================
function showLoading(show) {
  if (show) {
    loadingOverlay.classList.add('active');
  } else {
    loadingOverlay.classList.remove('active');
  }
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ==================== START ====================
document.addEventListener('DOMContentLoaded', init);
