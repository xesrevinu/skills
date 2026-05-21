import { Schema } from 'effect'

export class JobNotFoundError extends Schema.TaggedError<JobNotFoundError>()('JobNotFoundError', {
  jobId: Schema.String,
  message: Schema.String,
}) {}

export class JobOperationError extends Schema.TaggedError<JobOperationError>()('JobOperationError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}
