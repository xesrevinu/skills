import { Schema } from 'effect'

export const JobStatus = Schema.Literal('queued', 'running', 'succeeded', 'failed', 'cancelled')

export class Job extends Schema.Class<Job>('Job')({
  id: Schema.String,
  payload: Schema.String,
  status: JobStatus,
  progress: Schema.Number,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  output: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
}) {}

export class SubmitJobInput extends Schema.Class<SubmitJobInput>('SubmitJobInput')({
  payload: Schema.String,
}) {}

export class JobResult extends Schema.Class<JobResult>('JobResult')({
  jobId: Schema.String,
  output: Schema.String,
  finishedAt: Schema.Number,
}) {}

export class JobEvent extends Schema.Class<JobEvent>('JobEvent')({
  jobId: Schema.String,
  at: Schema.Number,
  type: Schema.Literal('queued', 'started', 'progress', 'succeeded', 'failed', 'cancelled'),
  message: Schema.String,
}) {}
