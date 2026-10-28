import React, { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, Clock3, MapPin, ShieldCheck, CheckCircle2, Upload,
  CreditCard, ClipboardList, RefreshCw, LogOut, XCircle, Menu, Info
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from './supabase'

const COURT_NAME = import.meta.env.VITE_COURT_NAME || 'Barangay Covered Court'
const START_HOUR = Number((import.meta.env.VITE_BOOKING_START || '06:00').split(':')[0])
const END_HOUR = Number((import.meta.env.VITE_BOOKING_END || '22:00').split(':')[0])
const GCASH_QR = import.meta.env.VITE_GCASH_QR || '/payment/gcash-qr.png'
const MARIBANK_QR = import.meta.env.VITE_MARIBANK_QR || '/payment/maribank-qr.png'
const LOCAL_KEY = 'barangay-court-bookings-v1'

const purposes = ['Event', 'Pickleball', 'Badminton', 'Other']
const timeLabel = (hour) => {
  const suffix = hour < 12 ? 'AM' : 'PM'
  const h = hour % 12 || 12
  return `${h}:00 ${suffix}`
}
const isoToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const formatDate = (value) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
  weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
})
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd
const statusText = (s) => ({ pending: 'Pending review', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' }[s] || s)

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') } catch { return [] }
}

export default function App() {
  const [page, setPage] = useState('book')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState(null)
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [month, setMonth] = useState(() => new Date())
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', purpose: 'Pickleball', otherPurpose: '',
    date: isoToday(), start: String(Math.max(START_HOUR, 6)).padStart(2, '0') + ':00',
    end: String(Math.min(Math.max(START_HOUR, 6) + 1, END_HOUR)).padStart(2, '0') + ':00',
    paymentMethod: 'GCash', paymentProof: null
  })

  useEffect(() => {
    loadBookings()
    if (!isSupabaseConfigured) return
    supabase.auth.getSession().then(async ({data}) => {
      if (data.session) await verifyAdmin()
    })
  }, [])

  async function verifyAdmin() {
    const { data, error } = await supabase.rpc('is_court_admin')
    if (error || data !== true) { setAdminUnlocked(false); return false }
    setAdminUnlocked(true)
    return true
  }


  async function loadBookings() {
    setLoading(true)
    try {
      if (isSupabaseConfigured) {
        // Public callers receive only schedule fields, never names or receipts.
        const { data, error } = await supabase.rpc('public_court_availability')
        if (error) throw error
        setBookings((data || []).map(row => ({
          id: row.id, date: row.booking_date,
          start: String(row.start_time).slice(0, 5),
          end: String(row.end_time).slice(0, 5), status: 'approved'
        })))
      } else setBookings(readLocal())
    } catch (err) {
      setBookings([])
      setNotice({ type: 'error', text: `Could not load bookings: ${err.message || 'Network connection failed'}` })
    } finally { setLoading(false) }
  }

  async function loadAdminBookings() {
    const { data, error } = await supabase.from('bookings').select('*').order('booking_date').order('start_time')
    if (error) { setNotice({type: 'error', text: error.message}); return }
    setBookings((data || []).map(fromDb))
  }

  function fromDb(row) {
    return {
      id: row.id, firstName: row.first_name, lastName: row.last_name, email: row.email,
      purpose: row.purpose, otherPurpose: row.other_purpose || '', date: row.booking_date,
      start: String(row.start_time).slice(0, 5), end: String(row.end_time).slice(0, 5),
      paymentMethod: row.payment_method, paymentProofUrl: row.payment_proof_url || '',
      status: row.status, createdAt: row.created_at
    }
  }

  const activeBookings = bookings.filter(b => ['pending', 'approved'].includes(b.status))
  const dateBookings = activeBookings.filter(b => b.date === form.date)
  const slotTaken = (start, end) => dateBookings.some(b => overlaps(start, end, b.start, b.end))
  const dateFullyBooked = (date) => {
    const list = activeBookings.filter(b => b.date === date)
    for (let h = START_HOUR; h < END_HOUR; h++) {
      const start = `${String(h).padStart(2, '0')}:00`
      const end = `${String(h + 1).padStart(2, '0')}:00`
      if (!list.some(b => overlaps(start, end, b.start, b.end))) return false
    }
    return true
  }

  const monthDays = useMemo(() => {
    const y = month.getFullYear(), m = month.getMonth()
    const first = new Date(y, m, 1)
    const count = new Date(y, m + 1, 0).getDate()
    const offset = (first.getDay() + 6) % 7
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => {
      const d = new Date(y, m, i + 1)
      return `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    })]
  }, [month])

  const availableStarts = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const startHour = Number(form.start.split(':')[0])
  const endHour = Number(form.end.split(':')[0])
  const validDuration = form.start && form.end && endHour > startHour
  const durationHours = validDuration ? endHour - startHour : 0
  const selectedOverlap = validDuration && slotTaken(form.start, form.end)
  const isPastDate = form.date < isoToday()

  function setField(key, value) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'start') {
        const h = Number(value.split(':')[0])
        const currentEnd = Number(prev.end.split(':')[0])
        if (currentEnd <= h) next.end = `${String(Math.min(h + 1, END_HOUR)).padStart(2, '0')}:00`
      }
      return next
    })
  }

  function saveLocal(booking) {
    const all = [...readLocal(), booking]
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all))
    setBookings(all)
  }

  async function submitBooking(e) {
    e.preventDefault()
    setNotice(null)
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setNotice({ type: 'error', text: 'Please complete your name and email address.' }); return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setNotice({ type: 'error', text: 'Please enter a valid email address.' }); return
    }
    if (form.date < isoToday() || !validDuration || startHour < START_HOUR || endHour > END_HOUR) {
      setNotice({ type: 'error', text: 'Please choose a valid future date and time within operating hours.' }); return
    }
    if (selectedOverlap) {
      setNotice({ type: 'error', text: 'That time overlaps an existing booking. Please choose another time.' }); return
    }
    if (!form.paymentProof) {
      setNotice({ type: 'error', text: 'Please upload your payment screenshot before submitting.' }); return
    }
    try {
      let proofUrl = ''
      if (isSupabaseConfigured) {
        const ext = form.paymentProof.name.split('.').pop()?.toLowerCase() || 'jpg'
        const filePath = `${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(filePath, form.paymentProof, {
          contentType: form.paymentProof.type, upsert: false
        })
        if (uploadError) throw uploadError
        proofUrl = filePath // Private bucket: store path, not a public URL
        const { data, error } = await supabase.rpc('create_court_booking', {
          p_first_name: form.firstName.trim(), p_last_name: form.lastName.trim(),
          p_email: form.email.trim(), p_purpose: form.purpose,
          p_other_purpose: form.purpose === 'Other' ? form.otherPurpose.trim() : '',
          p_booking_date: form.date, p_start_time: form.start, p_end_time: form.end,
          p_payment_method: form.paymentMethod, p_payment_proof_url: proofUrl
        })
        if (error) throw error
        if (data?.error) throw new Error(data.error)
        setNotice({ type: 'success', text: `Booking request submitted. Reference: ${data?.id || 'submitted'}. Your time is pending barangay review.` })
        await loadBookings()
      } else {
        const booking = {
          id: crypto.randomUUID(), ...form, paymentProofUrl: 'local-demo-upload',
          paymentProof: undefined, status: 'pending', createdAt: new Date().toISOString()
        }
        saveLocal(booking)
        setNotice({ type: 'success', text: 'Demo booking saved in this browser only. Configure Supabase to share bookings across devices.' })
      }
      setForm(prev => ({ ...prev, firstName: '', lastName: '', email: '', otherPurpose: '', paymentProof: null }))
      const fileInput = document.getElementById('payment-proof')
      if (fileInput) fileInput.value = ''
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Unable to submit booking. Please try again.' })
    }
  }

  async function updateStatus(id, status) {
    setNotice(null)
    if (isSupabaseConfigured) {
      if (!adminUnlocked || !(await verifyAdmin())) { setNotice({type:'error',text:'Admin access required.'}); return }
      const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
      if (error) { setNotice({ type: 'error', text: error.message }); return }
      await loadAdminBookings()
    } else {
      setNotice({type:'error', text:'Admin changes require Supabase.'}); return
    }
    setNotice({ type: 'success', text: `Booking marked ${statusText(status).toLowerCase()}.` })
  }

  async function unlockAdmin(e) {
    e.preventDefault()
    setNotice(null)
    if (!isSupabaseConfigured) { setNotice({type:'error',text:'Configure Supabase first.'}); return }
    const { error } = await supabase.auth.signInWithPassword({email:adminEmail.trim(), password:adminPassword})
    setAdminPassword('')
    if (error || !(await verifyAdmin())) {
      await supabase.auth.signOut()
      setNotice({type:'error',text:'Invalid login or account is not authorized as an administrator.'})
      return
    }
    setPage('admin')
    await loadAdminBookings()
  }

  async function openProof(path) {
    if (!path || !adminUnlocked) return
    const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(path, 60)
    if (error) setNotice({type:'error',text:error.message})
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function exitAdmin() {
    await supabase.auth.signOut()
    setAdminUnlocked(false)
    setPage('admin-login')
    await loadBookings()
  }

  function goPage(p) { setPage(p); setMobileMenu(false); setNotice(null) }

  return <div className="app-shell">
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="#" onClick={e => { e.preventDefault(); goPage('book') }}>
          <span className="brand-mark"><CalendarDays size={23}/></span>
          <span><strong>{COURT_NAME}</strong><small>RESERVATION PORTAL</small></span>
        </a>
        <button className="menu-toggle" onClick={() => setMobileMenu(v => !v)} aria-label="Toggle menu"><Menu/></button>
        <nav className={mobileMenu ? 'nav open' : 'nav'}>
          <button className={page === 'book' ? 'nav-link active' : 'nav-link'} onClick={() => goPage('book')}>Book a Court</button>
          <button className={page === 'availability' ? 'nav-link active' : 'nav-link'} onClick={() => goPage('availability')}>Availability</button>
          <button className="nav-link admin-nav" onClick={async () => { if (adminUnlocked) { await loadAdminBookings(); goPage('admin') } else goPage('admin-login') }}>Admin</button>
        </nav>
      </div>
    </header>

    <main>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow"><span className="live-dot"></span> COMMUNITY SPORTS & EVENTS</div>
          <h1>Your court.<br/><em>Your time.</em></h1>
          <p>Reserve your schedule in a few simple steps. Check availability before you book and upload your payment proof securely.</p>
          <div className="hero-points"><span><ShieldCheck size={17}/> Fair scheduling</span><span><Clock3 size={17}/> Flexible duration</span></div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="court-lines"><div className="court-center"></div><div className="court-key"></div><div className="court-arc"></div></div>
          <div className="hero-ball">●</div>
          <div className="hero-card"><CalendarDays size={19}/><span><b>Easy booking</b><small>Pick a date and time</small></span><CheckCircle2 size={20}/></div>
        </div>
      </section>

      <div className="page-wrap">
        <div className="page-heading">
          <div><div className="eyebrow dark">COURT RESERVATION</div><h2>{page === 'availability' ? 'Check availability' : page === 'admin' ? 'Booking management' : page === 'admin-login' ? 'Administrator access' : 'Make a reservation'}</h2><p>{page === 'availability' ? 'Choose a date to see occupied time slots.' : page === 'admin' ? 'Review payment proof and manage reservation requests.' : 'Complete the details below to request your court schedule.'}</p></div>
          {page !== 'admin' && <button className="outline-button" onClick={() => goPage('availability')}><CalendarDays size={17}/> View calendar</button>}
        </div>

        {notice && <div className={`notice ${notice.type}`} role="status"><span>{notice.type === 'success' ? <CheckCircle2/> : <Info/>}</span><p>{notice.text}</p><button onClick={() => setNotice(null)} aria-label="Dismiss"><XCircle size={17}/></button></div>}
        {!isSupabaseConfigured && <div className="demo-banner"><Info size={18}/><div><strong>Preview mode</strong><span>Bookings are stored only in this browser. Connect Supabase using the setup guide to enable shared bookings, payment uploads, and online availability.</span></div></div>}

        {page === 'book' && <div className="booking-layout">
          <form className="booking-form panel" onSubmit={submitBooking}>
            <div className="section-title"><span className="step">01</span><div><h3>Your information</h3><p>Who is making this reservation?</p></div></div>
            <div className="form-grid">
              <label>First name <b>*</b><input value={form.firstName} onChange={e => setField('firstName', e.target.value)} placeholder="Enter first name" required maxLength={80}/></label>
              <label>Last name <b>*</b><input value={form.lastName} onChange={e => setField('lastName', e.target.value)} placeholder="Enter last name" required maxLength={80}/></label>
              <label className="full">Email address <b>*</b><input type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="you@example.com" required maxLength={254}/></label>
              <label className="full">Purpose of booking <b>*</b><select value={form.purpose} onChange={e => setField('purpose', e.target.value)}>{purposes.map(p => <option key={p}>{p}</option>)}</select></label>
              {form.purpose === 'Other' && <label className="full">Please specify <b>*</b><input value={form.otherPurpose} onChange={e => setField('otherPurpose', e.target.value)} required placeholder="Describe your event or activity"/></label>}
            </div>

            <div className="section-title separated"><span className="step">02</span><div><h3>Select date & time</h3><p>Only available dates and times can be reserved.</p></div></div>
            <Calendar month={month} setMonth={setMonth} days={monthDays} selected={form.date} onSelect={date => setField('date', date)} disabledDate={date => date < isoToday() || dateFullyBooked(date)} isFullyBooked={dateFullyBooked}/>
            <div className="time-grid">
              <label>Start time<select value={form.start} onChange={e => setField('start', e.target.value)}>{availableStarts.map(h => <option key={h} value={`${String(h).padStart(2,'0')}:00`}>{timeLabel(h)}</option>)}</select></label>
              <label>End time<select value={form.end} onChange={e => setField('end', e.target.value)}>{Array.from({ length: END_HOUR - startHour }, (_, i) => startHour + i + 1).map(h => <option key={h} value={`${String(h).padStart(2,'0')}:00`}>{timeLabel(h)}</option>)}</select></label>
            </div>
            <div className="duration-note"><Clock3 size={18}/><span>{validDuration ? `${durationHours} hour${durationHours === 1 ? '' : 's'} selected · ${timeLabel(startHour)} – ${timeLabel(endHour)}` : 'Choose a valid end time.'}</span></div>
            {selectedOverlap && <p className="field-error">This period overlaps an existing booking. Please choose another time.</p>}
            {isPastDate && <p className="field-error">Please choose today or a future date.</p>}
            <div className="slot-key"><span><i className="key-available"></i> Available</span><span><i className="key-booked"></i> Booked</span><span><i className="key-selected"></i> Selected date</span></div>

            <div className="section-title separated"><span className="step">03</span><div><h3>Payment details</h3><p>Pay using one of the available QR payment methods.</p></div></div>
            <div className="payment-options">
              {['GCash', 'MariBank'].map(method => <button type="button" key={method} className={`payment-option ${form.paymentMethod === method ? 'selected' : ''}`} onClick={() => setField('paymentMethod', method)}><span className={`payment-logo ${method.toLowerCase()}`}>{method === 'GCash' ? 'G' : 'M'}</span><span><b>{method}</b><small>QR payment</small></span><span className="radio-dot"></span></button>)}
            </div>
            <div className="qr-area">
              <div className="qr-image-wrap">
                <img src={form.paymentMethod === 'GCash' ? GCASH_QR : MARIBANK_QR} alt={`${form.paymentMethod} payment QR code`} onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling.style.display = 'flex' }}/>
                <div className="qr-placeholder"><CreditCard size={30}/><b>{form.paymentMethod} QR</b><small>Add your QR image in the public/payment folder.</small></div>
              </div>
              <div className="qr-copy"><span className="mini-label">PAY VIA {form.paymentMethod.toUpperCase()}</span><h4>Scan to pay</h4><p>Open your payment app, scan the official QR code, and complete your payment. Upload your receipt below.</p><span className="security-line"><ShieldCheck size={15}/> Confirm payment details before sending.</span></div>
            </div>
            <label className="upload-label" htmlFor="payment-proof">Payment screenshot <b>*</b><span className="upload-box"><Upload size={22}/><strong>{form.paymentProof?.name || 'Upload payment receipt'}</strong><small>PNG, JPG, or WEBP · Max 5 MB</small><input id="payment-proof" type="file" accept="image/png,image/jpeg,image/webp" required onChange={e => { const f = e.target.files?.[0]; if (f && f.size > 5 * 1024 * 1024) { setNotice({type:'error',text:'File is too large. Please upload an image up to 5 MB.'}); e.target.value=''; setField('paymentProof', null); return } setField('paymentProof', f || null) }}/></span></label>
            <p className="privacy-note"><ShieldCheck size={15}/> Your booking request and payment proof will be reviewed by the barangay administrator.</p>
            <button className="primary-button submit-button" type="submit" disabled={loading || selectedOverlap || isPastDate}><span>Submit booking request</span><span>→</span></button>
            <p className="terms-note">Submitting a request does not mean your booking is approved. Wait for confirmation from the barangay.</p>
          </form>

          <aside className="side-column">
            <div className="panel summary-panel"><div className="summary-top"><span className="summary-icon"><ClipboardList size={21}/></span><span className="mini-label">YOUR RESERVATION</span></div><h3>Booking summary</h3><div className="summary-row"><CalendarDays size={18}/><div><small>Date</small><strong>{form.date ? formatDate(form.date) : 'Select a date'}</strong></div></div><div className="summary-row"><Clock3 size={18}/><div><small>Time</small><strong>{validDuration ? `${timeLabel(startHour)} – ${timeLabel(endHour)}` : 'Select time'}</strong><small>{durationHours} hour{durationHours === 1 ? '' : 's'}</small></div></div><div className="summary-row"><MapPin size={18}/><div><small>Location</small><strong>{COURT_NAME}</strong></div></div><div className="summary-row"><ClipboardList size={18}/><div><small>Purpose</small><strong>{form.purpose === 'Other' ? (form.otherPurpose || 'Other') : form.purpose}</strong></div></div><div className="summary-footer"><ShieldCheck size={17}/><span>Booking time is checked for conflicts before submission.</span></div></div>
            <div className="help-card"><div className="help-icon"><Info size={19}/></div><h3>Before you book</h3><ul><li>Choose a date that is not fully booked.</li><li>Longer bookings reserve every hour in your selected range.</li><li>Keep your payment receipt for verification.</li><li>Your booking is pending until approved.</li></ul></div>
            <button className="text-button" onClick={() => goPage('availability')}><CalendarDays size={17}/> See all booking availability <span>→</span></button>
          </aside>
        </div>}

        {page === 'availability' && <div className="panel availability-panel">
          <div className="availability-head"><div><h3>Booking calendar</h3><p>Tap a date to see its current schedule.</p></div><div className="slot-key"><span><i className="key-available"></i> Available</span><span><i className="key-booked"></i> Booked</span></div></div>
          <Calendar month={month} setMonth={setMonth} days={monthDays} selected={form.date} onSelect={date => setField('date', date)} disabledDate={date => date < isoToday() || dateFullyBooked(date)} isFullyBooked={dateFullyBooked}/>
          <div className="schedule-list"><h3>{formatDate(form.date)} · Time slots</h3><p>Occupied slots are not available for new reservations.</p><div className="slot-list">{availableStarts.map(h => {
            const start = `${String(h).padStart(2,'0')}:00`, end = `${String(h+1).padStart(2,'0')}:00`
            const booking = dateBookings.find(b => overlaps(start, end, b.start, b.end))
            return <div key={start} className={`slot-item ${booking ? 'occupied' : 'free'}`}><span className="slot-time">{timeLabel(h)} – {timeLabel(h+1)}</span><span className="slot-status">{booking ? 'Booked' : 'Available'}</span></div>
          })}</div><button className="primary-button" onClick={() => goPage('book')}>Book an available time <span>→</span></button></div>
        </div>}

        {page === 'admin-login' && <div className="panel login-panel"><div className="login-icon"><ShieldCheck size={27}/></div><h3>Administrator sign in</h3><p>Sign in using your approved Supabase administrator account.</p><form onSubmit={unlockAdmin}><label>Email<input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@example.com" required/></label><label>Password<input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Password" required/></label><button className="primary-button" type="submit">Open dashboard <span>→</span></button></form><p className="terms-note">Administrator accounts must be created in Supabase Auth and authorized in the court_admins table.</p></div>}

        {page === 'admin' && adminUnlocked && <div className="admin-area">
          <div className="admin-toolbar"><div className="admin-stats"><div className="stat-card"><span>Total requests</span><strong>{bookings.length}</strong></div><div className="stat-card"><span>Pending</span><strong>{bookings.filter(b => b.status === 'pending').length}</strong></div><div className="stat-card"><span>Approved</span><strong>{bookings.filter(b => b.status === 'approved').length}</strong></div></div><div className="admin-actions"><button className="outline-button" onClick={loadAdminBookings}><RefreshCw size={16}/> Refresh</button><button className="outline-button" onClick={exitAdmin}><LogOut size={16}/> Sign out</button></div></div>
          <div className="panel table-panel"><div className="table-heading"><div><h3>Reservation requests</h3><p>Review details and verify the uploaded payment proof.</p></div></div>
            {bookings.length === 0 ? <div className="empty-state"><ClipboardList size={30}/><strong>No booking requests yet</strong><p>Submitted reservations will appear here.</p></div> : <div className="booking-cards">{[...bookings].sort((a,b) => (a.date+a.start).localeCompare(b.date+b.start)).map(b => <article className="admin-booking" key={b.id}><div className="admin-booking-top"><span className={`status-pill ${b.status}`}>{statusText(b.status)}</span><small>{b.id.slice(0,8)}</small></div><h4>{b.firstName} {b.lastName}</h4><p className="admin-email">{b.email}</p><div className="admin-detail-grid"><span><CalendarDays size={15}/>{formatDate(b.date)}</span><span><Clock3 size={15}/>{b.start}–{b.end}</span><span><ClipboardList size={15}/>{b.purpose === 'Other' ? b.otherPurpose : b.purpose}</span><span><CreditCard size={15}/>{b.paymentMethod}</span></div><div className="proof-link">{b.paymentProofUrl && b.paymentProofUrl !== 'local-demo-upload' ? <button type="button" className="outline-button" onClick={() => openProof(b.paymentProofUrl)}>View payment screenshot ↗</button> : <span>Payment screenshot uploaded in demo mode</span>}</div><div className="admin-booking-actions">{b.status !== 'approved' && <button className="approve-button" onClick={() => updateStatus(b.id,'approved')}>Approve</button>}{b.status !== 'rejected' && <button className="reject-button" onClick={() => updateStatus(b.id,'rejected')}>Reject</button>}{b.status !== 'cancelled' && <button className="cancel-button" onClick={() => updateStatus(b.id,'cancelled')}>Cancel</button>}</div></article>)}</div>}
          </div>
        </div>}
        {page === 'admin' && !adminUnlocked && <div className="panel login-panel"><h3>Admin session ended</h3><p>Please sign in to continue.</p><button className="primary-button" onClick={() => goPage('admin-login')}>Sign in <span>→</span></button></div>}
      </div>
    </main>
    <footer className="footer"><div className="footer-inner"><div className="brand footer-brand"><span className="brand-mark"><CalendarDays size={21}/></span><span><strong>{COURT_NAME}</strong><small>COMMUNITY BOOKINGS</small></span></div><p>Made for a more organized and accessible community court.</p><span className="copyright">© {new Date().getFullYear()} {COURT_NAME}</span></div></footer>
  </div>
}

function Calendar({ month, setMonth, days, selected, onSelect, disabledDate, isFullyBooked }) {
  const title = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const changeMonth = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  return <div className="calendar">
    <div className="calendar-top"><button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button><strong>{title}</strong><button type="button" onClick={() => changeMonth(1)} aria-label="Next month">›</button></div>
    <div className="calendar-grid weekday">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <span key={d}>{d}</span>)}</div>
    <div className="calendar-grid dates">{days.map((date, i) => {
      if (!date) return <span key={`empty-${i}`} className="empty-day"/>
      const disabled = disabledDate(date)
      const full = isFullyBooked(date)
      const past = date < isoToday()
      return <button type="button" key={date} className={`date-cell ${date === selected ? 'selected' : ''} ${full && !past ? 'full' : ''}`} disabled={disabled} onClick={() => onSelect(date)} title={full ? 'Fully booked' : past ? 'Past date' : 'Select date'}>{Number(date.slice(-2))}{!past && <i className={full ? 'day-dot full-dot' : 'day-dot'}/>}</button>
    })}</div>
    <div className="calendar-legend"><span><i className="key-available"/> Has availability</span><span><i className="key-booked"/> Fully booked</span></div>
  </div>
}
