import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { getPhilippineDateValue } from '../lib/philippineDate'
import ConfirmDialog from './ConfirmDialog'
import PaginatedDropdown from './PaginatedDropdown'
import AuthToast from './AuthToast'

const emptySemester = { name: '', startsOn: '', endsOn: '', opensDate: '', opensTime: '', closesDate: '', closesTime: '' }

function toPhilippineTimestamp(date, time) {
  return new Date(`${date}T${time}:00+08:00`).toISOString()
}

function formatSchedule(value) {
  if (!value) return { date: 'Not scheduled', time: 'Set a date and time' }
  const date = new Date(value)
  return {
    date: date.toLocaleDateString('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' }),
    time: date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' }),
  }
}

function toPhilippineInput(value) {
  if (!value) return { date: '', time: '' }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (type) => parts.find((item) => item.type === type)?.value || ''
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` }
}

function EnrollmentBatchControls({ batches, currentBatchId, selectedBatchId, onSelect, onChanged, onNotice, onError, canDelete = false }) {
  const [confirmation, setConfirmation] = useState('')
  const [working, setWorking] = useState(false)
  const [dialogMode, setDialogMode] = useState('')
  const [semester, setSemester] = useState(emptySemester)
  const [formError, setFormError] = useState('')
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId)
  const isCurrent = selectedBatch?.id === currentBatchId
  const openingSchedule = formatSchedule(selectedBatch?.opens_at)
  const closingSchedule = formatSchedule(selectedBatch?.closes_at)
  const today = getPhilippineDateValue()

  function openCreateDialog() {
    setSemester({ ...emptySemester, name: 'S.Y. 20XX' })
    setFormError('')
    setDialogMode('create')
  }

  function openUpdateDialog() {
    if (!selectedBatch) return
    const opening = toPhilippineInput(selectedBatch.opens_at)
    const closing = toPhilippineInput(selectedBatch.closes_at)
    setSemester({
      name: selectedBatch.name || '',
      startsOn: selectedBatch.starts_on || '',
      endsOn: selectedBatch.ends_on || '',
      opensDate: opening.date,
      opensTime: opening.time,
      closesDate: closing.date,
      closesTime: closing.time,
    })
    setFormError('')
    setDialogMode('update')
  }

  function updateSemester(field, value) {
    setSemester((current) => ({ ...current, [field]: value }))
  }

  async function saveSemester(event) {
    event.preventDefault()
    setFormError('')
    const cleanName = semester.name.trim()
    const opensAt = toPhilippineTimestamp(semester.opensDate, semester.opensTime)
    const closesAt = toPhilippineTimestamp(semester.closesDate, semester.closesTime)

    if (cleanName.length < 2 || cleanName.length > 20) return setFormError('Use a semester name between 2 and 20 characters.')
    if (semester.startsOn > semester.endsOn) return setFormError('The semester end date must be after its start date.')
    if (opensAt >= closesAt) return setFormError('Enrollment must close after it opens.')

    setWorking(true)
    const isUpdate = dialogMode === 'update'
    const rpcName = isUpdate ? 'update_enrollment_semester' : 'create_enrollment_semester'
    const parameters = {
      ...(isUpdate ? { p_batch_id: selectedBatch.id } : {}),
      p_name: cleanName, p_starts_on: semester.startsOn, p_ends_on: semester.endsOn, p_opens_at: opensAt, p_closes_at: closesAt,
    }
    const { data, error } = await supabase.rpc(rpcName, parameters)
    setWorking(false)

    if (error) {
      setFormError(error.message)
      return
    }

    setDialogMode('')
    setSemester(emptySemester)
    onNotice(isUpdate ? `${cleanName} was updated.` : `${cleanName} was created. Review it, then set it as active when ready.`)
    onChanged(isUpdate ? selectedBatch.id : data?.id || '')
  }

  async function setActiveSemester() {
    if (!selectedBatch || isCurrent) return
    setWorking(true)
    onError('')
    const { error } = await supabase.rpc('set_active_enrollment_semester', { p_batch_id: selectedBatch.id })
    setWorking(false)
    setConfirmation('')

    if (error) {
      onError(error.message)
      return
    }

    onNotice(`${selectedBatch.name} is now the active enrollment semester.`)
    onChanged(selectedBatch.id)
  }

  async function deleteSemester() {
    if (!selectedBatch || isCurrent) return
    setWorking(true)
    onError('')
    const { error } = await supabase.rpc('delete_enrollment_batch', { p_batch_id: selectedBatch.id })
    setWorking(false)
    setConfirmation('')
    if (error) return onError(error.message)
    onNotice(`${selectedBatch.name} and all of its records were permanently deleted.`)
    onChanged(currentBatchId)
  }

  return (
    <>
      <AuthToast message={formError} onDismiss={() => setFormError('')} variant="error" />
      {confirmation === 'active' && selectedBatch && <ConfirmDialog title={`Set ${selectedBatch.name} as active?`} message="The current semester will be archived. New enrollment submissions and dashboard records will use the selected semester and its enrollment window." confirmLabel="Set as Active" tone="primary" iconClass="app-icon-calendar-due" busy={working} onConfirm={setActiveSemester} onCancel={() => setConfirmation('')} />}
      {confirmation === 'delete' && selectedBatch && <ConfirmDialog title={`Delete ${selectedBatch.name}?`} message="This permanently deletes every enrollment in this semester, including linked attendance and growth records. User accounts will not be deleted. This cannot be undone." confirmLabel="Delete Selected" busy={working} onConfirm={deleteSemester} onCancel={() => setConfirmation('')} />}

      {dialogMode && <div className="semester-dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) setDialogMode('') }}>
        <section className="semester-dialog" role="dialog" aria-modal="true" aria-labelledby="semester-dialog-title">
          <header className="semester-dialog-header"><div><h2 id="semester-dialog-title">{dialogMode === 'update' ? 'Update semester' : 'Create new semester'}</h2><p>{dialogMode === 'update' ? 'Edit the semester name, academic dates, and enrollment window.' : 'Set the academic period and its separate enrollment window.'}</p></div><button type="button" className="popup-close-button" onClick={() => setDialogMode('')} disabled={working} aria-label="Close semester dialog"><i className="app-icon app-icon-close" aria-hidden="true" /></button></header>
          <form className="semester-form" onSubmit={saveSemester}>
            <label className="semester-name-field"><span>Semester name</span><input type="text" value={semester.name} minLength="2" maxLength="20" onChange={(event) => updateSemester('name', event.target.value)} placeholder="S.Y. 20XX" required /><small>Use a clear name, up to 20 characters. {semester.name.length} of 20 characters used.</small></label>
            <fieldset className="semester-form-section"><legend>Semester dates</legend><p>The period when classes and student records belong to this semester.</p><div className="semester-date-fields"><label><span>Semester starts</span><input type="date" value={semester.startsOn} min={dialogMode === 'create' ? today : undefined} onChange={(event) => updateSemester('startsOn', event.target.value)} required /></label><label><span>Semester ends</span><input type="date" value={semester.endsOn} min={semester.startsOn || (dialogMode === 'create' ? today : undefined)} onChange={(event) => updateSemester('endsOn', event.target.value)} required /></label></div></fieldset>
            <fieldset className="semester-form-section"><legend>Enrollment window</legend><p>When students can submit enrollment requests. These dates are independent of semester dates.</p><div className="semester-window-fields"><label><span>Enrollment opens</span><input type="date" value={semester.opensDate} min={dialogMode === 'create' ? today : undefined} onChange={(event) => updateSemester('opensDate', event.target.value)} required /></label><label><span>Time</span><input type="time" value={semester.opensTime} onChange={(event) => updateSemester('opensTime', event.target.value)} required /></label><label><span>Enrollment closes</span><input type="date" value={semester.closesDate} min={semester.opensDate || (dialogMode === 'create' ? today : undefined)} onChange={(event) => updateSemester('closesDate', event.target.value)} required /></label><label><span>Time</span><input type="time" value={semester.closesTime} onChange={(event) => updateSemester('closesTime', event.target.value)} required /></label></div></fieldset>
            <p className="semester-time-note"><i className="app-icon app-icon-clock" aria-hidden="true" /> Enrollment may remain open after the semester starts.</p>
            <div className="semester-dialog-actions"><button type="button" className="button-secondary" onClick={() => setDialogMode('')} disabled={working}>Cancel</button><button type="submit" className="approve-button" disabled={working}>{dialogMode === 'update' ? 'Edit Semester' : 'Create Semester'}</button></div>
          </form>
        </section>
      </div>}

      <div className="semester-schedule-layout">
        <section className="semester-management" aria-label="Student semester">
          <div className="semester-copy"><span>Student Semester</span><strong>{selectedBatch ? `${selectedBatch.name} · ${isCurrent ? 'Active' : 'Archived'}` : 'Semester unavailable'}</strong><p>Choose a semester to view its requests, students, attendance, and health records.</p></div>
          <div className="semester-picker-row"><PaginatedDropdown options={batches.map((batch) => ({ value: batch.id, label: batch.name }))} value={selectedBatchId} onChange={onSelect} disabled={working || batches.length === 0} ariaLabel="View semester" pageSize={10} /><button type="button" className="semester-create-button" onClick={openCreateDialog} disabled={working}>Create New</button></div>
          <div className="semester-management-actions"><button type="button" className="semester-update-button" onClick={openUpdateDialog} disabled={working || !selectedBatch}>Edit Semester</button><button type="button" className="semester-activate-button" onClick={() => setConfirmation('active')} disabled={working || !selectedBatch || isCurrent}>{isCurrent ? 'Currently Active' : 'Set as Active'}</button>{canDelete && <button type="button" className="batch-delete-button" onClick={() => setConfirmation('delete')} disabled={working || !selectedBatch || isCurrent}>{isCurrent ? 'Delete Locked' : 'Delete Selected'}</button>}</div>
        </section>
        <dl className="semester-schedule-cards"><div className="schedule-visual-card"><span className="schedule-icon"><i className="app-icon app-icon-clock" aria-hidden="true" /></span><div><dt>Enrollment opens</dt><dd><strong>{openingSchedule.date}</strong><span>{openingSchedule.time}</span></dd></div></div><div className="schedule-visual-card"><span className="schedule-icon"><i className="app-icon app-icon-clock" aria-hidden="true" /></span><div><dt>Enrollment closes</dt><dd><strong>{closingSchedule.date}</strong><span>{closingSchedule.time}</span></dd></div></div></dl>
      </div>
    </>
  )
}

export default EnrollmentBatchControls
