---
"@prismgb/core": minor
---

Initial `@prismgb/core` platform package landed as part of Phase 1A of the platform refactor.

- Decorator API: `@Injectable`, `@Singleton`, `@Service`, `@Module`, `@OnInit`, `@OnDestroy`, `@Subscribe`, `@Rpc`, `@WorkerMethod`, `@Push`, `@Inject`
- Typed `EventBus<TMap>` with `EventChannelMap` augmentation
- `Channel<T>` and `BufferedChannel<T>` for push streams
- `Logger` + `LoggerFactory` interfaces
- `PrismgbModule` manifest type
- Metadata introspection helpers (`getServiceMetadata`, `getRpcMetadata`, etc.)
