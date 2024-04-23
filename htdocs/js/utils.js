// Orchestra Web App - Utils
// Author: Joseph Huckaby
// Copyright (c) 2021 Joseph Huckaby

function get_pretty_int_list(arr, ranges) {
	// compose int array to string using commas + spaces, and
	// the english "and" to group the final two elements.
	// also detect sequences and collapse those into dashed ranges
	if (!arr || !arr.length) return '';
	if (arr.length == 1) return arr[0].toString();
	arr = deep_copy_object(arr).sort( function(a, b) { return a - b; } );
	
	// check for ranges and collapse them
	if (ranges) {
		var groups = [];
		var group = [];
		for (var idx = 0, len = arr.length; idx < len; idx++) {
			var elem = arr[idx];
			if (!group.length || (elem == group[group.length - 1] + 1)) group.push(elem);
			else { groups.push(group); group = [elem]; }
		}
		if (group.length) groups.push(group);
		arr = [];
		for (var idx = 0, len = groups.length; idx < len; idx++) {
			var group = groups[idx];
			if (group.length == 1) arr.push( group[0] );
			else if (group.length == 2) {
				arr.push( group[0] );
				arr.push( group[1] );
			}
			else {
				arr.push( group[0] + ' - ' + group[group.length - 1] );
			}
		}
	} // ranges
	
	if (arr.length == 1) return arr[0].toString();
	return arr.slice(0, arr.length - 1).join(', ') + ' and ' + arr[ arr.length - 1 ];
}

function summarize_event_timings(event) {
	// summarize all event timings from event into human-readable string
	// separate schedule items and options
	var timings = event.timings.filter( function(timing) { return timing.enabled; } );
	var schedules = timings.filter( function(timing) { return !!(timing.type || '').match(/^(schedule|continuous|single)$/); } );
	var parts = (schedules.length == 1) ? [summarize_event_timing(schedules[0])] : schedules.map( summarize_event_timing );
	if (!parts.length) parts.push("On demand");
	var summary = (parts.length == 1) ? parts[0] : (parts.slice(0, parts.length - 1).join(', ') + ', and ' + parts[ parts.length - 1 ]);
	
	var opts = [];
	if (find_object(timings, { type: 'catchup' })) opts.push("Catch-Up");
	if (find_object(timings, { type: 'destruct' })) opts.push("Self-Destruct");
	if (find_object(timings, { type: 'range' })) opts.push("Date Range");
	if (find_object(timings, { type: 'blackout' })) opts.push("Blackout");
	if (find_object(timings, { type: 'delay' })) opts.push("Delay");
	if (opts.length) summary += ' (' + opts.join(', ') + ')';
	
	return summary;
}

