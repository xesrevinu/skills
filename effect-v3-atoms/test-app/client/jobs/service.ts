import type { ServicesReturns } from '@xstack/fx/effect'
import {
  Context,
  Deferred,
  Effect,
  Fiber,
  HashMap,
  Layer,
  Queue,
  Ref,
  Stream,
  SubscriptionRef,
} from 'effect'
import { Job, JobEvent, JobResult, SubmitJobInput } from './domain'
import { JobNotFoundError, JobOperationError } from './error'

interface JobsRpcClient {
  jobs: {
    list: () => Effect.Effect<ReadonlyArray<Job>, JobOperationError>
    submit: (input: typeof SubmitJobInput.Type) => Effect.Effect<Job, JobOperationError>
    cancel: (input: { jobId: string }) => Effect.Effect<void, JobNotFoundError>
    awaitResult: (input: { jobId: string }) => Effect.Effect<JobResult, JobNotFoundError | JobOperationError>
  }
}

const JobsRpcClient = Context.GenericTag<JobsRpcClient>('@client:jobs-rpc-client')

export class JobsService extends Context.Tag('@client:jobs-service')<
  JobsService,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<Job>, JobOperationError>
    readonly submit: (input: typeof SubmitJobInput.Type) => Effect.Effect<Job, JobOperationError>
    readonly cancel: (jobId: string) => Effect.Effect<void, JobNotFoundError>
    readonly awaitResult: (jobId: string) => Effect.Effect<JobResult, JobNotFoundError | JobOperationError>
    readonly jobsStream: Stream.Stream<ReadonlyArray<Job>>
    readonly eventsStream: Stream.Stream<ReadonlyArray<JobEvent>>
  }
>() {}

export declare namespace JobsService {
  export type Methods = Context.Tag.Service<JobsService>
  export type Returns<Key extends keyof Methods> = ServicesReturns<Methods[Key]>
}

export const JobsServiceLayer = Layer.effect(
  JobsService,
  Effect.gen(function* () {
    const rpc = yield* JobsRpcClient
    const jobsStateRef = yield* SubscriptionRef.make<ReadonlyArray<Job>>([])
    const eventsStateRef = yield* SubscriptionRef.make<ReadonlyArray<JobEvent>>([])

    const refreshFromServer = Effect.fn('jobs.refreshFromServer')(function* (): Effect.Effect<void> {
      const jobs = yield* rpc.jobs.list()
      yield* SubscriptionRef.set(jobsStateRef, jobs)
    })

    const list: JobsService.Methods['list'] = Effect.fn('jobs.list')(
      function* (): JobsService.Returns<'list'> {
        return yield* rpc.jobs.list()
      },
    )

    const submit: JobsService.Methods['submit'] = Effect.fn('jobs.submit')(
      function* (input): JobsService.Returns<'submit'> {
        const job = yield* rpc.jobs.submit(input)
        yield* refreshFromServer()
        yield* SubscriptionRef.update(eventsStateRef, (events) => [
          JobEvent.make({ jobId: job.id, at: Date.now(), type: 'queued', message: 'submitted from client' }),
          ...events,
        ])
        return job
      },
    )

    const cancel: JobsService.Methods['cancel'] = Effect.fn('jobs.cancel')(
      function* (jobId): JobsService.Returns<'cancel'> {
        yield* rpc.jobs.cancel({ jobId })
        yield* refreshFromServer()
        yield* SubscriptionRef.update(eventsStateRef, (events) => [
          JobEvent.make({ jobId, at: Date.now(), type: 'cancelled', message: 'cancel requested' }),
          ...events,
        ])
      },
    )

    const awaitResult: JobsService.Methods['awaitResult'] = Effect.fn('jobs.awaitResult')(
      function* (jobId): JobsService.Returns<'awaitResult'> {
        const result = yield* rpc.jobs.awaitResult({ jobId })
        yield* refreshFromServer()
        yield* SubscriptionRef.update(eventsStateRef, (events) => [
          JobEvent.make({ jobId, at: Date.now(), type: 'succeeded', message: 'result received on client' }),
          ...events,
        ])
        return result
      },
    )

    yield* refreshFromServer().pipe(Effect.catchAll(() => Effect.void))

    return {
      list,
      submit,
      cancel,
      awaitResult,
      jobsStream: SubscriptionRef.changes(jobsStateRef),
      eventsStream: SubscriptionRef.changes(eventsStateRef),
    }
  }),
)

type PendingResult = Deferred.Deferred<JobResult, JobNotFoundError | JobOperationError>

type JobCommand =
  | { readonly _tag: 'Run'; readonly jobId: string }
  | { readonly _tag: 'Cancel'; readonly jobId: string }

