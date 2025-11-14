# Command Line

Here are all the xyOps services available to you on the command line.  Most of these are accessed via the following shell script:

```
/opt/xyops/bin/control.sh [COMMAND]
```

Here are all the accepted commands:

| Command | Description |
|---------|-------------|
| `start` | Starts xyOps in daemon mode. See [Starting and Stopping](CommandLine.md#starting-and-stopping). |
| `stop` | Stops the xyOps daemon and waits for exit. See [Starting and Stopping](CommandLine.md#starting-and-stopping). |
| `restart` | Calls `stop`, then `start`, in sequence. See [Starting and Stopping](CommandLine.md#starting-and-stopping).  |
| `status` | Checks whether xyOps is currently running. See [Starting and Stopping](CommandLine.md#starting-and-stopping).  |
| `admin` | Creates new emergency admin account (specify user / pass). See [Recover Admin Access](CommandLine.md#recover-admin-access). |
| `grant` | Manually grant a privilege to a user: `bin/control.sh grant USERNAME PRIVILEGE_ID`. |
| `revoke` | Manually revoke a privilege from a user: `bin/control.sh revoke USERNAME PRIVILEGE_ID`. |
| `upgrade` | Upgrades xyOps to the latest stable (or specify version). See [Upgrading xyOps](CommandLine.md#upgrading-xyops). |
| `version` | Outputs the current xyOps package version and exits. |
| `help` | Displays a list of available commands and exits. |

## Starting and Stopping

To start the service, use the `start` command:

```
/opt/xyops/bin/control.sh start
```

And to stop it, the `stop` command:

```
/opt/xyops/bin/control.sh stop
```

You can also issue a quick stop + start with the `restart` command:

```
/opt/xyops/bin/control.sh restart
```

The `status` command will tell you if the service is running or not:

```
/opt/xyops/bin/control.sh status
```

## Environment Variables

xyOps supports a special environment variable syntax, which can specify command-line options as well as override any configuration settings.  The variable name syntax is `XYOPS_key` where `key` is one of several command-line options (see table below) or a JSON configuration property path.  These can come in handy for automating installations, and using container systems.  

For overriding configuration properties with environment variable, you can specify any top-level JSON key from `config.json`, or a *path* to a nested property using double-underscore (`__`) as a path separator.  For boolean properties, you can specify `1` for true and `0` for false.  Here is an example of some of the possibilities available:

| Variable | Sample Value | Description |
|----------|--------------|-------------|
| `XYOPS_foreground` | `1` | Run xyOps in the foreground (no background daemon fork). |
| `XYOPS_echo` | `1` | Echo the event log to the console (STDOUT), use in conjunction with `XYOPS_foreground`. |
| `XYOPS_color` | `1` | Echo the event log with color-coded columns, use in conjunction with `XYOPS_echo`. |
| `XYOPS_base_app_url` | `http://xyops.mycompany.com` | Override the [base_app_url](configuration.md#base_app_url) configuration property. |
| `XYOPS_email_from` | `xyops@mycompany.com` | Override the [email_from](configuration.md#email_from) configuration property. |
| `XYOPS_secret_key` | `CorrectHorseBatteryStaple` | Override the [secret_key](configuration.md#secret_key) configuration property. |
| `XYOPS_WebServer__port` | `80` | Override the `port` property *inside* the [WebServer](configuration.md#webserver) object. |
| `XYOPS_WebServer__https_port` | `443` | Override the `https_port` property *inside* the [WebServer](configuration.md#webserver) object. |
| `XYOPS_Storage__Filesystem__base_dir` | `/data/xyops` | Override the `base_dir` property *inside* the [Filesystem](configuration.md#storage-filesystem) object *inside* the [Storage](configuration.md#storage) object. |

Almost every [configuration property](configuration.md) can be overridden using this environment variable syntax.  The only exceptions are things like arrays, e.g. [log_columns](configuration.md#log_columns).

## Recover Admin Access

Lost access to your admin account?  You can create a new temporary administrator account on the command-line.  Just execute this command on your primary server:

```
/opt/xyops/bin/control.sh admin USERNAME PASSWORD
```

Replace `USERNAME` with the desired username, and `PASSWORD` with the desired password for the new account.  Note that the new user will not show up in the main list of users in the UI.  But you will be able to login using the provided credentials.  This is more of an emergency operation, just to allow you to get back into the system.  *This is not a good way to create permanent users*.  Once you are logged back in, you should consider creating another account from the UI, then deleting the emergency admin account.

## Server Startup

To register xyOps as a background daemon startup service (so it automatically start on server reboot), type this:

```sh
cd /opt/xyops
npm run boot
```

This is done via the [pixl-boot](https://github.com/jhuckaby/pixl-boot) module, and it supports [Systemd](https://en.wikipedia.org/wiki/Systemd) if available, falling back to [Sysv Init](https://en.wikipedia.org/wiki/Init#SysV-style) or [launchd](https://support.apple.com/guide/terminal/script-management-with-launchd-apdc6c1077b-5d5d-4d35-9c19-60f2397b2369/mac) on macOS.

If you change your mind or want to uninstall xyOps, you can deregister the startup service with this command:

```sh
cd /opt/xyops
npm run unboot
```

**Important Note:** When xyOps starts on server boot, it typically does not have a proper user environment, namely a `PATH` environment variable.  So if your scripts rely on binary executables in alternate locations, e.g. `/usr/local/bin`, you may have to restore the `PATH` and other variables inside your scripts by redeclaring them.

## Upgrading xyOps

To upgrade xyOps, you can use the built-in `upgrade` command:

```
/opt/xyops/bin/control.sh upgrade
```

This will upgrade the app and all dependencies to the latest stable release, if a new one is available.  It will not affect your data storage, users, or configuration settings.  All those will be preserved and imported to the new version.  For multi-server clusters, you'll need to repeat this command on each server.

Alternately, you can specify the exact version you want to upgrade (or downgrade) to:

```
/opt/xyops/bin/control.sh upgrade 1.0.4
```

If you upgrade to the `HEAD` version, this will grab the very latest from GitHub.  Note that this is primarily for developers or beta-testers, and is likely going to contain bugs.  Use at your own risk:

```
/opt/xyops/bin/control.sh upgrade HEAD
```

## Database CLI

xyOps comes with a simple DB CLI from which you can execute raw commands.  The responses are always in JSON format.  This is mainly used for debugging and troubleshooting.  The command is located here:

```
/opt/xyops/bin/db-cli.js COMMAND INDEX ARG1, ARG2, ...
```

To perform a search query on a specific database:

```sh
/opt/xyops/bin/db-cli.js search tickets "status:open"
```

To fetch a single record from a database:

```sh
/opt/xyops/bin/db-cli.js get alerts "amg6sl6z0cc"
```

This is a low-level developer tool, and requires advanced knowledge of the database system in xyOps.  To learn more, see:

- The `/opt/xyops/internal/unbase.json` file, which describes all the database tables in xyOps.
- The [Unbase](https://github.com/jhuckaby/pixl-server-unbase) database system which powers xyOps.
- The [query syntax](https://github.com/jhuckaby/pixl-server-storage/blob/master/docs/Indexer.md#simple-queries) documentation.
