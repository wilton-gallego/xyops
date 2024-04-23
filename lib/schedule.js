// Orchestra Multi-Master Schedule Layer
// Copyright (c) 2022 - 2024 Joseph Huckaby

const fs = require('fs');
const zlib = require('zlib');
const Path = require('path');
const cp = require('child_process');
const async = require("async");
const Tools = require("pixl-tools");

class Scheduler {

	setupScheduler() {
		// start scheduling!
		// called when server becomes master
		this.lastMonthDayCache = {};
		
		this.server.on('minute', this.schedulerMinuteTick.bind(this) );
	}
	
	schedulerMinuteTick(dargs) {
		// a minute has passed!  schedule all the things!
		var self = this;
		
		if (!this.master || this.shut) return;
		if (!this.getState('scheduler/enabled')) {
			this.logDebug(9, "Scheduler is disabled, skipping minute tick");
			return;
		}
		
		var now = Tools.normalizeTime( dargs.epoch, { sec: 0 } );
		var default_tz = this.config.get('tz') || Intl.DateTimeFormat().resolvedOptions().timeZone;
		var days = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
		var formatters = {};
		
		this.logDebug(5, "Ticking scheduler for timestamp: " + (new Date(now * 1000)).toString());
		
		this.events.forEach( function(event) {
			if (!event.enabled) return;
			if (!event.timings || !event.timings.length) return; // on-demand
			
			// check for disabled category
			var category = Tools.findObject( self.categories, { id: event.category } );
			if (!category.enabled) return;
			
			// check for disabled plugin
			var plugin = Tools.findObject( self.plugins, { id: event.plugin } );
			if (!plugin.enabled) return;
			
			// process timings
			var timings = event.timings.filter( function(timing) { return timing.enabled; } );
			var schedules = timings.filter( function(timing) { return (timing.type == 'schedule') || (timing.type == 'single'); } );
			if (!schedules.length) return;
			
			// setup all unique timezones (intl formatters)
			var tzs = {};
			schedules.forEach( function(timing) {
				if (timing.type != 'schedule') return;
				var tz = timing.timezone || default_tz;
				tzs[tz] = true;
				if (tz in formatters) return; // already setup
				
				formatters[tz] = new Intl.DateTimeFormat('en-US', 
					{ year: 'numeric', month: '2-digit', day: 'numeric', weekday: 'long', hour: 'numeric', minute: '2-digit', hourCycle: 'h23', timeZone: tz }
				);
			} );
			
			var ranges = timings.filter( function(timing) { return (timing.type == 'range') || (timing.type == 'blackout'); } );
			var catch_up = Tools.findObject( timings, { type: 'catchup' } );
			var self_destruct = Tools.findObject( timings, { type: 'destruct' } );
			var start_delay = Tools.findObject( timings, { type: 'delay' } );
			var cursor = catch_up ? (self.getState('events/' + event.id + '/cursor') || (now - 60)) : (now - 60);
			var date = new Date();
			var tzargs = {};
			
			while (cursor < now) {
				var scheduled = false;
				
				// advance cursor
				cursor += 60;
				date.setTime( cursor * 1000 );
				
				// convert date to all unique timezones we care about and argify it
				// { month: 11, day: 29, weekday: 2, year: 2022, hour: 22, minute: 29 }
				for (var tz in tzs) {
					tzargs[tz] = {};
					formatters[tz].formatToParts(date).forEach( function(part) {
						if (part.type == 'literal') return;
						if (part.type == 'weekday') tzargs[tz][ part.type ] = days[ part.value ];
						else tzargs[tz][ part.type ] = parseInt( part.value );
					} );
					
					// include reverse-month-day (rday): -1 is last day of month, -2 is 2nd-to-last day, etc.
					tzargs[tz].rday = (tzargs[tz].day - self.getLastDayInMonth( tzargs[tz].year, tzargs[tz].month )) - 1;
				}
				
				schedules.forEach( function(timing) {
					if ((timing.type == 'single') && (timing.epoch == now)) {
						scheduled = 'single';
						return;
					}
					
					if (timing.type != 'schedule') return; // sanity
					var tz = timing.timezone || default_tz;
					var dargs = tzargs[tz];
					
					if (timing.years && timing.years.length && !timing.years.includes(dargs.year)) return;
					if (timing.months && timing.months.length && !timing.months.includes(dargs.month)) return;
					if (timing.days && timing.days.length && !timing.days.includes(dargs.day) && !timing.days.includes(dargs.rday)) return;
					if (timing.weekdays && timing.weekdays.length && !timing.weekdays.includes(dargs.weekday)) return;
					if (timing.hours && timing.hours.length && !timing.hours.includes(dargs.hour)) return;
					if (timing.minutes && timing.minutes.length && !timing.minutes.includes(dargs.minute)) return;
					
					scheduled = 'schedule';
				} ); // foreach schedule
				
				if (!scheduled) continue;
				
				// check ranges
				// (both start/end dates are INCLUSIVE)
				ranges.forEach( function(timing) {
					switch (timing.type) {
						case 'range':
							if (timing.start && (cursor < timing.start)) scheduled = false;
							else if (timing.end && (cursor > timing.end)) scheduled = false;
						break;
						
						case 'blackout':
							if ((cursor >= timing.start) && (cursor <= timing.end)) scheduled = false;
						break;
					}
				} );
				
				if (!scheduled) continue;
				
				// we're go for launch!
				var job = Tools.copyHash(event, true);
				job.now = cursor;
				job.source = 'scheduler';
				if (scheduled === 'single') job.single = true;
				
				// optional start_delay
				if (start_delay && start_delay.duration) {
					job.state = 'start_delay';
					job.until = Tools.timeNow() + start_delay.duration;
				}
				
				self.logDebug(4, "Auto-launching scheduled event: " + event.id + " (" + event.title + ") for timestamp: " + date.toString(), schedules );
				self.launchJob(job);
				
				// bail out of while loop if self-destruct is set
				if (self_destruct) cursor = now;
			} // while cursor
			
			// delete event if self-destruct is set
			if (self_destruct) {
				self.logDebug(6, "Deleting event due to self-destruct: " + event.id);
				
				self.storage.listFindDelete( 'global/events', { id: event.id }, function(err, event) {
					if (err) {
						self.logError('event', "Failed to delete event: " + err);
						return;
					}
					
					self.logDebug(6, "Successfully deleted event: " + event.title, event);
					self.logTransaction('event_delete', event.title, { event: event, reason: 'destruct' });
					
					// cleanup (remove) event state
					self.deleteState( 'events/' + event.id );
					
					// update cache in background
					self.storage.listGet( 'global/events', 0, 0, function(err, items) {
						if (err) {
							// this should never fail, as it should already be cached
							self.logError('storage', "Failed to cache events: " + err);
							return;
						}
						self.events = items;
						self.doUserBroadcastAll('update', { events: items });
					});
				} ); // listFindDelete
			}
			else {
				// update event cursor state
				self.putState( 'events/' + event.id + '/cursor', cursor );
			}
			
		} ); // events.forEach
		
		this.logDebug(9, "Scheduler tick complete");
	}
	
	getLastDayInMonth(year, month) {
		// compute the last day in the month, and cache in RAM
		var cache_key = '' + year + '/' + month;
		if (cache_key in this.lastMonthDayCache) return this.lastMonthDayCache[cache_key];
		
		var last_day = new Date(year, month, 0).getDate();
		this.lastMonthDayCache[cache_key] = last_day;
		
		return last_day;
	}
	
}; // class Scheduler

module.exports = Scheduler;