const MockJobsRpcClient = Layer.effect(
  JobsRpcClient,
  Effect.gen(function* () {
    const jobsRef = yield* Ref.make(HashMap.empty<string, Job>())
    const deferredRef = yield* Ref.make(HashMap.empty<string, PendingResult>())
    const queue = yield* Queue.unbounded<JobCommand>()

    const upsertJob = Effect.fn('jobs.mock.upsertJob')(function* (job: Job): Effect.Effect<void> {
      yield* Ref.update(jobsRef, HashMap.set(job.id, job))
    })

    const getJobOrFail = Effect.fn('jobs.mock.getJobOrFail')(function* (jobId: string): Effect.Effect<Job, JobNotFoundError> {
      const jobs = yield* Ref.get(jobsRef)
      const found = HashMap.get(jobs, jobId)
      if (found._tag === 'None') {
        return yield* new JobNotFoundError({ jobId, message: `Job not found: ${jobId}` })
      }
      return found.value
    })

    const runJob = Effect.fn('jobs.mock.runJob')(function* (jobId: string): Effect.Effect<void> {
      const started = yield* getJobOrFail(jobId)
      if (started.status === 'cancelled') {
        return
      }

      yield* upsertJob(Job.make({ ...started, status: 'running', progress: 40, updatedAt: Date.now() }))
      yield* Effect.sleep(180)

      const current = yield* getJobOrFail(jobId)
      if (current.status === 'cancelled') {
        return
      }

      const pending = yield* Ref.get(deferredRef)
      const deferred = HashMap.get(pending, jobId)
      if (deferred._tag === 'None') {
        return yield* new JobOperationError({ message: `Missing deferred: ${jobId}` })
      }

      if (current.payload.toLowerCase().includes('fail')) {
        const failed = Job.make({
          ...current,
          status: 'failed',
          progress: 100,
          updatedAt: Date.now(),
          error: 'Mock worker failed by payload',
        })
        yield* upsertJob(failed)
        yield* Deferred.fail(deferred.value, new JobOperationError({ message: failed.error ?? 'failed' }))
        return
      }

      const output = `done:${current.payload}`
      const succeeded = Job.make({
        ...current,
        status: 'succeeded',
        progress: 100,
        updatedAt: Date.now(),
        output,
      })
      yield* upsertJob(succeeded)
      yield* Deferred.succeed(
        deferred.value,
        JobResult.make({
          jobId,
          output,
          finishedAt: Date.now(),
        }),
      )
    })

    const cancelJob = Effect.fn('jobs.mock.cancelJob')(function* (jobId: string): Effect.Effect<void, JobNotFoundError> {
      const current = yield* getJobOrFail(jobId)
      if (current.status === 'succeeded' || current.status === 'failed') {
        return
      }

      const cancelled = Job.make({
        ...current,
        status: 'cancelled',
        progress: 100,
        updatedAt: Date.now(),
        error: 'Cancelled by user',
      })
      yield* upsertJob(cancelled)

      const pending = yield* Ref.get(deferredRef)
      const deferred = HashMap.get(pending, jobId)
      if (deferred._tag === 'Some') {
        yield* Deferred.fail(deferred.value, new JobOperationError({ message: 'Cancelled by user' }))
      }
    })

    const worker = yield* Queue.take(queue).pipe(
      Effect.flatMap((cmd) => (cmd._tag === 'Run' ? runJob(cmd.jobId) : cancelJob(cmd.jobId))),
      Effect.catchAllCause(Effect.logError),
      Effect.forever,
      Effect.forkScoped,
    )

    const listJobs = Effect.fn('jobs.mock.list')(function* (): Effect.Effect<ReadonlyArray<Job>, JobOperationError> {
      const jobs = yield* Ref.get(jobsRef)
      return Array.from(HashMap.values(jobs)).sort((a, b) => b.updatedAt - a.updatedAt)
    })

    const submitJob = Effect.fn('jobs.mock.submit')(function* (
      input: typeof SubmitJobInput.Type,
    ): Effect.Effect<Job, JobOperationError> {
      const now = Date.now()
      const id = `job_${now}_${Math.random().toString(36).slice(2, 11)}`
      const deferred = yield* Deferred.make<JobResult, JobNotFoundError | JobOperationError>()

      const job = Job.make({
        id,
        payload: input.payload,
        status: 'queued',
        progress: 0,
        createdAt: now,
        updatedAt: now,
      })

      yield* upsertJob(job)
      yield* Ref.update(deferredRef, HashMap.set(id, deferred))
      yield* Queue.offer(queue, { _tag: 'Run', jobId: id })
      return job
    })

    const awaitResultJob = Effect.fn('jobs.mock.awaitResult')(function* (input: {
      jobId: string
    }): Effect.Effect<JobResult, JobNotFoundError | JobOperationError> {
      const deferredMap = yield* Ref.get(deferredRef)
      const deferred = HashMap.get(deferredMap, input.jobId)
      if (deferred._tag === 'None') {
        return yield* new JobNotFoundError({ jobId: input.jobId, message: `No pending result for ${input.jobId}` })
      }

      const result = yield* Deferred.await(deferred.value)
      yield* Ref.update(deferredRef, HashMap.remove(input.jobId))
      return result
    })

    yield* Effect.addFinalizer(() => Fiber.interrupt(worker))

    return {
      jobs: {
        list: listJobs,
        submit: submitJob,
        cancel: ({ jobId }) =>
          Effect.gen(function* () {
            yield* getJobOrFail(jobId)
            yield* Queue.offer(queue, { _tag: 'Cancel', jobId })
          }),
        awaitResult: awaitResultJob,
      },
    } satisfies JobsRpcClient
  }),
)

export const JobsServiceLive = Layer.provide(JobsServiceLayer, MockJobsRpcClient)
