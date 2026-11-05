/** The Supabase Auth admin operations `mos setup` needs. */
export interface AuthAdmin {
  /** Creates a confirmed user, or returns the existing one with that email. */
  ensureUser(email: string, password: string): Promise<{ id: string; created: boolean }>;
  setStaffRole(userId: string, role: "platform_admin"): Promise<void>;
}

export class AuthAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthAdminError";
  }
}

type AdminUser = { id: string; email?: string; app_metadata?: Record<string, unknown> };

/** Supabase Auth admin REST API with the service role key. Server-side only. */
export class SupabaseAuthAdmin implements AuthAdmin {
  constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string,
  ) {}

  private async request<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    const res = await fetch(`${this.url.replace(/\/$/, "")}/auth/v1/admin${path}`, {
      method: init.method,
      headers: {
        apikey: this.serviceRoleKey,
        authorization: `Bearer ${this.serviceRoleKey}`,
        "content-type": "application/json",
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    if (!res.ok) {
      throw new AuthAdminError(`Supabase Auth admin ${init.method} ${path} returned ${res.status}`);
    }
    return (await res.json()) as T;
  }

  private async findByEmail(email: string): Promise<AdminUser | null> {
    for (let page = 1; page <= 50; page += 1) {
      const { users } = await this.request<{ users: AdminUser[] }>(`/users?page=${page}&per_page=100`, {
        method: "GET",
      });
      const match = users.find((u) => u.email?.toLowerCase() === email);
      if (match) return match;
      if (users.length < 100) return null;
    }
    throw new AuthAdminError("Too many users to search; create the admin in the Supabase dashboard");
  }

  async ensureUser(email: string, password: string) {
    const existing = await this.findByEmail(email);
    if (existing) return { id: existing.id, created: false };
    const user = await this.request<AdminUser>("/users", {
      method: "POST",
      body: { email, password, email_confirm: true },
    });
    return { id: user.id, created: true };
  }

  async setStaffRole(userId: string, role: "platform_admin") {
    await this.request(`/users/${userId}`, { method: "PUT", body: { app_metadata: { mos_staff_role: role } } });
  }
}
