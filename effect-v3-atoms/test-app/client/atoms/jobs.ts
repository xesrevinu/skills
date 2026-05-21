import { Atom, defineFeature } from '@xstack/atom-react'
import { Effect, Option, Stream } from 'effect'
import { JobResult, SubmitJobInput } from '../jobs/domain'
import { JobsService, JobsServiceLive } from '../jobs/service'

export const jobsFeature = defineFeature({
  tags: { JobsService },
  provide: JobsServiceLive,
  make: (runtime) => {
    const jobs = runtime.atom(
      Stream.unwrap(
        Effect.gen(function* () {
          const service = yield* JobsService
          return service.jobsStream
        }),
      ),
      { initialValue: [] },
    )

    const events = runtime.atom(
      Stream.unwrap(
        Effect.gen(function* () {
          const service = yield* JobsService
          return service.eventsStream
        }),
      ),
      { initialValue: [] },
    )

    const selectedJobId = runtime.atom(Effect.succeed(Option.none<string>()), {
      initialValue: Option.none(),
    })

    const lastResult = runtime.atom(Effect.succeed(Option.none<JobResult>()), {
      initialValue: Option.none(),
    })

    const submitJob = runtime.fn(
      Effect.fn(function* (input: typeof SubmitJobInput.Type, ctx: Atom.FnContext) {
        const service = yield* JobsService
        const job = yield* service.submit(input)
        yield* ctx.set(selectedJobId, Option.some(job.id))
        return job
      }),
    )

    const cancelJob = runtime.fn(
      Effect.fn(function* (jobId: string) {
        const service = yield* JobsService
        yield* service.cancel(jobId)
      }),
    )

    const awaitJobResult = runtime.fn(
      Effect.fn(function* (jobId: string, ctx: Atom.FnContext) {
        const service = yield* JobsService
        const result = yield* service.awaitResult(jobId)
        yield* ctx.set(lastResult, Option.some(result))
        return result
      }),
    )

    const clearLastResult = runtime.fn(
      Effect.fn(function* (_: void, ctx: Atom.FnContext) {
        yield* ctx.set(lastResult, Option.none())
      }),
    )

    const selectJob = runtime.fn(
      Effect.fn(function* (jobId: string, ctx: Atom.FnContext) {
        yield* ctx.set(selectedJobId, Option.some(jobId))
      }),
    )

    return {
      jobs,
      events,
      selectedJobId,
      lastResult,
      submitJob,
      cancelJob,
      awaitJobResult,
      clearLastResult,
      selectJob,
    }
  },
})
