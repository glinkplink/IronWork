declare module '@scope-server/lib/service-supabase.mjs' {
  export function resetServiceSupabaseSingleton(): void;
  export function getServiceSupabase(options?: {
    errorCode?: string;
    errorMessage?: string;
  }): unknown;
}

declare module '@scope-server/stripe-routes.mjs' {
  export function resetStripeServiceSupabaseSingleton(): void;
  export function tryHandleStripeRoute(
    req: unknown,
    res: unknown,
    helpers: {
      readJsonBody: (req: unknown) => Promise<unknown>;
      readRawBody: (req: unknown) => Promise<string>;
      sendJson: (res: unknown, code: number, payload: unknown) => void;
      sendText: (res: unknown, code: number, message: string) => void;
    }
  ): Promise<boolean>;
}
