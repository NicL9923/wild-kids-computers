/** Messages between the studio and the whole-picture effect worker. */
export type EffectRequest =
  | { readonly kind: 'warm'; readonly id: number }
  | {
      readonly kind: 'apply';
      readonly id: number;
      readonly effectId: string;
      readonly width: number;
      readonly height: number;
      readonly pixels: Uint8ClampedArray;
    };

export type EffectResponse =
  | { readonly kind: 'ready'; readonly id: number }
  | { readonly kind: 'result'; readonly id: number; readonly pixels: Uint8ClampedArray }
  | { readonly kind: 'error'; readonly id: number; readonly message: string };
