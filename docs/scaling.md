# Overview

Using xyOps on live production?  Got lots of servers?  Please read these best practices for scaling your deployment.

## Upgrade Hardware

More CPU cores, more RAM, helps with lots of servers and/or lots of running jobs.

## Increase Node.js Memory

NODE_MAX_MEMORY environment variable is honored (default 4 GB).

## Increase Storage RAM Cache

Depends on storage engine used, but most likely `Storage.SQLite.cache.maxBytes` and `Storage.SQLite.cache.maxItems`

## Disable QuickMon

Disable config property: `satellite.config.quickmon_enabled`

This will prevent all servers from sending monitoring data every second (and only send every minute).

## Multi-Master Setups

use external shared storage!

## Automated Critical Backups

See [Self-Hosting: Daily Backups](hosting.md#daily-backups) for instructions on setting up nightly backups of critical data.

## Security Checklist

https://github.com/jhuckaby/pixl-server-web#allow_hosts
