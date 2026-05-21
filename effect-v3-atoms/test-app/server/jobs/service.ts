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

type AwaitResultError = JobNotFoundError | JobOperationError

type JobCommand =
  | { readonly _tag: 'Run'; readonly jobId: string }
  | { readonly _tag: 'Cancel'; readonly jobId: string }

export class JobService extends Context.Tag('jobs/JobService')<
  JobService,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<Job>>
    readonly submit: (input: typeof SubmitJobInput.Type) => Effect.Effect<Job, JobOperationError>
    readonly cancel: (jobId: string) => Effect.Effect<void, JobNotFoundError>
    readonly awaitResult: (jobId: string) => Effect.Effect<JobResult, AwaitResultError>
    readonly jobsStream: Stream.Stream<ReadonlyArray<Job>>
    readonly eventsStream: Stream.Stream<ReadonlyArray<JobEvent>>
  }
>() {}

export declare namespace JobService {
  export type Methods = Context.Tag.Service<JobService>
  export type Returns<Key extends keyof Methods> = ServicesReturns<Methods[Key]>
}

const sortJobs = (jobs: Iterable<Job>): ReadonlyArray<Job> =>
  Array.from(jobs).sort((a, b) => b.updatedAt - a.updatedAt)

export const JobServiceLive = Layer.effect(
  JobService,
  Effect.gen(function* () {
    const jobsRef = yield* Ref.make(HashMap.empty<string, Job>())
    const resultDeferredsRef = yield* Ref.make(HashMap.empty<string, Deferred.Deferred<JobResult, AwaitResultError>>())
    const jobsStateRef = yield* SubscriptionRef.make<ReadonlyArray<Job>>([])
    const eventsStateRef = yield* SubscriptionRef.make<ReadonlyArray<JobEvent>>([])
    const queue = yield* Queue.unbounded<JobCommand>()

    const appendEvent = Effect.fn('jobs.appendEvent')(function* (
      input: Omit<typeof JobEvent.Type, 'at'>,
    ): Effect.Effect<void> {
      const event = JobEvent.make({ ...input, at: Date.now() })
      yield* SubscriptionRef.update(eventsStateRef, (events) => [event, ...events].slice(0, 100))
    })

    const publishJobs = Effect.fn('jobs.publishJobs')(function* (): Effect.Effect<void> {
      const jobsMap = yield* Ref.get(jobsRef)
      yield* SubscriptionRef.set(jobsStateRef, sortJobs(HashMap.values(jobsMap)))
    })

    const setJob = Effect.fn('jobs.setJob')(function* (job: Job): Effect.Effect<void> {
      yield* Ref.update(jobsRef, HashMap.set(job.id, job))
      yield* publishJobs()
    })

    const getJob = Effect.fn('jobs.getJob')(function* (jobId: string): Effect.Effect<Job, JobNotFoundError> {
      const jobsMap = yield* Ref.get(jobsRef)
      const found = HashMap.get(jobsMap, jobId)
      if (found._tag === 'None') {
        return yield* new JobNotFoundError({ jobId, message: `Job not found: ${jobId}` })
      }
      return found.value
    })

    const executeJob = Effect.fn('jobs.executeJob')(function* (jobId: string): Effect.Effect<void> {
      const startedAt = Date.now()
      const current = yield* getJob(jobId)

      const running = Job.make({
        ...current,
        status: 'running',
        progress: 10,
        updatedAt: startedAt,
      })
      yield* setJob(running)
      yield* appendEvent({ jobId, type: 'started', message: 'job started' })

      yield* Effect.sleep(250)
      const mid = Job.make({ ...running, progress: 55, updatedAt: Date.now() })
      yield* setJob(mid)
      yield* appendEvent({ jobId, type: 'progress', message: 'job progress 55%' })

      yield* Effect.sleep(250)

      const deferredMap = yield* Ref.get(resultDeferredsRef)
      const deferred = HashMap.get(deferredMap, jobId)
      if (deferred._tag === 'None') {
        return yield* new JobOperationError({ message: `Missing deferred for job ${jobId}` })
      }

      if (mid.payload.toLowerCase().includes('fail')) {
        const failed = Job.make({
          ...mid,
          status: 'failed',
          progress: 100,
          updatedAt: Date.now(),
          error: 'Simulated failure by payload keyword',
        })
        yield* setJob(failed)
        yield* appendEvent({ jobId, type: 'failed', message: failed.error ?? 'job failed' })

        const error = new JobOperationError({ message: failed.error ?? 'job failed' })
        yield* Deferred.fail(deferred.value, error)
        return
      }

      const output = `processed:${mid.payload}`
      const succeeded = Job.make({
        ...mid,
        status: 'succeeded',
        progress: 100,
        updatedAt: Date.now(),
        output,
      })
      yield* setJob(succeeded)
      yield* appendEvent({ jobId, type: 'succeeded', message: 'job succeeded' })

      yield* Deferred.succeed(
        deferred.value,
        JobResult.make({
          jobId,
          output,
          finishedAt: Date.now(),
        }),
      )
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* appendEvent({ jobId, type: 'failed', message: error.message })
          const current = yield* Effect.option(getJob(jobId))
          if (current._tag === 'Some') {
            yield* setJob(
              Job.make({
                ...current.value,
                status: 'failed',
                progress: 100,
                updatedAt: Date.now(),
                error: error.message,
              }),
            )
          }

          const deferredMap = yield* Ref.get(resultDeferredsRef)
          const deferred = HashMap.get(deferredMap, jobId)
          if (deferred._tag === 'Some') {
            yield* Deferred.fail(deferred.value, error)
          }
        }),
      ),
    )

    const cancelJobInternal = Effect.fn('jobs.cancelInternal')(function* (jobId: string): Effect.Effect<void> {
      const current = yield* getJob(jobId)
      if (current.status === 'succeeded' || current.status === 'failed' || current.status === 'cancelled') {
        return
      }

      const cancelled = Job.make({
        ...current,
        status: 'cancelled',
        progress: 100,
        updatedAt: Date.now(),
        error: 'Cancelled by user',
      })
      yield* setJob(cancelled)
      yield* appendEvent({ jobId, type: 'cancelled', message: 'job cancelled by user' })

      const deferredMap = yield* Ref.get(resultDeferredsRef)
      const deferred = HashMap.get(deferredMap, jobId)
      if (deferred._tag === 'Some') {
        yield* Deferred.fail(deferred.value, new JobOperationError({ message: 'Job cancelled' }))
      }
    })

    const workerFiber = yield* Queue.take(queue).pipe(
      Effect.flatMap((command) =>
        command._tag === 'Run' ? executeJob(command.jobId) : cancelJobInternal(command.jobId),
      ),
      Effect.catchAllCause(Effect.logError),
      Effect.forever,
      Effect.forkScoped,
    )

    const list: JobService.Methods['list'] = Effect.fn('jobs.list')(function* (): JobService.Returns<'list'> {
      const jobsMap = yield* Ref.get(jobsRef)
      return sortJobs(HashMap.values(jobsMap))
    })

    const submit: JobService.Methods['submit'] = Effect.fn('jobs.submit')(
      function* (input): JobService.Returns<'submit'> {
        const now = Date.now()
        const id = `job_${now}_${Math.random().toString(36).slice(2, 11)}`
        const deferred = yield* Deferred.make<JobResult, AwaitResultError>()

        const job = Job.make({
          id,
          payload: input.payload,
          status: 'queued',
          progress: 0,
          createdAt: now,
          updatedAt: now,
        })

        yield* Ref.update(resultDeferredsRef, HashMap.set(id, deferred))
        yield* setJob(job)
        yield* appendEvent({ jobId: id, type: 'queued', message: 'job queued' })
        yield* Queue.offer(queue, { _tag: 'Run', jobId: id })

        return job
      },
    )

    const cancel: JobService.Methods['cancel'] = Effect.fn('jobs.cancel')(
      function* (jobId): JobService.Returns<'cancel'> {
        yield* getJob(jobId)
        yield* Queue.offer(queue, { _tag: 'Cancel', jobId })
      },
    )

    const awaitResult: JobService.Methods['awaitResult'] = Effect.fn('jobs.awaitResult')(
      function* (jobId): JobService.Returns<'awaitResult'> {
        const deferredMap = yield* Ref.get(resultDeferredsRef)
        const deferred = HashMap.get(deferredMap, jobId)
        if (deferred._tag === 'None') {
          return yield* new JobNotFoundError({ jobId, message: `No pending result for job ${jobId}` })
        }

        const result = yield* Deferred.await(deferred.value)
        yield* Ref.update(resultDeferredsRef, HashMap.remove(jobId))
        return result
      },
    )

    const jobsStream: JobService.Methods['jobsStream'] = SubscriptionRef.changes(jobsStateRef)
    const eventsStream: JobService.Methods['eventsStream'] = SubscriptionRef.changes(eventsStateRef)

    yield* Effect.addFinalizer(() => Fiber.interrupt(workerFiber))

    return {
      list,
      submit,
      cancel,
      awaitResult,
      jobsStream,
      eventsStream,
    }
  }),
)
