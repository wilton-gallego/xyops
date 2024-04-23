// Orchestra Monitoring Layer
// Copyright (c) 2022 - 2024 Joseph Huckaby

const fs = require('fs');
const zlib = require('zlib');
const Path = require('path');
const cp = require('child_process');
const async = require("async");
const Tools = require("pixl-tools");
const PixlMail = require('pixl-mail');

class Monitoring {
	
	systems = [
		{
			id: "hourly",
			date_format: "[yyyy]/[mm]/[dd]/[hh]",
			epoch_div: 60, // 1 sample per minute
			single_only: true
		},
		{
			id: "daily",
			date_format: "[yyyy]/[mm]/[dd]",
			epoch_div: 120, // 2 min =~ 720 samples per day
		},
		{
			id: "monthly",
			date_format: "[yyyy]/[mm]",
			epoch_div: 3600 // 1 hour =~ 720 samples per month
		},
		{
			id: "yearly",
			date_format: "[yyyy]",
			epoch_div: 43200 // 12 hours =~ 730 pixels per year
		}
	];
	
	setupMonitoring() {
		// setup monitoring system (called when we become master)
		var self = this;
		
		this.contribCache = {};
		this.quickMonCache = {};
		
		// recover / resume tracking all active alerts
		this.unbase.search( 'alerts', 'active:true', {}, function(err, data) {
			if (err || !data.records || !data.records.length) return;
			
			data.records.forEach( function(alert) {
				var global_id = alert.alert + '-' + alert.server;
				self.logDebug(5, "Resuming tracking active alert: " + global_id, alert);
				self.activeAlerts[ global_id ] = alert;
			} );
		});
		
		this.server.on('minute', function(dargs) {
			self.summarizeMinuteData(dargs);
			
			// broadcast server update to all clients
			self.doUserBroadcastAll('update', { servers: self.servers });
			
			// check for stale alerts
			self.cleanupGlobalAlerts();
		} );
	}
	
