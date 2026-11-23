declare const brandSymbol: unique symbol;
export type Brand<T, Name extends string> = T & { readonly [brandSymbol]: Name };

export type EntityId = Brand<number, 'EntityId'>;
export type OwnerId = Brand<number, 'OwnerId'>;
export type Tick = Brand<number, 'Tick'>;
export type Seq = Brand<number, 'Seq'>;

export const asEntityId = (n: number): EntityId => n as EntityId;
export const asOwnerId = (n: number): OwnerId => n as OwnerId;
export const asTick = (n: number): Tick => n as Tick;
export const asSeq = (n: number): Seq => n as Seq;

export function assertNever(value: never): never {
  throw new Error(`Unhandled discriminated union member: ${JSON.stringify(value)}`);
}

export type PlayerInputCmd = {
  readonly turn: -1 | 0 | 1;
  readonly thrust: 0 | 1;
  readonly fire: 0 | 1;
};

export type SequencedInput = PlayerInputCmd & {
  readonly seq: Seq;
};

export type ShipSnapshot = {
  readonly id: EntityId;
  readonly kind: 'ship';
  readonly ownerId: OwnerId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly hp: number;
};

export type AsteroidSnapshot = {
  readonly id: EntityId;
  readonly kind: 'asteroid';
  readonly ownerId: OwnerId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly hp: number;
};

export type BulletSnapshot = {
  readonly id: EntityId;
  readonly kind: 'bullet';
  readonly ownerId: OwnerId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly hp: number;
};

export type EntitySnapshot = ShipSnapshot | AsteroidSnapshot | BulletSnapshot;

export type WorldSnapshot = {
  readonly type: 'snapshot';
  readonly tick: Tick;
  readonly lastProcessedSeq: Seq;
  readonly serverTime: number;
  readonly entities: readonly EntitySnapshot[];
}; 