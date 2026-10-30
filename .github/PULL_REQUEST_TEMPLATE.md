## Summary

<!-- What changed and why. -->

## Test plan

- [ ] Failing test was written first
- [ ] `pnpm test` and `pnpm typecheck` pass
- [ ] Tenant isolation considered (new `tenant_id` table has forced RLS)
- [ ] No secrets, customer data, or vendor SDK imports outside an adapter
- [ ] Docs updated if a self-hoster or contributor would notice

## Definition of done

- [ ] UI, API and data model updated together when the task has all three
- [ ] Errors are explicit and do not leak other tenants' data
- [ ] Feature flag added if the behaviour is incomplete
