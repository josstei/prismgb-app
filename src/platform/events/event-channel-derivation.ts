/**
 * Generic mechanism for deriving a nested, literal-typed channel-name lookup
 * object from a manifest scope's event list. Shared by the renderer and main
 * channel maps so neither hand-mirrors the manifest.
 */

type ManifestChannelEvent = {
  readonly domain: string;
  readonly name: string;
  readonly value: string;
};

type ReplaceDashesWithUnderscores<S extends string> = S extends `${infer Head}-${infer Tail}`
  ? `${Head}_${ReplaceDashesWithUnderscores<Tail>}`
  : S;

type ScreamingSnakeCase<S extends string> = Uppercase<ReplaceDashesWithUnderscores<S>>;

export type EventChannelMap<TEvent extends ManifestChannelEvent> = {
  readonly [Domain in TEvent['domain'] as ScreamingSnakeCase<Domain>]: {
    readonly [Name in Extract<TEvent, { domain: Domain }>['name'] as ScreamingSnakeCase<Name>]: Extract<
      TEvent,
      { domain: Domain; name: Name }
    >['value'];
  };
};

function screamingSnakeCase(value: string): string {
  return value.toUpperCase().replace(/-/g, '_');
}

export function deriveEventChannelMap<TEvent extends ManifestChannelEvent>(
  events: ReadonlyArray<TEvent>
): EventChannelMap<TEvent> {
  const channelMap: Record<string, Record<string, string>> = {};

  for (const event of events) {
    const domainKey = screamingSnakeCase(event.domain);
    const nameKey = screamingSnakeCase(event.name);
    (channelMap[domainKey] ??= {})[nameKey] = event.value;
  }

  return channelMap as EventChannelMap<TEvent>;
}
