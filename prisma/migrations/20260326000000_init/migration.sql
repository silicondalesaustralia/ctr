-- Initial schema migration generated from prisma/schema.prisma
-- Run with: npx prisma migrate deploy

CREATE TYPE "ExperimentStatus" AS ENUM ('draft', 'active', 'paused', 'completed', 'cancelled');
CREATE TYPE "QueryType" AS ENUM ('core', 'close_variation', 'semantic', 'local', 'long_tail');
CREATE TYPE "TreatmentGroup" AS ENUM ('search', 'direct', 'none');
CREATE TYPE "ScheduledSessionStatus" AS ENUM ('scheduled', 'running', 'completed', 'cancelled');
CREATE TYPE "SessionStatus" AS ENUM ('scheduled', 'running', 'completed', 'target_not_found', 'blocked', 'google_error', 'browser_error', 'proxy_error', 'target_error', 'cancelled');
CREATE TYPE "SessionEventType" AS ENUM ('browser_started', 'google_loaded', 'search_entered', 'search_submitted', 'serp_loaded', 'target_found', 'target_clicked', 'landing_loaded', 'scroll', 'internal_click', 'session_completed', 'blocked', 'error');
CREATE TYPE "ProfileProvider" AS ENUM ('gologin', 'multilogin', 'mock');
CREATE TYPE "DeviceClass" AS ENUM ('desktop', 'mobile');
