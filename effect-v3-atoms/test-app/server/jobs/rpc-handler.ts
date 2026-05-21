import { Rpc } from '@effect/rpc'
import { Effect, Schema } from 'effect'
import { Job, JobResult, SubmitJobInput } from './domain'
import { JobNotFoundError, JobOperationError } from './error'
import { JobService } from './service'

export const JobsRpc = Rpc.make({
  list: Rpc.procedure
    .addSuccess(Schema.Array(Job))
    .effect(() => JobService.pipe(Effect.flatMap((s) => s.list()))),

  submit: Rpc.procedure
    .input(SubmitJobInput)
    .addSuccess(Job)
    .addError(JobOperationError)
    .effect((input) => JobService.pipe(Effect.flatMap((s) => s.submit(input)))),

  cancel: Rpc.procedure
    .input(Schema.Struct({ jobId: Schema.String }))
    .addSuccess(Schema.Void)
    .addError(JobNotFoundError)
    .effect(({ jobId }) => JobService.pipe(Effect.flatMap((s) => s.cancel(jobId)))),

  awaitResult: Rpc.procedure
    .input(Schema.Struct({ jobId: Schema.String }))
    .addSuccess(JobResult)
    .addError(JobNotFoundError)
    .addError(JobOperationError)
    .effect(({ jobId }) => JobService.pipe(Effect.flatMap((s) => s.awaitResult(jobId)))),
})
