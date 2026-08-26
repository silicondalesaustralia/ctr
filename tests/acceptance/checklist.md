# Phase 1 Manual Validation Checklist

- [ ] Browser profile launches correctly
- [ ] Proxy is Australian (when Decodo configured)
- [ ] Locale/timezone match identity region
- [ ] Google loads normally (or mock SERP in dry-run)
- [ ] Search works
- [ ] Target result can be located
- [ ] Organic result click works
- [ ] Target website loads
- [ ] Scrolling works
- [ ] Internal link selection works
- [ ] Session terminates cleanly
- [ ] Profile state persists
- [ ] Logs accurately represent actions
- [ ] CAPTCHA or blocking stops the session without bypass

Run dry-run validation:

```bash
docker compose up -d
npm run experiment:create -- ./experiments/test-001.yml
npm run identities:create -- --count 10
DRY_RUN=true npm run session:test -- --identity au_001 --query "sell eggs from home"
```