	handleMonitoringData(socket, params) {
		// incoming monitoring data from worker server (i.e. performa)
		var self = this;
		var server = socket.server;
		var time_code = Math.floor( params.date / 60 );
		
		// ignore dupes in same minute for same server
		if (server.last_time_code && (time_code == server.last_time_code)) {
			this.logDebug(7, "Ignoring dupe monitoring data submission in same minute", { id: server.id });
			return;
		}
		server.last_time_code = time_code;
		
		this.logDebug(9, "Processing monitoring data submission from: " + server.hostname, { id: server.id } );
		
		// augment with current server IP address, for record keeping
		params.ip = socket.ip;
		
		// always use master server time, in case of clock drift
		params.date = Tools.timeNow(true);
		
		// normalize hostname for storage (and sanity)
		params.hostname = this.storage.normalizeKey( server.hostname ).replace(/\//g, '');
		params.group = this.storage.normalizeKey( server.group );
		
		var monitor_defs = this.monitors;
		var alert_defs = this.alerts;
		var group_defs = this.groups;
		var group_def = Tools.findObject( group_defs, { id: params.group });
		
		// group may have been deleted
		if (!group_def) {
			this.logDebug(7, "Group not found: " + params.group + ", ignoring server monitor submission from: " + server.id);
			return;
		}
		
		// resolve monitor data values
		var data = {};
		var delta_defs = [];
		
		// store computed monitor values in params.data, so alerts can refer to them
		params.data.monitors = {};
		params.data.deltas = {};
		
		monitor_defs.forEach( function(mon_def) {
			if (mon_def.groups && mon_def.groups.length && !mon_def.groups.includes(params.group)) return;
			
			var exp = Tools.sub( mon_def.source, params.data, false, "0" );
			var value = 0;
			
			// support custom data_match regexp to extract value out of string
			if (mon_def.data_match) {
				var matches = exp.match( mon_def.data_match );
				if (matches && (matches.length >= 2)) {
					// data_match has a group capture, use first group
					value = matches[1];
				}
				else if (matches) {
					// just grab entire match (no group)
					value = matches[0];
				}
				else {
					self.logError('submit', "Custom data regular expression did not match", {
						monitor: mon_def,
						hostname: params.hostname,
						raw_value: value
					});
					value = 0;
				}
			} // data_match
			else {
				// no data match, evaluate expression
				try { value = self.evalExpr( exp ); }
				catch (err) {
					self.logDebug(7, "Monitor expression failed to evaluate: " + err, {
						monitor: mon_def,
						hostname: params.hostname,
						expression: exp
					});
				}
			}
			
			switch (mon_def.data_type) {
				case 'integer': 
				case 'bytes':
				case 'seconds':
				case 'milliseconds':
					value = parseInt(value) || 0; 
				break;
				
				default: 
					value = parseFloat(value) || 0; 
				break;
			} // data_type
			
			// manipulate value (currently unused)
			if (mon_def.multiply) value *= mon_def.multiply;
			else if (mon_def.divide) value /= mon_def.divide;
			
			data[ mon_def.id ] = params.data.monitors[ mon_def.id ] = value;
			
			if (mon_def.delta) {
				// data will temporarily have the absolute counter, 
				// just until delta_defs is processed below
				delta_defs.push( mon_def );
			}
		} ); // foreach monitor
		
		var host_data = null;
		var host_key = 'hosts/' + server.id + '/data';
		params.alerts = {};
		
		// check for alert snooze
		var alerts_snoozed = false;
		if (this.state.alert_snooze && (this.state.alert_snooze > Tools.timeNow())) alerts_snoozed = true;
		
		// track alert changes, so we can broadcast to all users
		var alerts_changed = false;
		
		// db operations to send
		var db_actions = [];
		
		async.series(
			[
				function(callback) {
					// lock hostname-based record
					self.storage.lock( host_key, true, callback );
				},
				function(callback) {
					// load host data or create new
					self.storage.get( host_key, function(err, data) {
						if (!data) data = { data: { monitors: {} }, alerts: {} };
						host_data = data;
						callback();
					});
				},
				function(callback) {
					// adjust any monitors that use deltas
					delta_defs.forEach( function(mon_def) {
						// so the idea here is that `host_data.data.monitors` always contains the absolute counter
						// only the sparse `data` object (for the timeline) will have the delta
						// this way we can compute the delta each time, using the host_data and incoming data
						if (!(mon_def.id in host_data.data.monitors)) {
							// first time for server, set delta to 0
							// host_data will be saved for next time
							data[ mon_def.id ] = 0;
							return;
						}
						
						var old_value = host_data.data.monitors[ mon_def.id ] || 0;
						var delta = data[ mon_def.id ] - old_value;
						if (!old_value) delta = 0;
						
						if (mon_def.divide_by_delta && host_data.date) {
							var elapsed = (params.date - host_data.date) || 1;
							delta /= elapsed;
						}
						if (delta < 0) delta = 0;
						if (mon_def.data_type.match(/^(integer|bytes|seconds|milliseconds)$/)) {
							delta = Math.floor(delta);
						}
						
						data[ mon_def.id ] = delta;
						params.data.deltas[ mon_def.id ] = delta;
						// Note: params.data.monitors is deliberately NOT overwritten here, 
						// as it needs the absolute value for next time around.
						// But if alerts need to trigger on the delta, they should use [deltas/MONITOR_ID]
					} ); // foreach delta def
					
					// check for alerts
					alert_defs.forEach( function(alert_def) {
						if (alert_def.groups && alert_def.groups.length && !alert_def.groups.includes(params.group)) return;
						
						var exp = Tools.sub( alert_def.expression, params.data, false, "0" );
						
						self.logDebug(9, "Checking alert expression " + exp, {
							alert: alert_def,
							server: server.id,
							hostname: params.hostname,
							expression: exp
						});
						
						var result = null;
						try { result = self.evalExpr( exp ); }
						catch (err) {
							self.logError('submit', "Alert expression failed to evaluate: " + err, {
								alert: alert_def,
								server: server.id,
								hostname: params.hostname,
								expression: exp
							});
						}
						
						if (result === true) {
							params.alerts[ alert_def.id ] = host_data.alerts[ alert_def.id ] || {
								date: params.date,
								exp: exp,
								message: '',
								count: 0,
								notified: false
							};
							
							// recompute message every time, as it may change
							params.alerts[ alert_def.id ].message = self.alertMessageSub( alert_def.message, params.data );
							
							// increase count, stop at def samples
							params.alerts[ alert_def.id ].count++;
							if (params.alerts[ alert_def.id ].count > alert_def.samples) params.alerts[ alert_def.id ].count = alert_def.samples;
							
						} // alert!
						else if (host_data.alerts[ alert_def.id ]) {
							// if previous alert, decrement count
							params.alerts[ alert_def.id ] = host_data.alerts[ alert_def.id ];
							
							// decrease count, stop at 0
							params.alerts[ alert_def.id ].count--;
							if (params.alerts[ alert_def.id ].count < 0) params.alerts[ alert_def.id ].count = 0;
						}
					} ); // foreach alert def
					
					// check for alert state changes
					Object.keys(params.alerts).forEach( function(key) {
						var alert = params.alerts[key];
						var alert_def = Tools.findObject( alert_defs, { id: key } );
						var global_id = server.id + '-' + alert_def.id;
						
						if ((alert.count == alert_def.samples) && !alert.notified) {
							alert.notified = true;
							
							// send new notification
							self.logTransaction('alert_new', "New alert for: " + params.hostname + ": " + alert_def.title, { 
								def: alert_def, 
								alert: alert,
								hostname: params.hostname 
							});
							
							if (!group_def.mute_alerts && alert_def.enabled && !alerts_snoozed) {
								// notifications are enabled for alert and group
								self.sendAlertNotification({
									template: "alert_new",
									alert_def: alert_def,
									params: params,
									server: server,
									alert: alert
								});
							} // notifications enabled
							
							// store new alerts in params so timeline can use it
							if (!params.new_alerts) params.new_alerts = {};
							params.new_alerts[key] = true;
							
							// add alert to master catalogue
							var global_alert = self.activeAlerts[ global_id ] = Tools.mergeHashes( alert, {
								id: Tools.generateShortID('a'),
								active: true,
								alert: alert_def.id,
								server: server.id,
								group: server.group,
								modified: params.date
							} );
							alerts_changed = true;
							
							// add active jobs to alert
							var jobs = self.findActiveJobs({ state: 'active', remote: true, server: server.id });
							global_alert.jobs = jobs.map( function(job) { return job.id } );
							
							// insert into db
							// self.unbase.insert( 'alerts', global_alert.id, global_alert );
							db_actions.push({ func: 'insert', args: ['alerts', global_alert.id, global_alert] });
							
							// optionally abort all jobs on server
							if (alert_def.abort_jobs) {
								jobs.forEach( function(job) {
									self.abortJob(job, "Alert Triggered: " + alert_def.title);
								} );
							}
						}
						else if (!alert.count && alert.notified) {
							// send cleared notification
							self.logTransaction('alert_cleared', "Alert cleared: " + params.hostname + ": " + alert_def.title, { 
								def: alert_def, 
								alert: alert,
								hostname: params.hostname 
							});
							
							if (group_def.alerts_enabled && alert_def.enabled && !alerts_snoozed) {
								self.sendAlertNotification({
									template: "alert_cleared",
									alert_def: alert_def,
									params: params,
									server: server,
									alert: alert,
									elapsed: Tools.timeNow(true) - alert.date
								});
							} // alert enabled
							
							// clear alert in db
							var global_alert = self.activeAlerts[ global_id ];
							if (global_alert && global_alert.id) {
								// self.unbase.update( 'alerts', global_alert.id, { active: false, modified: params.date } );
								db_actions.push({ func: 'update', args: ['alerts', global_alert.id, { active: false, modified: params.date }] });
							}
						}
						
						// keep global alert fresh, so it doesn't expire
						if (self.activeAlerts[ global_id ]) {
							self.activeAlerts[ global_id ].modified = params.date;
							self.activeAlerts[ global_id ].message = alert.message;
						}
						
						// cleanup dead alerts
						if (!alert.count) {
							delete params.alerts[key];
							delete self.activeAlerts[ global_id ];
							alerts_changed = true;
						}
					}); // foreach alert
					
					process.nextTick(callback);
				},
				function(callback) {
					// send all db calls now
					async.eachSeries( db_actions, function(item, callback) {
						self.unbase[ item.func ].apply( self.unbase, item.args.concat(callback) );
					}, callback );
				},
				function(callback) {
					// add / merge into all timelines
					async.eachSeries( self.systems,
						function(sys, callback) {
							self.processSystem({
								sys: sys,
								server: server,
								params: params,
								data: data
							}, callback);
						},
						callback
					);
				},
				function(callback) {
					// broadcast alert changes
					if (alerts_changed) {
						self.doUserBroadcastAll('update', { activeAlerts: self.activeAlerts });
					}
					
					// update server cpu/mem data in RAM
					server.info.cpu = params.data.cpu;
					server.info.memory = params.data.memory;
					server.info.process = params.data.process;
					
					// TODO: broadcast server update to applicable pages, such as #Server?id=HOST or #Group containing host
					
					// write host data back to storage
					host_data = params;
					self.storage.put( host_key, host_data, callback );
					
var temp_file = 'logs/TEMP-MONITORING.json'; // TODO: remove me
fs.writeFileSync( temp_file, JSON.stringify(params, null, "\t") + "\n" );
// self.logDebug(9, "WROTE TEMP MONITORING FILE: " + temp_file );
					
				}
			],
			function(err) {
				// always unlock
				self.storage.unlock( host_key );
				if (err) {
					self.logError('submit', "Failed to submit data: " + (err.message || err), {});
				}
				else {
					self.logDebug(6, "Data submission complete for: " + params.hostname, { id: server.id });
				}
				
				// see if we need a snapshot
				var take_snap = false;
				
				if (params.new_alerts) {
					take_snap = true;
					params.source = 'alert';
				}
				if (self.state.watches && self.state.watches[server.id] && (self.state.watches[server.id] >= params.date)) {
					// TODO: redesign this?  At least, we need a better way to say "gimme snapshot NOW", i.e. not having to wait a minute.
					take_snap = true;
					params.source = 'watch';
				}
				
				if (take_snap) {
					self.saveSnapshot( server, params );
				}
			}
		); // async.series
	}
	
	processSystem(args, callback) {
		// process data submission into a single system (daily, monthly or yearly)
		var self = this;
		var { sys, server, params, data } = args;
		
		var epoch = params.date;
		var epoch_div = Math.floor( epoch / sys.epoch_div );
		var timeline_key = 'timeline/' + sys.id + '/' + server.id + '/' + Tools.formatDate( epoch, sys.date_format );
		var update_data = null;
		
		async.series(
			[
				function(callback) {
					// first, load last list item to see if epoch_div matches
					self.storage.listGet( timeline_key, -1, 1, function(err, items, list) {
						// construct cache key for hostname
						var host_cache_key = server.id;
						
						// make sure host's contribution is accounted for
						if (!self.contribCache[sys.id]) self.contribCache[sys.id] = {};
						self.contribCache[ sys.id ][ host_cache_key ] = 1;
						
						if (items && items.length && (items[0].epoch_div == epoch_div)) {
							// final record matches epoch, we will merge
							update_data = items[0];
							
							// if system is marked as `single_only` call this an error
							// i.e. this is for when we have two servers with the same id submitting data at the same time
							if (sys.single_only) {
								return callback( new Error("Double submission in same minute for hostname: " + params.hostname) );
							}
						}
						else if (items && items.length && (items[0].epoch_div > epoch_div)) {
							// sanity check: this should NEVER happen
							return callback( new Error("Timeline out of order: Cannot submit " + epoch_div + " after " + items[0].epoch_div + " into " + timeline_key) );
						}
						callback();
					});
				},
				function(callback) {
					// push or merge
					if (update_data) {
						// merge data into record (same divided timestamp)
						for (var key in data) {
							if (key in update_data.totals) {
								if ((typeof(data[key]) == 'number') && (typeof(update_data.totals[key]) == 'number')) {
									update_data.totals[key] += data[key];
								}
								else update_data.totals[key] = data[key];
							}
							else update_data.totals[key] = data[key];
						}
						update_data.count++;
						
						// merge in new alerts
						if (params.new_alerts) {
							if (!update_data.alerts) update_data.alerts = {};
							Tools.mergeHashInto( update_data.alerts, params.new_alerts );
						}
						
						self.storage.listSplice( timeline_key, -1, 1, [update_data], callback );
					}
					else {
						// push new
						var item = {
							date: epoch_div * sys.epoch_div,
							epoch_div: epoch_div,
							totals: data,
							count: 1
						};
						
						// include alerts if any new ones just fired
						if (params.new_alerts) {
							item.alerts = params.new_alerts;
						}
						
						self.storage.listPush( timeline_key, item, function(err, list) {
							if (err) return callback(err);
							
							if ((list.length == 1) && self.config.get('expiration')) {
								// we just created the list, so set its expiration date
								var exp_date = Tools.timeNow() + Tools.getSecondsFromText( self.config.get('expiration') );
								self.storage.expire( timeline_key, exp_date );
							}
							
							callback();
						} ); // listPush
					} // push new
				}
			],
			callback
		); // async.series
	}
	
	sendAlertNotification(args) {
		// send email and/or web hooks for alert (new or clear)
		// args: { template, def, params, alert }
		var self = this;
		var { params, server, alert, alert_def } = args;
		var time_code = Math.floor( alert.date / 60 );
		
		// add config to args
		args.config = this.config.get();
		
		// add nice date/time
		args.date_time = (new Date()).toString();
		
		// upper-case title for emphasis in plain text
		args.title_caps = alert_def.title.toUpperCase();
		
		// nice group title
		var group_defs = this.groups;
		var group_def = Tools.findObject( group_defs, { id: params.group } );
		args.nice_group = group_def.title;
		
		// nice elapsed time, if present
		if (args.elapsed) {
			args.elapsed_nice = Tools.getTextFromSeconds( args.elapsed, false, true );
		}
		
		// nice server info
		args.nice_load_avg = Tools.shortFloat( params.data.load[0] );
		args.nice_mem_total = Tools.getTextFromBytes( params.data.memory.total );
		args.nice_mem_avail = Tools.getTextFromBytes( params.data.memory.available );
		args.nice_uptime = Tools.getTextFromSeconds( params.data.uptime_sec, false, true );
		// args.nice_os = Tools.ucfirst( params.data.platform ) + " " + params.data.release + " (" + params.data.arch + ")";
		args.nice_os = params.data.os.distro + " " + params.data.os.release; //  + " (" + params.data.os.arch + ")";
		args.nice_notes = alert_def.notes || '(None)';
		args.nice_hostname = params.hostname;
		if (args.config.hostname_display_strip) {
			args.nice_hostname = args.nice_hostname.replace( args.config.hostname_display_strip, '' );
		}
		
		// construct URLs to views of server
		args.live_url = args.self_url = this.config.get('base_app_url') + '/#Server?id=' + server.id;
		args.snapshot_url = this.config.get('base_app_url') + '/#Snapshot?id=' + server.id + '/' + time_code;
		
		// construct mailer
		var mail = new PixlMail( this.config.get('smtp_hostname'), this.config.get('smtp_port') || 25 );
		mail.setOptions( this.config.get('mail_options') || {} );
		
		// alert or group may override e-mail address
		args.email_to = alert_def.email || group_def.alert_email || this.config.get('email_to');
		if (args.email_to) {
			// args.template: alert_new, alert_cleared
			// alert_def.title
			// alert_def.email
			// alert_def.web_hook
			// params.hostname
			// alert.exp
			// alert.message
			
			// send it
			mail.send( 'conf/emails/' + args.template + '.txt', args, function(err, raw_email) {
				if (err) {
					var err_msg = "Failed to send alert e-mail: " + args.email_to + ": " + err;
					self.logError( 'mail', err_msg, { text: raw_email } );
					self.logTransaction('warning', err_msg);
				}
				else {
					self.logDebug(5, "Email sent successfully", { text: raw_email } );
				}
			} ); // mail.send
		} // email_to
		
		// construct web hook args
		var hook_args = {
			action: args.template, // alert_new or alert_cleared
			definition: alert_def,
			alert: alert,
			hostname: params.hostname,
			group: params.group,
			live_url: args.live_url,
			snapshot_url: args.snapshot_url
		};
		if (args.template == 'alert_new') {
			hook_args.text = args.config.client.name + " Alert: " + args.nice_hostname + ": " + alert_def.title + ": " + alert.message + " - ([Live View](" + args.live_url + ") - [Snapshot View](" + args.snapshot_url + "))";
		}
		else if (args.template == 'alert_cleared') {
			hook_args.text = args.config.client.name + " Alert Cleared: " + args.nice_hostname + ": " + alert_def.title;
		}
		
		// alert-specific web hook
		var alert_web_hook_url = alert_def.web_hook || group_def.alert_web_hook || '';
		if (alert_web_hook_url) {
			this.logDebug(9, "Firing web hook for alert: " + alert_def.id + ": " + alert_web_hook_url);
			this.request.json( alert_web_hook_url, hook_args, function(err, resp, data) {
				// log response
				if (err) self.logDebug(9, "Alert Web Hook Error: " + alert_web_hook_url + ": " + err);
				else self.logDebug(9, "Alert Web Hook Response: " + alert_web_hook_url + ": HTTP " + resp.statusCode + " " + resp.statusMessage);
			} );
		}
		
		// global web hook for all alerts
		var uni_web_hook_url = this.config.get('alert_web_hook') || '';
		if (uni_web_hook_url) {
			this.logDebug(9, "Firing universal web hook for alert: " + alert_def.id + ": " + uni_web_hook_url);
			this.request.json( uni_web_hook_url, hook_args, function(err, resp, data) {
				// log response
				if (err) self.logDebug(9, "Universal Web Hook Error: " + uni_web_hook_url + ": " + err);
				else self.logDebug(9, "Universal Web Hook Response: " + uni_web_hook_url + ": HTTP " + resp.statusCode + " " + resp.statusMessage);
			} );
		}
		
		// notification channel (new alerts only)
		if (alert_def.channel_id && (args.template == 'alert_new')) {
			var channel = Tools.findObject( this.channels, { id: alert_def.channel_id } );
			if (!channel) self.logDebug(9, "Notification Channel not found for alert: " + alert_def.title + ": " + alert_def.channel_id );
			else if (!channel.enabled) self.logDebug(9, "Notification Channel not enabled for alert: " + alert_def.title + ": " + alert_def.channel_id );
			else {
				this.logDebug(6, "Notifying channel for alert: " + alert.title + ": " + channel.title, channel);
				
				if (channel.email) {
					this.logDebug(9, "Sending email for alert (channel): " + alert_def.title + ": " + channel.email);
					args.email_to = channel.email;
					mail.send( 'conf/emails/' + args.template + '.txt', args, function(err, raw_email) {
						if (err) {
							var err_msg = "Failed to send alert e-mail: " + args.email_to + ": " + err;
							self.logError( 'mail', err_msg, { text: raw_email } );
							self.logTransaction('warning', err_msg);
						}
						else {
							self.logDebug(5, "Email sent successfully", { text: raw_email } );
						}
					} ); // mail.send
				}
				if (channel.web_hook) {
					this.logDebug(9, "Firing web hook for alert (channel): " + alert_def.title + ": " + channel.web_hook);
					this.request.json( channel.web_hook, hook_args, function(err, resp, data) {
						// log response
						if (err) self.logDebug(9, "Alert Web Hook Error: " + channel.web_hook + ": " + err);
						else self.logDebug(9, "Alert Web Hook Response: " + channel.web_hook + ": HTTP " + resp.statusCode + " " + resp.statusMessage);
					} );
				}
				if (channel.run_event) {
					var event = Tools.findObject( this.events, { id: channel.run_event } );
					if (!event) this.logDebug(9, "Event not found for alert/channel: " + channel.run_event);
					else {
						var new_job = Tools.copyHash(event, true);
						new_job.source = 'alert';
						
						this.logDebug(6, "Running event for alert (channel): " + alert_def.title + ": " + event.title, new_job);
						
						this.launchJob(new_job, function(err, id) {
							if (err) self.logError('job', "Failed to launch event for alert (channel): " + alert_def.title + ": " + (err.message || err));
						});
					}
				}
				if (channel.shell_exec) {
					var cmd = Tools.sub( channel.shell_exec, hook_args );
					this.logDebug(9, "Executing shell command for alert (channel): " + alert_def.title + ": " + cmd);
					
					cp.exec( cmd, function(err, stdout, stderr) {
						if (err) self.logDebug(9, "Shell Hook Error: " + cmd + ": " + err);
						else self.logDebug(9, "Shell Hook Completed", { cmd, stdout, stderr } );
					} );
				}
			} // channel go
		} // notify channel
		
		// launch event (new alerts only)
		if (alert_def.run_event && (args.template == 'alert_new')) {
			var event = Tools.findObject( this.events, { id: alert_def.run_event } );
			if (!event) this.logDebug(9, "Event not found for alert: " + alert_def.run_event);
			else {
				var new_job = Tools.copyHash(event, true);
				new_job.source = 'alert';
				
				this.logDebug(6, "Running event for alert: " + alert_def.title + ": " + event.title, new_job);
				
				this.launchJob(new_job, function(err, id) {
					if (err) self.logError('job', "Failed to launch event for alert (channel): " + alert_def.title + ": " + (err.message || err));
				});
			}
		}
	}
	
	saveSnapshot(server, params, callback) {
		// save snapshot of server data
		var self = this;
		if (!callback) callback = function() {};
		
		var snapshot = Tools.mergeHashes(params, {
			id: Tools.generateShortID('sn'),
			server: server.id,
			group: server.group,
			alerts: this.findActiveAlerts({ server: server.id }).map( function(alert) { return alert.id; } ),
			jobs: this.findActiveJobs({ server: server.id, state: 'active' }).map( function(job) { return job.id; } )
		});
		
		this.unbase.insert( 'snapshots', snapshot.id, snapshot, function(err) {
			if (err) return callback(err);
			callback(null, snapshot.id);
		} );
	}
	
	alertMessageSub(text, data) {
		// a special alert-specific wrapper around Tools.sub()
		// which allows special [bytes:PATH] and will convert the PATH value
		// to a human-readable bytes representation, e.g. "4.5 GB"
		var handlers = {
			bytes: function(value) { return Tools.getTextFromBytes( parseInt(value) ); },
			commify: function(value) { return Tools.commify( parseInt(value) ); },
			pct: function(value) { return Tools.pct( value, 100 ); },
			integer: function(value) { return parseInt(value); },
			float: function(value) { return Tools.shortFloat(value); }
		};
		text = text.replace(/\[(\w+)\:([^\]]+)\]/g, function(m_all, m_g1, m_g2) {
			return (m_g1 in handlers) ? handlers[m_g1]( Tools.getPath(data, m_g2) ) : m_all;
		});
		return Tools.sub(text, data);
	}
	
