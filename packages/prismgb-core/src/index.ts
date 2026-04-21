export { Injectable } from './decorators/injectable';
export { Singleton } from './decorators/singleton';
export { Service, type ServiceOptions } from './decorators/service';
export { Module, type ModuleOptions } from './decorators/module';
export { OnInit } from './decorators/on-init';
export { OnDestroy } from './decorators/on-destroy';
export { Subscribe } from './decorators/subscribe';
export { Rpc, type RpcOptions } from './decorators/rpc';
export { WorkerMethod } from './decorators/worker-method';
export { Push } from './decorators/push';
export { Inject } from './decorators/inject';

export { EventBus } from './events/event-bus';
export type { EventChannelMap } from './events/event-channel-map';
export { Channel } from './events/channel';
export { BufferedChannel } from './events/buffered-channel';

export type {
  Logger,
  LoggerFactory,
  LogLevel
} from './lifecycle/logger.interface';

export type {
  PrismgbModule,
  ModuleSurface,
  ModuleLoader,
  ManifestContractPointer
} from './manifest/prismgb-module';

export type { ServiceRunsScope, ServiceMetadata } from './metadata/service-metadata';
export type { RpcMethodMetadata } from './metadata/rpc-metadata';
export type { WorkerMethodMetadata } from './metadata/worker-method-metadata';
export type { SubscribeHandlerMetadata } from './metadata/subscribe-metadata';
export type { ModuleMetadata, Constructable } from './metadata/module-metadata';

export { getServiceMetadata } from './metadata/service-metadata';
export { getRpcMetadata } from './metadata/rpc-metadata';
export { getWorkerMethodMetadata } from './metadata/worker-method-metadata';
export { getSubscribeHandlers } from './metadata/subscribe-metadata';
export { getPushProperties } from './metadata/push-metadata';
export { getOnInitMethods, getOnDestroyMethods } from './metadata/lifecycle-metadata';
export { getModuleMetadata } from './metadata/module-metadata';

export { METADATA_KEYS, type MetadataKey } from './metadata/metadata-keys';