function summarize_event_timing(timing, idx) {
	// summarize event timing into human-readable string
	if (timing.type == 'continuous') return "Continuously";
	if (timing.type == 'single') {
		var text = app.formatDate(timing.epoch, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
		return text;
	} // single shot
	
	// years
	var year_str = '';
	if (timing.years && timing.years.length) {
		year_str = get_pretty_int_list(timing.years, true);
	}
	
	// months
	var mon_str = '';
	if (timing.months && timing.months.length) {
		mon_str = get_pretty_int_list(timing.months, true).replace(/(\d+)/g, function(m_all, m_g1) {
			return _months[ parseInt(m_g1) - 1 ][1];
		});
	}
	
	// days
	var mday_str = '';
	if (timing.days && timing.days.length) {
		mday_str = get_pretty_int_list(timing.days, true).replace(/(\-?\d+)/g, function(m_all, m_g1) {
			var result = '';
			switch (m_g1) {
				case '-1': result = 'last day'; break;
				case '-2': result = '2nd last'; break;
				case '-3': result = '3rd last'; break;
				case '-4': result = '4th last'; break;
				case '-5': result = '5th last'; break;
				case '-6': result = '6th last'; break;
				case '-7': result = '7th last'; break;
				default: result = m_g1 + _number_suffixes[ parseInt( m_g1.substring(m_g1.length - 1) ) ]; break;
			}
			return result;
		});
	}
	
	// weekdays	
	var wday_str = '';
	if (timing.weekdays && timing.weekdays.length) {
		wday_str = get_pretty_int_list(timing.weekdays, true).replace(/(\d+)/g, function(m_all, m_g1) {
			return _day_names[ parseInt(m_g1) ] + 's';
		});
		wday_str = wday_str.replace(/Mondays\s+\-\s+Fridays/, 'weekdays');
	}
	
	// hours
	var hour_str = '';
	if (timing.hours && timing.hours.length) {
		hour_str = get_pretty_int_list(timing.hours, true).replace(/(\d+)/g, function(m_all, m_g1) {
			return _hour_names[ parseInt(m_g1) ];
		});
	}
	
	// minutes
	var min_str = '';
	if (timing.minutes && timing.minutes.length) {
		min_str = get_pretty_int_list(timing.minutes, false).replace(/(\d+)/g, function(m_all, m_g1) {
			return ':' + ((m_g1.length == 1) ? ('0'+m_g1) : m_g1);
		});
	}
	
	// construct final string
	var groups = [];
	var mday_compressed = false;
	
	if (year_str) {
		groups.push( 'in ' + year_str );
		if (mon_str) groups.push( mon_str );
	}
	else if (mon_str) {
		// compress single month + single day
		if (timing.months && timing.months.length == 1 && timing.days && timing.days.length == 1) {
			groups.push( 'on ' + mon_str + ' ' + mday_str );
			mday_compressed = true;
		}
		else {
			groups.push( 'in ' + mon_str );
		}
	}
	
	if (mday_str && !mday_compressed) {
		if (mon_str || wday_str) groups.push( 'on the ' + mday_str );
		else groups.push( 'monthly on the ' + mday_str );
	}
	if (wday_str) groups.push( 'on ' + wday_str );
	
	// compress single hour + single minute
	if (timing.hours && timing.hours.length == 1 && timing.minutes && timing.minutes.length == 1) {
		hour_str.match(/^(\d+)(\w+)$/);
		var hr = RegExp.$1;
		var ampm = RegExp.$2;
		var new_str = hr + min_str + ampm;
		
		if (mday_str || wday_str) groups.push( 'at ' + new_str );
		else groups.push( 'daily at ' + new_str );
	}
	else {
		var min_added = false;
		if (hour_str) {
			if (mday_str || wday_str) groups.push( 'at ' + hour_str );
			else groups.push( 'daily at ' + hour_str );
		}
		else {
			// check for repeating minute pattern
			if (timing.minutes && timing.minutes.length) {
				var interval = detect_num_interval( timing.minutes, 60 );
				if (interval) {
					var new_str = 'every ' + interval + ' minutes';
					if (timing.minutes[0] > 0) {
						var m_g1 = timing.minutes[0].toString();
						new_str += ' starting on the :' + ((m_g1.length == 1) ? ('0'+m_g1) : m_g1);
					}
					groups.push( new_str );
					min_added = true;
				}
			}
			
			if (!min_added) {
				if (min_str) groups.push( 'hourly' );
			}
		}
		
		if (!min_added) {
			if (min_str) groups.push( 'on the ' + min_str.replace(/\:00/, 'hour').replace(/\:30/, 'half-hour') );
			else groups.push( 'every minute' );
		}
	}
	
	var text = (typeof(idx) != 'undefined') ? groups.join(' ') : groups.join(', ');
	var output = text;
	if (!idx) output = text.substring(0, 1).toUpperCase() + text.substring(1, text.length);
	if (timing.timezone) output += ' (' + timing.timezone + ')';
	
	return output;
};

function detect_num_interval(arr, max) {
	// detect interval between array elements, return if found
	// all elements must have same interval between them
	if (arr.length < 2) return false;
	// if (arr[0] > 0) return false;
	
	var interval = arr[1] - arr[0];
	for (var idx = 1, len = arr.length; idx < len; idx++) {
		var temp = arr[idx] - arr[idx - 1];
		if (temp != interval) return false;
	}
	
	// if max is provided, final element + interval must equal max
	// if (max && (arr[arr.length - 1] + interval != max)) return false;
	if (max && ((arr[arr.length - 1] + interval) % max != arr[0])) return false;
	
	return interval;
};

// Crontab Parsing Tools
// by Joseph Huckaby, (c) 2015, MIT License

var cron_aliases = {
	jan: 1,
	feb: 2,
	mar: 3,
	apr: 4,
	may: 5,
	jun: 6,
	jul: 7,
	aug: 8,
	sep: 9,
	oct: 10,
	nov: 11,
	dec: 12,
	
	sun: 0,
	mon: 1,
	tue: 2,
	wed: 3,
	thu: 4,
	fri: 5,
	sat: 6
};
var cron_alias_re = new RegExp("\\b(" + hash_keys_to_array(cron_aliases).join('|') + ")\\b", "g");

function parse_crontab_part(timing, raw, key, min, max, rand_seed) {
	// parse one crontab part, e.g. 1,2,3,5,20-25,30-35,59
	// can contain single number, and/or list and/or ranges and/or these things: */5 or 10-50/5
	if (raw == '*') { return; } // wildcard
	if (raw == 'h') {
		// unique value over accepted range, but locked to random seed
		// https://github.com/jhuckaby/Cronicle/issues/6
		raw = min + (parseInt( hex_md5(rand_seed), 16 ) % ((max - min) + 1));
		raw = '' + raw;
	}
	if (!raw.match(/^[\w\-\,\/\*]+$/)) { throw new Error("Invalid crontab format: " + raw); }
	var values = {};
	var bits = raw.split(/\,/);
	
	for (var idx = 0, len = bits.length; idx < len; idx++) {
		var bit = bits[idx];
		if (bit.match(/^\d+$/)) {
			// simple number, easy
			values[bit] = 1;
		}
		else if (bit.match(/^(\d+)\-(\d+)$/)) {
			// simple range, e.g. 25-30
			var start = parseInt( RegExp.$1 );
			var end = parseInt( RegExp.$2 );
			for (var idy = start; idy <= end; idy++) { values[idy] = 1; }
		}
		else if (bit.match(/^\*\/(\d+)$/)) {
			// simple step interval, e.g. */5
			var step = parseInt( RegExp.$1 );
			var start = min;
			var end = max;
			for (var idy = start; idy <= end; idy += step) { values[idy] = 1; }
		}
		else if (bit.match(/^(\d+)\-(\d+)\/(\d+)$/)) {
			// range step inverval, e.g. 1-31/5
			var start = parseInt( RegExp.$1 );
			var end = parseInt( RegExp.$2 );
			var step = parseInt( RegExp.$3 );
			for (var idy = start; idy <= end; idy += step) { values[idy] = 1; }
		}
		else {
			throw new Error("Invalid crontab format: " + bit + " (" + raw + ")");
		}
	}
	
	// min max
	var to_add = {};
	var to_del = {};
	for (var value in values) {
		value = parseInt( value );
		if (value < min) {
			to_del[value] = 1;
			to_add[min] = 1;
		}
		else if (value > max) {
			to_del[value] = 1;
			value -= min;
			value = value % ((max - min) + 1); // max is inclusive
			value += min;
			to_add[value] = 1;
		}
	}
	for (var value in to_del) delete values[value];
	for (var value in to_add) values[value] = 1;
	
	// convert to sorted array
	var list = hash_keys_to_array(values);
	for (var idx = 0, len = list.length; idx < len; idx++) {
		list[idx] = parseInt( list[idx] );
	}
	list = list.sort( function(a, b) { return a - b; } );
	if (list.length) timing[key] = list;
};

function parse_crontab(raw, rand_seed) {
	// parse standard crontab syntax, return timing object
	// e.g. 1,2,3,5,20-25,30-35,59 23 31 12 * *
	// optional 6th element == years
	if (!rand_seed) rand_seed = get_unique_id();
	var timing = {};
	
	// resolve all @shortcuts
	raw = trim(raw).toLowerCase();
	if (raw.match(/\@(yearly|annually)/)) raw = '0 0 1 1 *';
	else if (raw == '@monthly') raw = '0 0 1 * *';
	else if (raw == '@weekly') raw = '0 0 * * 0';
	else if (raw == '@daily') raw = '0 0 * * *';
	else if (raw == '@hourly') raw = '0 * * * *';
	
	// expand all month/wday aliases
	raw = raw.replace(cron_alias_re, function(m_all, m_g1) {
		return cron_aliases[m_g1];
	} );
	
	// at this point string should not contain any alpha characters or '@', except for 'h'
	if (raw.match(/([a-gi-z\@]+)/i)) throw new Error("Invalid crontab keyword: " + RegExp.$1);
	
	// split into parts
	var parts = raw.split(/\s+/);
	if (parts.length > 6) throw new Error("Invalid crontab format: " + parts.slice(6).join(' '));
	if (!parts[0].length) throw new Error("Invalid crontab format");
	
	// parse each part
	if ((parts.length > 0) && parts[0].length) parse_crontab_part( timing, parts[0], 'minutes', 0, 59, rand_seed );
	if ((parts.length > 1) && parts[1].length) parse_crontab_part( timing, parts[1], 'hours', 0, 23, rand_seed );
	if ((parts.length > 2) && parts[2].length) parse_crontab_part( timing, parts[2], 'days', 1, 31, rand_seed );
	if ((parts.length > 3) && parts[3].length) parse_crontab_part( timing, parts[3], 'months', 1, 12, rand_seed );
	if ((parts.length > 4) && parts[4].length) parse_crontab_part( timing, parts[4], 'weekdays', 0, 6, rand_seed );
	if ((parts.length > 5) && parts[5].length) parse_crontab_part( timing, parts[5], 'years', 1970, 3000, rand_seed );
	
	return timing;
};
