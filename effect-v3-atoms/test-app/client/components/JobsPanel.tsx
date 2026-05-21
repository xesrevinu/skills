import React, { useMemo, useState } from 'react'
import * as Exit from 'effect/Exit'
import * as Option from 'effect/Option'
import { jobsFeature } from '../atoms/jobs'

export function JobsPanel() {
  const jobs = jobsFeature.use()
  const jobList = jobs.jobs.useValue()
  const events = jobs.events.useValue()
  const selectedJobId = jobs.selectedJobId.useValue()
  const lastResult = jobs.lastResult.useValue()

  const [payload, setPayload] = useState('rebalance-portfolio')

  const selectedJob = useMemo(
    () =>
      Option.match(selectedJobId, {
        onNone: () => undefined,
        onSome: (id) => jobList.find((job) => job.id === id),
      }),
    [jobList, selectedJobId],
  )

  const onSubmit = () => {
    jobs.submitJob.promise({ payload }).then(
      Exit.match({
        onSuccess: () => setPayload(''),
        onFailure: (cause) => {
          console.error('submit failed', cause)
          alert('Submit failed')
        },
      }),
    )
  }

  return (
    <section style={{ marginTop: '24px', border: '1px solid #ddd', borderRadius: '8px', padding: '16px' }}>
      <h2>Jobs Orchestration (Queue + Stream + Deferred)</h2>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          placeholder="job payload (use 'fail' to simulate error)"
          style={{ width: '360px' }}
        />
        <button onClick={onSubmit}>Submit Job</button>
        <button onClick={() => jobs.clearLastResult.promise()}>Clear Last Result</button>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong>Jobs</strong>
        <ul>
          {jobList.map((job) => (
            <li key={job.id} style={{ marginBottom: '6px' }}>
              <button onClick={() => jobs.selectJob.promise(job.id)}>{job.id.slice(0, 12)}...</button>{' '}
              <span>
                {job.status} ({job.progress}%) - {job.payload}
              </span>{' '}
              <button onClick={() => jobs.awaitJobResult.promise(job.id)}>Await Result</button>{' '}
              <button onClick={() => jobs.cancelJob.promise(job.id)}>Cancel</button>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong>Selected Job</strong>
        <pre>{JSON.stringify(selectedJob ?? null, null, 2)}</pre>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong>Last Deferred Result</strong>
        {Option.match(lastResult, {
          onNone: () => <p style={{ color: '#666' }}>No completed result yet.</p>,
          onSome: (result) => <pre>{JSON.stringify(result, null, 2)}</pre>,
        })}
      </div>

      <div>
        <strong>Recent Events (stream)</strong>
        <pre>{JSON.stringify(events.slice(0, 12), null, 2)}</pre>
      </div>
    </section>
  )
}