	summarizeMinuteData(dargs) {
		// summarize all data submitted in the last minute
		var self = this;
		var epoch = dargs.epoch - 30; // make absolutely sure this is the *previous* minute
		
		// no submissions?  we're done then
		if (!Tools.numKeys(this.contribCache)) return;
		
		// make copy of hostname cache and clear it, for concurrency
		// (servers will keep submitting while we are summarizing)
		var contrib_cache = Tools.copyHash( this.contribCache, true );
		this.contribCache = {};
		
		// parallelize these up to storage concurrency limit
		async.eachLimit( this.systems, this.storage.concurrency,
			function(sys, callback) {
				self.summarizeMinuteSystem({
					sys: sys,
					epoch: epoch,
					contribs: contrib_cache[ sys.id ],
				}, callback);
			},
			function(err) {
				if (err) {
					self.logError('summary', "Failed to summarize data: " + (err.message || err));
				}
				self.logDebug(9, "Minute summary complete");
			}
		); // async.eachLimit
	}
	
	summarizeMinuteSystem(args, callback) {
		// summarize data for a specific system
		var self = this;
		var sys = args.sys;
		var epoch = args.epoch;
		var epoch_div = Math.floor( epoch / sys.epoch_div );
		var dargs = Tools.getDateArgs( epoch );
		var contribs = args.contribs;
		
		this.logDebug(9, "Summarizing " + sys.id + " system for minute: " + dargs.yyyy_mm_dd + " " + dargs.hh_mi_ss);
		
		if (!contribs || !Tools.numKeys(contribs)) {
			// rare race condition can occur if a server submits metrics at the moment the summarize job starts
			this.logDebug(2, "No hostnames found in cache!  Race condition?  Skipping system: " + sys.id);
			return process.nextTick( callback );
		}
		
		var contrib_key = 'contrib/' + sys.id + '/' + Tools.sub( sys.date_format, dargs );
		var update_data = null;
		var new_record = false;
		
		async.series(
			[
				function(callback) {
					// first, load last list item to see if epoch_div matches
					self.storage.get( contrib_key, function(err, data) {
						if (err || !data) new_record = true;
						update_data = data || { contribs: {} };
						callback();
					});
				},
				function(callback) {
					// merge in new hostnames and save
					var num_additions = 0;
					for (var id in contribs) {
						if (!(id in update_data.contribs)) num_additions++;
					}
					if (num_additions || new_record) {
						Tools.mergeHashInto( update_data.contribs, contribs );
						self.storage.put( contrib_key, update_data, callback );
					}
					else process.nextTick( callback );
				},
				function(callback) {
					// possibly set expiration if new record
					if (new_record && self.config.get('expiration')) {
						// we just created the record, so set its expiration date
						var exp_date = Tools.timeNow() + Tools.getSecondsFromText( self.config.get('expiration') );
						self.storage.expire( contrib_key, exp_date );
					}
					process.nextTick( callback );
				}
			],
			callback
		); // async.series
	}
	
