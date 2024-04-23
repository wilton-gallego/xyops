// Orchestra API Layer - Admin
// Copyright (c) 2021 - 2024 Joseph Huckaby
// Released under the MIT License

const fs = require('fs');
const assert = require("assert");
const async = require('async');
const Tools = require("pixl-tools");

class Admin {
	
	api_get_servers(args, callback) {
		// get all servers
		var self = this;
		var params = args.params;
		if (!this.requireMaster(args, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			callback({
				code: 0,
				servers: self.servers,
				masters: self.getMasterPeerData()
			});
		} ); // loaded session
	}
	
	api_get_activity(args, callback) {
		// get rows from activity log (with pagination)
		var self = this;
		var params = args.params;
		if (!this.requireMaster(args, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			self.storage.listGet( 'logs/activity', parseInt(params.offset || 0), parseInt(params.limit || 50), function(err, items, list) {
				if (err) {
					// no rows found, not an error for this API
					return callback({ code: 0, rows: [], list: { length: 0 } });
				}
				
				// success, return rows and list header
				callback({ code: 0, rows: items, list: list });
			} ); // got data
		} ); // loaded session
	}
	
	// TODO: add api_get_master_state, api_update_master_state
	
}; // class Admin

module.exports = Admin;
