type SceneSourceRef = {
  name: string;
  type: string;
};

type SceneRef = {
  sources?: SceneSourceRef[];
};

type UniqueSourceNameOptions = {
  reuseSameType?: boolean;
};

export function uniqueSourceNameForType(
  requestedName: string,
  requestedType: string,
  scenes: SceneRef[],
  options: UniqueSourceNameOptions = {}
): string {
  const reuseSameType = options.reuseSameType !== false;
  const existingSources = scenes.flatMap((scene) => scene.sources ?? []);
  const exactMatches = existingSources.filter((source) => source.name === requestedName);

  if (exactMatches.length === 0 || (reuseSameType && exactMatches.some((source) => source.type === requestedType))) {
    return requestedName;
  }

  const existingNames = new Set(existingSources.map((source) => source.name));
  let suffix = 2;
  let nextName = `${requestedName} ${suffix}`;
  while (existingNames.has(nextName)) {
    suffix += 1;
    nextName = `${requestedName} ${suffix}`;
  }
  return nextName;
}
