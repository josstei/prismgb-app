# Architecture Onboarding

Start with the [architecture and ownership diagrams](architecture-diagrams.md), then use the [feature map](feature-map.md) to locate a user-facing workflow.

## Reading Order

1. Read `src/main/index.ts` and `src/renderer/index.ts` for process startup and shutdown.
2. Read each process's `app-bootstrap.ts` and `application/container.ts`. These create typed runtimes and define initialization and disposal ownership.
3. Follow `StreamingService`, `StreamingOrchestrator`, and `StreamingRenderService` for acquisition, workflow decisions, and rendering session transitions.
4. Follow `src/main/ipc/router.ts` for request contracts and subscriptions. `IPC_CHANNELS` describes push events only.
5. Read the typed settings and renderer event declarations before adding another setting or event.

## Changes to Make in One Place

| Change | Owner |
| --- | --- |
| Add a constructor dependency | The service dependency type and process runtime construction |
| Add a settings control | Typed settings definition and its behavior-specific consumer |
| Add a renderer event | Event declaration with its payload type |
| Add a main request | tRPC procedure and boundary schema |
| Add a push event | Typed push map, publishing service, and validated subscription |
| Add device support | Shared device catalog and catalog-backed fixtures |
| Change a GPU uniform | Typed pass specification and shader algorithm |
| Add a platform entrypoint | Alias registry, followed by `npm run generate:paths` |

## Lifecycle Rules

Construction establishes ownership; initialization starts listeners and work. Each runtime shares initialization/disposal across callers and rolls back failed startup. Put resource cleanup with its owner, then register that owner in the runtime's teardown order. Components must release pending work before the services they use are disposed.

Main keeps the window and IPC available until the ready renderer acknowledges shutdown after flushing notes and recording work. It then drains accepted conversions and registered downloads before service teardown. Register a blob download through `expectDownload` before clicking its anchor so shutdown also covers downloads that have not started yet. Failed handshakes still trigger cleanup and cancellation, and fail packaged smoke.

Use narrow browser, Electron, device, and storage ports for tests. Constructor tests should not inspect private dependency-injection metadata. Test startup failure, repeated cleanup, stream restart, fallback rendering, persisted settings, and pending note edits when changing ownership.
