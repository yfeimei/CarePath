export interface RoutePass {
  /** Long random value; appears only in the QR URL. */
  secureToken: string;
  /** Short call-friendly value, e.g. "RP-4821". Read aloud on the phone. */
  publicId: string;
  routeId: string;
  origin: string;
  destination: string;
  /** Snapshotted at creation so a catalog edit can't rewrite a live pass. */
  steps: string[];
  landmarks: string[];
  createdAt: number;
  expiresAt: number;
}

export interface PassStore {
  put(pass: RoutePass): Promise<void>;
  getByToken(token: string): Promise<RoutePass | null>;
  getByPublicId(publicId: string): Promise<RoutePass | null>;
  hasPublicId(publicId: string): Promise<boolean>;
  /** Live (unexpired) pass count. Diagnostics only. */
  size(): Promise<number>;
}
