// Orchestra API Layer - Web Hooks
// Copyright (c) 2022 - 2024 Joseph Huckaby
// Released under the MIT License

const fs = require('fs');
const assert = require("assert");
const async = require('async');
const Tools = require("pixl-tools");

class WebHooks {
	
	api_get_web_hooks(args, callback) {
		// get list of all web hooks
		var self = this;
		var params = args.params;
		if (!this.requireMaster(args, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireValidUser(session, user, callback)) return;
			
			self.storage.listGet( 'global/web_hooks', 0, 0, function(err, items, list) {
				if (err) {
					// no items found, not an error for this API
					return callback({ code: 0, rows: [], list: { length: 0 } });
				}
				
				// success, return items and list header
				callback({ code: 0, rows: items, list: list });
			} ); // got web hook list
		} ); // loaded session
	}
	
	api_get_web_hook(args, callback) {
		// get single web hook for editing
		var self = this;
		var params = Tools.mergeHashes( args.params, args.query );
		if (!this.requireMaster(args, callback)) return;
		
		if (!this.requireParams(params, {
			id: /^\w+$/
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireValidUser(session, user, callback)) return;
			
			self.storage.listFind( 'global/web_hooks', { id: params.id }, function(err, item) {
				if (err || !item) {
					return self.doError('web_hook', "Failed to locate web hook: " + params.id, callback);
				}
				
				// success, return item
				callback({ code: 0, web_hook: item });
			} ); // got web hook
		} ); // loaded session
	}
	
	api_create_web_hook(args, callback) {
		// add new web hook
		var self = this;
		var params = args.params;
		if (!this.requireMaster(args, callback)) return;
		
		if (!this.requireParams(params, {
			id: /^\w+$/,
			title: /\S/,
			url: /^https?:\/\/\S+$/i
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireValidUser(session, user, callback)) return;
			if (!self.requirePrivilege(user, 'create_web_hooks', callback)) return;
			
			args.user = user;
			args.session = session;
			
			params.username = user.username;
			params.created = params.modified = Tools.timeNow(true);
			
			// web hook id must be unique
			if (Tools.findObject(self.web_hooks, { id: params.id })) {
				return self.doError('web_hook', "That Web Hook ID already exists: " + params.id, callback);
			}
			
			self.logDebug(6, "Creating new web hook: " + params.title, params);
			
			self.storage.listPush( 'global/web_hooks', params, function(err) {
				if (err) {
					return self.doError('web_hook', "Failed to create web hook: " + err, callback);
				}
				
				self.logDebug(6, "Successfully created web hook: " + params.title, params);
				self.logTransaction('web_hook_create', params.title, self.getClientInfo(args, { web_hook: params }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/web_hooks', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache web_hooks: " + err);
						return;
					}
					self.web_hooks = items;
					self.doUserBroadcastAll('update', { web_hooks: items });
				});
			} ); // listPush
		} ); // loadSession
	}
	
	api_update_web_hook(args, callback) {
		// update existing web hook
		var self = this;
		var params = args.params;
		if (!this.requireMaster(args, callback)) return;
		
		if (!this.requireParams(params, {
			id: /^\w+$/
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireValidUser(session, user, callback)) return;
			if (!self.requirePrivilege(user, 'edit_web_hooks', callback)) return;
			
			args.user = user;
			args.session = session;
			
			params.modified = Tools.timeNow(true);
			
			self.logDebug(6, "Updating web hook: " + params.id, params);
			
			self.storage.listFindUpdate( 'global/web_hooks', { id: params.id }, params, function(err, web_hook) {
				if (err) {
					return self.doError('web_hook', "Failed to update web hook: " + err, callback);
				}
				
				self.logDebug(6, "Successfully updated web hook: " + web_hook.title, params);
				self.logTransaction('web_hook_update', web_hook.title, self.getClientInfo(args, { web_hook: web_hook }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/web_hooks', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache web_hooks: " + err);
						return;
					}
					self.web_hooks = items;
					self.doUserBroadcastAll('update', { web_hooks: items });
				}); // listGet
			} ); // listFindUpdate
		} ); // loadSession
	}
	
	api_delete_web_hook(args, callback) {
		// delete existing web hook
		var self = this;
		var params = args.params;
		if (!this.requireMaster(args, callback)) return;
		
		if (!this.requireParams(params, {
			id: /^\w+$/
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireValidUser(session, user, callback)) return;
			if (!self.requirePrivilege(user, 'delete_web_hooks', callback)) return;
			
			args.user = user;
			args.session = session;
			
			self.logDebug(6, "Deleting web hook: " + params.id, params);
			
			self.storage.listFindDelete( 'global/web_hooks', { id: params.id }, function(err, web_hook) {
				if (err) {
					return self.doError('web_hook', "Failed to delete web hook: " + err, callback);
				}
				
				self.logDebug(6, "Successfully deleted web hook: " + web_hook.title, web_hook);
				self.logTransaction('web_hook_delete', web_hook.title, self.getClientInfo(args, { web_hook: web_hook }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/web_hooks', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache web_hooks: " + err);
						return;
					}
					self.web_hooks = items;
					self.doUserBroadcastAll('update', { web_hooks: items });
				});
			} ); // listFindDelete
		} ); // loadSession
	}
	
	api_test_web_hook(args, callback) {
		// test web hook
		var self = this;
		var params = args.params;
		if (!this.requireMaster(args, callback)) return;
		
		if (!this.requireParams(params, {
			id: /^\w+$/
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireValidUser(session, user, callback)) return;
			if (!self.requirePrivilege(user, 'delete_web_hooks', callback)) return;
			
			args.user = user;
			args.session = session;
			
			var web_hook = Tools.findObject(self.web_hooks, { id: params.id });
			if (!web_hook) return self.doError('web_hook', "Unknown web hook: " + params.id, callback);
			
			// allow params to override
			var combo_hook = Tools.mergeHashes(web_hook, params);
			
			self.logDebug(6, "Testing web hook: " + params.id, combo_hook);
			
			// construct some sample data
			var hook_data = {
				// TODO: WIP
			};
			
			self.fireWebHook(id, hook_data, function(err, result) {
				if (err) {
					
				}
				var {resp, data, perf, url, opts } = result;
			})
		} ); // loadSession
	}
	
}; // class WebHooks

module.exports = WebHooks;
