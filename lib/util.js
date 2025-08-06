// OpsRocket Server Utilities
// Copyright (c) 2019 - 2025 PixlCore LLC
// Released under the PixlCore Sustainable Use License.
// See the LICENSE.md file in this repository.

const cp = require('child_process');
const assert = require("assert");
const async = require("async");
const WebSocket = require('ws');
const Tools = require("pixl-tools");
const jexl = require('jexl');

jexl.addFunction('min', Math.min);
jexl.addFunction('max', Math.max);
jexl.addFunction('bytes', function(value) { return Tools.getTextFromBytes( parseInt(value) ); } );
jexl.addFunction('number', function(value) { return (new Intl.NumberFormat()).format(value || 0); } );
jexl.addFunction('pct', function(value) { return Tools.pct( value, 100 ); } );
jexl.addFunction('integer', function(value) { return parseInt(value); } );
jexl.addFunction('float', function(value) { return Tools.shortFloat(value); } );

jexl.addFunction('find', function(coll, key, value) {
	// find object in array by substring match in given key
	return coll.filter( function(item) { return !!(''+item[key]).includes(value); } );
});

class Util {
	
	messageSub(text, data, undef = "", filter = null) {
		// perform placeholder substitution on all {{macros}} and run each through jexl
		return text.replace(/\{\{(.+?)\}\}/g, function(m_all, m_g1) {
			var value = '';
			try { value = jexl.evalSync( m_g1, data ); }
			catch (err) { value = '(ERROR)'; }
			if (value === undefined) value = undef;
			if (filter) value = filter(value);
			return value;
		});
	}
	
	cleanFilename(filename) {
		// clean up filename, converting all but safe characters to underscores
		return filename.replace(/[^\w\-\+\.\,\s\(\)\[\]\{\}\'\"\!\&\^\%\$\#\@\*\?\~]+/g, '_');
	}
	
	cleanURLFilename(filename) {
		// clean filename for use in URLs, convert bad chars to underscores, and convert to lower-case
		return filename.replace(/[^\w\-\.]+/g, '_').toLowerCase();
	}
	
}; // class Util

module.exports = Util;