	findActiveAlerts(criteria) {
		// find active alerts matching criteria -- return array
		return Tools.findObjects( Object.values(this.activeAlerts), criteria );
	}
	
	cleanupGlobalAlerts() {
		// expire alerts if they get stale (dead servers, changed groups, etc.)
		var now = Tools.timeNow(true);
		var alerts_changed = false;
		
		for (var key in this.activeAlerts) {
			var alert = this.activeAlerts[key];
			if (now - alert.modified > 90) {
				if (alert.id) this.unbase.update( 'alerts', alert.id, { active: false, modified: now } );
				delete this.activeAlerts[key];
				alerts_changed = true;
			}
		}
		
		if (alerts_changed) {
			this.doUserBroadcastAll('update', { activeAlerts: this.activeAlerts });
		}
	}
	
	handleQuickMonData(socket, data) {
		// process quick (every second) data sent from all servers
		var server = socket.server;
		var mon_defs = this.config.get('quick_monitors');
		var list_max = this.config.get('quick_max') || 60;
		var stub = {
			date: Tools.timeNow(true)
		};
		
		mon_defs.forEach( function(def) {
			var value = Tools.getPath( data, def.source ) || 0;
			if (def.type == 'float') value = Tools.shortFloat(value);
			else value = Math.floor(value);
			stub[ def.id ] = value;
		} );
		
		if (!this.quickMonCache[server.id]) this.quickMonCache[server.id] = [];
		var list = this.quickMonCache[server.id];
		list.push( stub );
		if (list.length > list_max) list.shift();
		
		this.doPageBroadcast('Dashboard', 'quickmon', { id: server.id, row: stub });
		
		// TODO: add doPageBroadcast for #Server, #Group
	}
	
	evalExpr(exp) {
		// evaluate math/logic expression safely
		if (!exp.match(/^[\s\d\.\+\-\*\/\%\(\)\&\|\!\=\<\>]+$/)) throw new Error("Illegal characters in expression: " + exp);
		var func = new Function(`return (${exp});`);
		return func();
	}
	
}; // class Monitoring

module.exports = Monitoring;
