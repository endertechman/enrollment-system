import { useState } from 'react'
import { supabase } from '../lib/supabase'
import ConfirmDialog from './ConfirmDialog'
import LoadingSpinner from './LoadingSpinner'

function batchLabel(batch, currentBatchId) {
  return `Batch ${batch.batch_number}${batch.id === currentBatchId ? ' · Current' : ' · Archived'}`
}

function EnrollmentBatchControls({ batches, currentBatchId, selectedBatchId, scheduleEditing = false, onUpdateSchedule, onSelect, onChanged, onNotice, onError }) {
  const [confirmation, setConfirmation] = useState('')
  const [working, setWorking] = useState(false)
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId)

  async function startBatch() {
    setWorking(true)
    onError('')
    const { data, error } = await supabase.rpc('start_new_enrollment_batch')
    setWorking(false)
    setConfirmation('')

    if (error) {
      onError(error.message)
      return
    }

    onNotice('A new enrollment batch is ready. Set its enrollment schedule before accepting submissions.')
    onChanged(data?.id || '')
  }

  async function deleteBatch() {
    if (!selectedBatch || selectedBatch.id === currentBatchId) return
    setWorking(true)
    onError('')
    const { error } = await supabase.rpc('delete_enrollment_batch', { p_batch_id: selectedBatch.id })
    setWorking(false)
    setConfirmation('')

    if (error) {
      onError(error.message)
      return
    }

    onNotice(`Batch ${selectedBatch.batch_number} and all of its records were permanently deleted.`)
    onChanged(currentBatchId)
  }

  return (
    <>
      {confirmation === 'start' && <ConfirmDialog title="Start a new enrollment batch?" message="The current batch will be archived and enrollment will close until you set a new schedule. Existing records will remain available in batch history." confirmLabel="Start New Batch" tone="primary" iconClass="app-icon-calendar-due" busy={working} onConfirm={startBatch} onCancel={() => setConfirmation('')} />}
      {confirmation === 'delete' && selectedBatch && <ConfirmDialog title={`Delete Batch ${selectedBatch.batch_number}?`} message="This permanently deletes every enrollment in this batch, including linked attendance and growth records. This cannot be undone." confirmLabel="Delete Entire Batch" busy={working} onConfirm={deleteBatch} onCancel={() => setConfirmation('')} />}

      <section className="enrollment-batch-controls" aria-label="Enrollment batch management">
        <div className="enrollment-batch-copy">
          <span className="enrollment-batch-eyebrow">Student batch</span>
          <strong>{selectedBatch ? batchLabel(selectedBatch, currentBatchId) : 'Batch unavailable'}</strong>
          <small>Choose a batch to view its requests, students, attendance, and health records.</small>
        </div>
        <div className="enrollment-batch-actions">
          <label>
            <span>View batch</span>
            <select value={selectedBatchId} onChange={(event) => onSelect(event.target.value)} disabled={working || batches.length === 0}>
              {batches.map((batch) => <option key={batch.id} value={batch.id}>{batchLabel(batch, currentBatchId)}</option>)}
            </select>
          </label>
          <div className="enrollment-batch-buttons">
            {!scheduleEditing && <button type="button" className="approve-button" onClick={onUpdateSchedule} disabled={working}>Update Schedule</button>}
            <button type="button" className="button-secondary" onClick={() => setConfirmation('start')} disabled={working || !currentBatchId}>{working ? <LoadingSpinner label="Working..." inline /> : 'Start New Batch'}</button>
            {selectedBatch && selectedBatch.id !== currentBatchId && <button type="button" className="batch-delete-button" onClick={() => setConfirmation('delete')} disabled={working}>Delete Previous Batch</button>}
          </div>
        </div>
      </section>
    </>
  )
}

export default EnrollmentBatchControls
