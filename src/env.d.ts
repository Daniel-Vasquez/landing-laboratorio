declare namespace App {
  interface Locals {
    /** Inyectado por src/middleware.ts en cada request con renderizado on-demand. */
    user: { id: string; name: string; email: string } | null;
    session: { id: string; expiresAt: Date } | null;
  }
}
