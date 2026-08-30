export type RscRecordKind = "import" | "json";

export interface RscRecord {
  id: string;
  kind: RscRecordKind;
  value: unknown;
}

export type RscRecordMap = ReadonlyMap<string, RscRecord>;
