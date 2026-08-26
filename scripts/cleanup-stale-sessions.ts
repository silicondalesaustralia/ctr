#!/usr/bin/env node
import { cleanupStaleSessions } from "../src/sessions/session-cleanup.js";

await cleanupStaleSessions();
console.log(JSON.stringify({ ok: true }, null, 2));
